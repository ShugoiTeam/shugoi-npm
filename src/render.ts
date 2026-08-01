// @ts-nocheck
import crypto, { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, chmodSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MESSAGES, type Locale } from './locales';
import { stripTrace } from './obfuscate';

// ── Token storage ──
const TOKEN_DIR = join(tmpdir(), 'shugoi-render-' + (process.getuid?.() ?? 'x'));
const TOKEN_TTL = 120_000;
const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_TOKEN_READS = 1;


interface StoredEntry { html: string; expiresAt: number; reads: number }
const _memoryStore = new Map<string, StoredEntry>();
const _siteCache = new Map<string, string>();

let _diskEnabled = false;
let _totalBytes = 0;

if (!existsSync(TOKEN_DIR)) {
  try { mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 }); } catch {}
}
try { chmodSync(TOKEN_DIR, 0o700); } catch {}

function tokenFileName(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function startDiskCleanup() {
  setInterval(() => {
    try {
      for (const f of readdirSync(TOKEN_DIR)) {
        const p = join(TOKEN_DIR, f);
        try { if (Date.now() - statSync(p).mtimeMs > TOKEN_TTL) unlinkSync(p); } catch {}
      }
    } catch {}
  }, 30_000).unref();
}

function storeToDisk(token: string, html: string) {
  try { writeFileSync(join(TOKEN_DIR, tokenFileName(token)), html, { encoding: 'utf-8', mode: 0o600 }); } catch {}
}

function readFromDisk(token: string): string | null {
  try {
    const p = join(TOKEN_DIR, tokenFileName(token));
    if (!existsSync(p)) return null;
    return readFileSync(p, 'utf-8');
  } catch { return null; }
}

function dropEntry(token: string) {
  const e = _memoryStore.get(token);
  if (e) _totalBytes -= Buffer.byteLength(e.html, 'utf-8');
  _memoryStore.delete(token);
}

function evictOldest() {
  const first = _memoryStore.keys().next();
  if (first.done) return;
  dropEntry(first.value);
}

export function storeHtml(token: string, html: string, contentReplaceOn?: boolean) {
  if (_diskEnabled) {
    storeToDisk(token, html);
  }
  const size = Buffer.byteLength(html, 'utf-8');
  while ((_memoryStore.size >= MAX_ENTRIES || _totalBytes + size > MAX_TOTAL_BYTES) && _memoryStore.size > 0) {
    evictOldest();
  }
  _memoryStore.set(token, { html, expiresAt: Date.now() + TOKEN_TTL, reads: 0, contentReplaceOn });
  _totalBytes += size;
}

function readFromMemory(token: string): string | null {
  const entry = _memoryStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dropEntry(token);
    return null;
  }
  entry.reads++;
  if (entry.reads > MAX_TOKEN_READS) {
    // Limite atteinte — renderResponseData décidera selon le flag
    return entry.html;
  }
  return entry.html;
}

// ── Render-grant : preuve anti-bypass "token-only" ──
// Le grant est émis par le wlc (/api/v1/wlc) quand le mid est autorisé (whitelisté OU
// whitelist désactivée). Le guard l'obtient APRÈS avoir exécuté le fingerprint et
// l'ajoute à l'URL render. Un bot curl qui extrait le token du challenge sans exécuter
// le JS n'a pas de mid/grant cohérents → render refuse. Signé avec le même secret que
// le token (SHUGOKI_SIGNING_SECRET) → vérifiable localement, sans état partagé.
// Format : base36(timestamp) + ":" + HMAC(secret, "render-grant:mid:token:ip:timestamp").
// Lié au token + IP + TTL (CH-01/02/03). Factorisé pour les adapters Express/Next/Fastify.
const GRANT_TTL_MS = 120_000;

