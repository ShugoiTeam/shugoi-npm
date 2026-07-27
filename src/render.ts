// @ts-nocheck
import crypto, { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, chmodSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MESSAGES, type Locale } from './locales';
import { applyObfuscation, stripTrace } from './obfuscate';

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

export async function renderResponseData(token: string, locale?: Locale, configUrl?: string): Promise<{ html?: string; error?: string; blocked?: boolean; reason?: string; message?: string; title?: string }> {
  if (!token || token.length < 16 || token.length > 300) return { error: 'not_found' };

  // Vérifier le flag en direct depuis l'API interne (pas de cache)
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
    return { error: 'expired' };
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

export async function handleRender(token: string, res: { setHeader?: (k: string, v: string) => void; send?: (body: string) => void; end?: (body: string) => void }, configUrl?: string) {
  const data = await renderResponseData(token, undefined, configUrl);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader('Content-Type', 'application/json');
  if (res.send) res.send(json);
  else if (res.end) res.end(json);
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
    cache.detect = applyObfuscation(rawDetect, seed);
    cache.guard = applyObfuscation(rawGuard, seed);
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

export async function generateSkeleton(siteKey: string, token: string, baseUrl: string, restrictedAccess?: boolean, whitelist?: string[], renderUrl?: string, locale?: Locale, flags?: Record<string, boolean>): Promise<string> {
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
  if (!restrictedAccess) fragments.push('window.__sg_disableRestrictedAccess=true');
  if (cache.detect) fragments.push("try{" + cache.detect + "}catch(e){window.__sg_blocked=true}");
  if (cache.guard) fragments.push("try{" + cache.guard + "}catch(e){window.__sg_blocked=true}");
  // Locale-aware __sg_showBlock (interpolated at skeleton generation time)
  const jsStr = (s: string) => JSON.stringify(s).slice(1, -1).replace(/</g, '\\x3c');
  const devtoolsMsg = jsStr(msgs.devtoolsBody);
  const tamperTitle = jsStr(msgs.tamperTitle);
  const fbBadge = jsStr(msgs.blockedBadge);
  const fbTitle = jsStr(msgs.blockedTitle);
  fragments.push('window.__sg_showBlock=function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><style>@font-face{font-family:\\x27Alex Brush\\x27;src:url(/alex-brush.woff2) format(\\x27woff2\\x27);font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\\\\x27Segoe UI\\\\x27,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\\x27Alex Brush\\x27,Georgia,\\\\x27Times New Roman\\\\x27,serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=/favicon-block.png class=l><img src=/brand-block.png class=b><div class=bdg>"+(badge||"' + fbBadge + '")+"</div><h2>"+(title||"' + fbTitle + '")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push('var t="' + token + '"');
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
  fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");return}fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(d.error){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '")}else if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('function _sgCl(){try{for(var _i in window){if(_i.indexOf("__sg")===0){window[_i]=null;delete window[_i]}}window._sgLogCP=function(){};window.midHex=function(){};window.rd=function(){};window._gw=function(){};window.applyDecision=function(){};window._D=function(){};window.z=function(f){return f()}}catch(_e){}}_gw(function(){rd(r+"?token="+t,0);setTimeout(_sgCl,1500)})');
  const combinedCode = fragments.join(';');
  let encStr = '';
  for (let i = 0; i < combinedCode.length; i++) encStr += String.fromCodePoint(917504 + combinedCode.charCodeAt(i));
  const decodedCall = "[...'" + encStr + "'].map(x=>String.fromCodePoint(x.codePointAt(0)-917504)).join('')";
  const bootCode = "eval(" + decodedCall + ")";
  return '<script>' + bootCode + '</script>';
}

export async function injectGuardScripts(html: string, siteKey: string, baseUrl: string, whitelist?: string[] | null, restrictedAccess?: boolean, signingSecret?: string, req?: unknown, _allowedOrigins?: string[], locale?: Locale): Promise<string> {
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
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, wl, renderUrl, locale, cfgData.flags);
}

export function enableDiskStore(multiProcess: boolean) {
  _diskEnabled = multiProcess;
  if (multiProcess) startDiskCleanup();
}