export function verifyRenderGrant(mid: string | undefined, grant: string | undefined, token?: string, ip?: string, expectedSiteKey?: string): boolean {
  const gSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!gSecret) return true; // fail-safe : pas de secret configuré → pas de vérification
  if (!grant || !mid || !/^[a-f0-9]{64}$/.test(mid)) return false;
  const sep = grant.indexOf(':');
  if (sep < 0) return false;
  const ts = grant.slice(0, sep);
  const sig = grant.slice(sep + 1);
  const tsSec = parseInt(ts, 36);
  if (isNaN(tsSec) || Date.now() - tsSec * 1000 > GRANT_TTL_MS) return false;
  // CRITIQUE 1 (§7bis) : le grant est signé AVEC le siteKey du wlc émetteur. Le render
  // vérifie que ce siteKey == le sien — un grant émis par un autre site (whitelist off)
  // pour un token d'ici est refusé même si le token est authentique.
  if (!expectedSiteKey) return false;
  const payload = 'render-grant:' + [expectedSiteKey, mid, token || '', ip || '', ts].join(':');
  const exp = crypto.createHmac('sha256', gSecret).update(payload).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(exp, 'hex')); }
  catch { return false; }
}

export async function renderResponseData(token: string, locale?: Locale, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string): Promise<{ html?: string; error?: string; blocked?: boolean; reason?: string; message?: string; title?: string }> {
  if (!token || token.length < 16 || token.length > 300) return { error: 'not_found' };

  // CRITIQUE 1 (§7bis) : le token a la forme `siteKey:timestamp:nonce:sig`. Le render
  // d'un site ne doit servir que les tokens de SON siteKey — sinon un grant émis par un
  // autre site (whitelist désactivée) serait accepté ici (secret global partagé).
  if (expectedSiteKey) {
    const tokSiteKey = token.split(':')[0];
    if (tokSiteKey !== expectedSiteKey) return { error: 'not_found' };
  }

  // Audit passe 8 : expiration explicite du token, avant même le grant (le chemin mémoire
  // court-circuite verifyTokenAndRead). Un token signé mais daté > TOKEN_TTL est refusé.
  const tokTs = parseInt(token.split(':')[1] || '', 10);
  if (!isNaN(tokTs) && Date.now() - tokTs > TOKEN_TTL) return { error: 'not_found' };

  // Anti-bypass "token-only" : sans grant valide (lié au siteKey), pas de HTML.
  if (!verifyRenderGrant(mid, grant, token, ip, expectedSiteKey)) return { error: 'not_found' };

  // Vérifier le flag en direct depuis l'API interne (pas de cache)
  const contentReplaceOn = await fetchContentReplaceFlag(token, configUrl || 'http://127.0.0.1:3098');

  // 1. Essayer par token (mémoire)
  const memHtml = readFromMemory(token);
  if (memHtml) {
    if (contentReplaceOn) {
      const entry = _memoryStore.get(token);
      if (entry && entry.reads > MAX_TOKEN_READS) {
        dropEntry(token);
        return { error: 'not_found' };
      }
    }
    return { html: memHtml };
  }

  // Fallback : quand contentReplace OFF, on RENVOIE TOUJOURS la HTML
  // peu importe si le token est en mémoire ou pas
  if (!contentReplaceOn) {
    const siteKey = token.split(':')[0];
    let siteHtml = _siteCache.get(siteKey);
    // Si _siteCache est vide (bug module), récupérer depuis n'importe quelle entrée mémoire
    if (!siteHtml) {
      for (const [, entry] of _memoryStore) {
        siteHtml = entry.html;
        if (siteHtml) break;
      }
    }
    if (siteHtml) return { html: siteHtml };
  }

  if (_diskEnabled) {
    const diskHtml = readFromDisk(token);
    if (diskHtml) return { html: diskHtml };
  }

  return verifyTokenAndRead(token, locale);
}

async function fetchContentReplaceFlag(token: string, internalUrl: string, retries = 2): Promise<boolean> {
  try {
    const siteKey = token.split(':')[0];
    if (!siteKey) return false;
    __clearConfigCache();
    const { flags } = await getConfig(siteKey, internalUrl);
    return flags?.enableContentReplacementCheck === true;
  } catch {
    if (retries > 0) return fetchContentReplaceFlag(token, internalUrl, retries - 1);
    return false;
  }
}

function verifyTokenAndRead(token: string, locale?: Locale): { html?: string; error?: string; blocked?: boolean; reason?: string; message?: string; title?: string } {
  const parts = token.split(':');
  if (parts.length !== 4 || parts[3].length !== 64) {
    return { error: 'not_found' };
  }

  const [siteKey, timestamp, nonce, sig] = parts;
  const ts = parseInt(timestamp, 10);

  if (isNaN(ts)) {
    // Pas d'oracle : un timestamp invalide retourne la même erreur qu'un HMAC invalide.
    return { error: 'not_found' };
  }
  // Audit passe 8 : expiration explicite du token (défense en profondeur, en plus du
  // TTL du store). Un token signé mais daté > TOKEN_TTL est refusé, même si son HTML
  // traînait dans le store disque d'un process rejoué.
  if (Date.now() - ts > TOKEN_TTL) {
    return { error: 'not_found' };
  }

  const secret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (secret) {
    const payload = [siteKey, timestamp, nonce].join(':');
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return { error: 'not_found' };
    }
  }

  const fullTokenLookup = token;
  const memHtml = readFromMemory(fullTokenLookup);
  if (memHtml) return { html: memHtml };

  if (_diskEnabled) {
    const diskHtml = readFromDisk(fullTokenLookup);
    if (diskHtml) return { html: diskHtml };
  }

  if (secret) {
    return { error: 'not_found' };
  }

  return { error: 'not_found' };
}

export async function handleRender(token: string, res: { setHeader?: (k: string, v: string) => void; send?: (body: string) => void; end?: (body: string) => void }, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string) {
  const data = await renderResponseData(token, undefined, configUrl, mid, grant, ip, expectedSiteKey);
  if (data.html && mid) data.html = injectNoticeScript(data.html, mid, expectedSiteKey || token.split(':')[0]);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader('Content-Type', 'application/json');
  if (res.send) res.send(json);
  else if (res.end) res.end(json);
}

// Notice de consentement injectée DANS le HTML rendu (après le split-render).
// L'ack est UNIQUEMENT serveur (lié au machineId) : la popup vérifie /notice côté
// client et s'affiche seulement si le machineId n'a pas déjà acké. Au clic OK, elle
// POST /notice puis se ferme. Injectée ici (dans le render) plutôt que dans le skeleton
// car document.write du render détruirait une popup posée avant.
const NOTICE_SCRIPT = `
<script>
(function(){
  var mid=window.__sg_mid||'';
  var sk=window.__sg_siteKey||'';
  if(!mid||!sk||window.__sg_noticeEnabled===false)return;
  var base=window.__sg_baseUrl||'';
  var origin=base.replace(/\\/api\\/v1\\/?$/,'');
  function ack(){try{fetch(base+'/notice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({machineId:mid,siteKey:sk}),keepalive:true,signal:AbortSignal.timeout(4000)}).catch(function(){})}catch(e){}}
  function build(){var o=document.createElement('div');o.id='__sg_o';o.style.cssText='position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(0,0,0,.6)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:1.2rem!important';var c=document.createElement('div');c.id='__sg_cd';c.style.cssText='background:#fff!important;border:4px solid #000!important;border-radius:28px 6px 32px 10px!important;box-shadow:14px 14px 0 #000!important;padding:0!important;max-width:720px!important;width:100%!important;text-align:center!important;font-family:Arial,sans-serif!important;display:flex!important;overflow:hidden!important';c.innerHTML='<div style="flex:0 0 320px;display:flex;align-items:center;justify-content:center;padding:1.5rem 1rem 1.5rem 3rem;overflow:hidden"><img src="'+origin+'/favicon.png" alt="" style="width:100%;height:auto;max-width:220px;pointer-events:none"></div><div style="flex:1;padding:1.6rem 1.8rem;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"><img src="'+origin+'/brand-block.png" alt="Shugoi" style="display:block;margin:0 0 .3rem;pointer-events:none;max-width:100%;height:auto;max-height:40px"><div style="border:2px solid #000;display:inline-block;border-radius:8px 2px 12px 4px;padding:.2rem .6rem;font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:.6rem">Protection anti-abus</div><p style="font-size:.8rem;color:#555;line-height:1.7;margin:0 .4rem .6rem;max-width:280px">Ce site utilise Shugoi pour se prot\\u00e9ger contre les abus et la fraude. Des caract\\u00e9ristiques techniques de votre navigateur sont analys\\u00e9es pour d\\u00e9tecter les scripts automatis\\u00e9s, Tor, les VPN et les environnements virtuels. Aucune donn\\u00e9e personnelle n\\'est collect\\u00e9e.</p><button id="__sg_ok" style="background:#E87090;color:#fff;border:3px solid #000;border-radius:12px 3px 14px 5px;padding:.35rem 1.4rem;font-size:.8rem;font-weight:700;cursor:pointer">OK</button><div style="margin-top:.5rem;font-size:.5rem;color:#ccc"><a href="'+origin+'/legal/shugoi-notice" target="_blank" style="color:#E87090;text-decoration:underline">En savoir plus \\u00b7 shugoi.com</a></div></div>';o.appendChild(c);document.documentElement.appendChild(o);document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';var ok=document.getElementById('__sg_ok');if(ok)ok.onclick=function(){ack();var el=document.getElementById('__sg_o');if(el&&el.parentNode)el.parentNode.removeChild(el);document.body.style.overflow='';document.documentElement.style.overflow=''};}
  function show(){if(document.body)build();else if(document.addEventListener)document.addEventListener('DOMContentLoaded',build);else setTimeout(show,50)}
  fetch(base+'/notice?machineId='+encodeURIComponent(mid)+'&siteKey='+encodeURIComponent(sk),{signal:AbortSignal.timeout(4000)}).then(function(r){return r.json()}).then(function(d){if(!d.acknowledged)show()}).catch(function(){show()});
})();
</script>`;

function injectNoticeScript(html: string, mid: string, siteKey: string): string {
  const inject = NOTICE_SCRIPT
    .replace('var mid=window.__sg_mid||\'\';', 'var mid=' + JSON.stringify(mid) + '||\'\';')
    .replace('var sk=window.__sg_siteKey||\'\';', 'var sk=' + JSON.stringify(siteKey) + '||\'\';')
    .replace('window.__sg_noticeEnabled', 'window.__sg_noticeEnabled');
  if (html.includes('</body>')) return html.replace('</body>', inject + '</body>');
  return html + inject;
}

// ── Signing ──
export function signToken(siteKey: string, timestamp: number, secretOverride?: string): { token: string } {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!secret) return { token: '' };
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = [siteKey, timestamp, nonce].join(':');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { token: payload + ':' + sig };
}

// ── Config cache (whitelist + detection flags) ──
const CONFIG_CACHE_TTL = 30_000;
const CONFIG_STALE_MAX = 600_000;
const CONFIG_FETCH_TIMEOUT = 2_000;
const MAX_TENANTS = 500;

interface ConfigEntry {
  whitelist: string[];
  flags: Record<string, boolean>;
  skipPaths: string[];
  fetchedAt: number;
  inflight: Promise<void> | null;
}

const _configCache = new Map<string, ConfigEntry>();

function configKey(baseUrl: string, siteKey: string): string {
  return baseUrl + '@' + siteKey;
}

function pruneCache<T extends { fetchedAt: number }>(m: Map<string, T>): void {
  if (m.size <= MAX_TENANTS) return;
  const sorted = [...m.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  for (let i = 0; i < sorted.length - MAX_TENANTS; i++) m.delete(sorted[i][0]);
}

async function refreshConfig(siteKey: string, baseUrl: string, entry: ConfigEntry): Promise<void> {
  try {
    const res = await fetch(baseUrl + '/whitelist?key=' + encodeURIComponent(siteKey), {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      entry.whitelist = (data.whitelistedMachines as string[]) || [];
      entry.flags = (data.detectionFlags as Record<string, boolean>) || (data.flags as Record<string, boolean>) || {};
      entry.skipPaths = (data.skipPaths as string[]) || [];
    }
  } catch {}
  entry.fetchedAt = Date.now();
}

export async function getConfig(siteKey: string, baseUrl: string): Promise<{ whitelist: string[]; flags: Record<string, boolean>; skipPaths: string[] }> {
  const key = configKey(baseUrl, siteKey);
  let entry = _configCache.get(key);
  if (!entry) {
    entry = { whitelist: [], flags: {}, skipPaths: [], fetchedAt: 0, inflight: null };
    _configCache.set(key, entry);
    pruneCache(_configCache);
  }

  const age = Date.now() - entry.fetchedAt;

  if (entry.fetchedAt === 0 || age > CONFIG_STALE_MAX) {
    if (!entry.inflight) {
      entry.inflight = refreshConfig(siteKey, baseUrl, entry).finally(() => { entry!.inflight = null; });
    }
    await entry.inflight;
    return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths };
  }

  if (age > CONFIG_CACHE_TTL && !entry.inflight) {
    entry.inflight = refreshConfig(siteKey, baseUrl, entry).finally(() => { entry!.inflight = null; });
    entry.inflight.catch(() => {});
  }

  return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths };
}

export async function fetchWhitelistForSiteKey(siteKey: string, baseUrl: string): Promise<string[]> {
  return (await getConfig(siteKey, baseUrl)).whitelist;
}

export async function fetchConfigForSiteKey(siteKey: string, baseUrl: string): Promise<Record<string, boolean>> {
  return (await getConfig(siteKey, baseUrl)).flags;
}

export function __clearConfigCache(): void { _configCache.clear(); }

// ── Guard cache ──
const GUARD_CACHE_TTL = 300_000;

interface GuardCacheEntry { detect: string | null; guard: string | null; fetching: boolean; queue: Array<() => void>; fetchedAt: number }
const _guardCaches = new Map<string, GuardCacheEntry>();

function cacheKey(baseUrl: string, siteKey: string): string {
  return `${baseUrl}::${siteKey}`;
}

function getCacheEntry(baseUrl: string, siteKey: string): GuardCacheEntry {
  const key = cacheKey(baseUrl, siteKey);
  if (!_guardCaches.has(key)) {
    _guardCaches.set(key, { detect: null, guard: null, fetching: false, queue: [], fetchedAt: 0 });
  }
  return _guardCaches.get(key)!;
}

async function fetchGuardScripts(baseUrl: string, secret?: string, siteKey?: string): Promise<void> {
  const sk = siteKey || 'cache';
  const cache = getCacheEntry(baseUrl, sk);
  if (cache.fetching) return new Promise<void>((resolve) => { cache.queue.push(resolve); });
  cache.fetching = true;
  try {
    const cb = Date.now();
    const sig = secret ? crypto.createHmac('sha256', secret).update(cb.toString()).digest('hex') : '';
    const [dRes, gRes] = await Promise.all([
      fetch(baseUrl + '/guard-detect?key=' + sk + '&raw=1&cb=' + cb + (sig ? '&sig=' + sig : ''), { signal: AbortSignal.timeout(5000) }),
      fetch(baseUrl + '/guard?key=' + sk + '&raw=1&cb=' + cb + (sig ? '&sig=' + sig : ''), { signal: AbortSignal.timeout(5000) }),
    ]);
    const rawDetect = await dRes.text();
    const rawGuard = await gRes.text();
    const seed = cb.toString(36);
    cache.detect = rawDetect;
    cache.guard = rawGuard;
    cache.fetchedAt = Date.now();
  } catch {
    cache.detect = cache.detect || 'console.error("Shugoi guard-detect unavailable")';
    cache.guard = cache.guard || 'console.error("Shugoi guard unavailable")';
  }
  cache.fetching = false;
  cache.queue.forEach((r) => r());
  cache.queue = [];
}

export async function ensureGuardsReady(baseUrl: string, secret?: string, siteKey?: string): Promise<void> {
  const cache = getCacheEntry(baseUrl, siteKey || 'cache');
  if (cache.detect && cache.guard && Date.now() - cache.fetchedAt < GUARD_CACHE_TTL) return;
  await fetchGuardScripts(baseUrl, secret, siteKey);
}

export async function generateSkeleton(siteKey: string, token: string, baseUrl: string, restrictedAccess?: boolean, whitelist?: string[], renderUrl?: string, locale?: Locale, flags?: Record<string, boolean>, clockts?: number): Promise<string> {
  await ensureGuardsReady(baseUrl, undefined, siteKey);
  const rurl = renderUrl || './__shugoi/render';
  const cfg = flags ?? (await getConfig(siteKey, baseUrl)).flags;
  const loc = locale || 'en';
  const msgs = MESSAGES[loc];
  const cache = getCacheEntry(baseUrl, siteKey);
  const fragments: string[] = [];
  fragments.push('window.__sg_siteKey=' + JSON.stringify(siteKey));
  fragments.push('window.__sg_baseUrl=' + JSON.stringify(baseUrl));
  fragments.push('window.__sg_config=' + JSON.stringify(cfg));
  // Nettoie l'URL : retire ?sg_proof de la barre d'adresse (le PoW a été validé serveur).
  // history.replaceState ne recharge pas — le skeleton reste affiché, l'URL devient propre.
  fragments.push("try{if((location.search||'').indexOf('sg_proof=')>=0){history.replaceState(null,'',location.pathname+location.hash)}}catch(e){}");
  // Challenge PoW anti-curl (audit) : salt = HMAC(secret, ts). Le guard le résout en JS
  // et l'envoie au wlc (pow=ts:nonce). curl n'exécute pas le JS → pas de grant.
  const _powTs = Math.floor(Date.now() / 1000);
  const _powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || '';
  const _powSalt = _powSecret ? crypto.createHmac('sha256', _powSecret).update(String(_powTs)).digest('hex') : '';
  fragments.push('window.__sg_pow=' + JSON.stringify({ ts: _powTs, salt: _powSalt, difficulty: 15 }));
  const _ntpDrift = (typeof globalThis !== 'undefined' ? globalThis.__sg_ntpDrift : 0) || 0;
  const _ntpTime = globalThis.__sg_ntpTime || (Date.now() - _ntpDrift);
  const _clockts = clockts || _ntpTime;
  fragments.push('window.__sg_ntp=' + _ntpTime);
  fragments.push('window.__sg_serverTime=' + _clockts);
  fragments.push('window.__sg_clockts=' + _clockts);
  if (!restrictedAccess) fragments.push('window.__sg_disableRestrictedAccess=true');
  // Fusion des guards (audit) : la notice de consentement est désormais intégrée dans
  // guard-detect. Le guard séparé (cache.guard) n'est PLUS injecté — les 2 scripts
  // définissaient chacun window._SG_ST → collision de table → le guard échouait
  // (_SG_ST is not defined) et la popup ne s'affichait jamais.
  if (cache.detect) fragments.push("try{" + cache.detect + "}catch(e){window.__sg_blocked=true}");
  // guard.src.js est conservé (R.export, fingerprint) mais non injecté pour éviter la collision.
  // Locale-aware __sg_showBlock (interpolated at skeleton generation time)
  const jsStr = (s: string) => JSON.stringify(s).slice(1, -1).replace(/</g, '\\x3c');
  const devtoolsMsg = jsStr(msgs.devtoolsBody);
  const tamperTitle = jsStr(msgs.tamperTitle);
  const fbBadge = jsStr(msgs.blockedBadge);
  const fbTitle = jsStr(msgs.blockedTitle);
  fragments.push('window.__sg_showBlock=function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><style>@font-face{font-family:\\x27Alex Brush\\x27;src:url(https://shugoi.com/alex-brush.woff2?v=2) format(\\x27woff2\\x27);font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\\\\x27Segoe UI\\\\x27,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\\x27Alex Brush\\x27,Georgia,\\\\x27Times New Roman\\\\x27,serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon-block.png class=l><img src=https://shugoi.com/brand-block.png class=b><div class=bdg>"+(badge||"' + fbBadge + '")+"</div><h2>"+(title||"' + fbTitle + '")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push('var t="' + token + '"');
  fragments.push('window.__sg_token="' + token + '"');
  fragments.push('var k="' + siteKey + '"');
  fragments.push('var b="' + baseUrl + '"');
  fragments.push('var r="' + rurl + '"');
  /* Remplacement complet du document par le contenu réel, une fois la machine vérifiée.
   *
   * document.write après document.open est le seul moyen de remplacer un document
   * entier en conservant son URL. Les conséquences, documentées dans
   * le README § "Split-Render : ce que cela implique" :
   *   - la page n'est plus éligible au cache arrière/avant (bfcache) ;
   *   - la restauration de défilement natif est perdue → scrollTo(0,0) explicite ;
   *   - DOMContentLoaded se déclenche deux fois ;
   *   - un SPA initialisé dans le squelette perd son état.
   *
   * Alternative écartée : remplacer document.documentElement.innerHTML ne réexécute
   * pas les scripts du document réel, ce qui casse toute page dynamique.
   *
   * Pour éviter ce mécanisme : splitRender: false.
   */
  fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");return}var _g=(window.__sg_grant||"");if(_g){p=p+("&grant="+encodeURIComponent(_g))}var _m=(window.__sg_detectMid||window.__sg_mid||"");if(_m){p=p+("&mid="+encodeURIComponent(_m))}fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(d.error){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '")}else if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('function _sgCl(){try{for(var _i in window){if(_i.indexOf("__sg")===0){window[_i]=null;delete window[_i]}}window._sgLogCP=function(){};window.midHex=function(){};window.rd=function(){};window._gw=function(){};window.applyDecision=function(){};window._D=function(){};window.z=function(f){return f()}}catch(_e){}}_gw(function(){rd(r+"?token="+t,0);setTimeout(_sgCl,1500)})');
  const combinedCode = fragments.join(';');
  let encStr = '';
  for (let i = 0; i < combinedCode.length; i++) encStr += String.fromCodePoint(917504 + combinedCode.charCodeAt(i));
  const decodedCall = "[...'" + encStr + "'].map(x=>String.fromCodePoint(x.codePointAt(0)-917504)).join('')";
  const bootCode = "eval(" + decodedCall + ")";
  return '<script>' + bootCode + '</script>';
}

export async function injectGuardScripts(html: string, siteKey: string, baseUrl: string, whitelist?: string[] | null, restrictedAccess?: boolean, signingSecret?: string, req?: unknown, _allowedOrigins?: string[], locale?: Locale, clockts?: number): Promise<string> {
  await ensureGuardsReady(baseUrl, signingSecret, siteKey);
  const cfgData = await getConfig(siteKey, baseUrl);
  const wl = whitelist ?? cfgData.whitelist;
  const ts = Date.now();
  const signed = signToken(siteKey, ts, signingSecret);
  const configVars: string[] = [];
  if (!restrictedAccess) configVars.push('window.__sg_disableRestrictedAccess=true');
  const configScript = configVars.length ? '<script>' + configVars.join(';') + '</script>' : '';
  let injectedHtml = html;
  const headClose = injectedHtml.indexOf('</head>');
  if (headClose >= 0) injectedHtml = injectedHtml.slice(0, headClose) + configScript + injectedHtml.slice(headClose);
  else if (injectedHtml.includes('<body')) { const bm = injectedHtml.match(/<body[^>]*>/); if (bm) { const at = injectedHtml.indexOf(bm[0]) + bm[0].length; injectedHtml = injectedHtml.slice(0, at) + configScript + injectedHtml.slice(at); } }
  else injectedHtml = configScript + injectedHtml;
  const renderUrl = './__shugoi/render';
  storeHtml(signed.token, injectedHtml);
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, wl, renderUrl, locale, cfgData.flags, clockts);
}

export function enableDiskStore(multiProcess: boolean) {
  _diskEnabled = multiProcess;
  if (multiProcess) startDiskCleanup();
}
