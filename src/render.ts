// @ts-nocheck
import crypto, { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, chmodSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MESSAGES, type Locale } from './locales';
import { stripTrace } from './obfuscate';
import { NATIVE_BLOCK_PALETTE_SCRIPT } from './block-palette';

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
  // Index O(1) par siteKey pour le fallback contentReplace OFF (évite le scan O(n)
  // de tout le store à chaque render manqué). Toujours frais : écrasé à chaque store.
  const sk = token.split(':')[0];
  if (sk) _siteCache.set(sk, html);
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
const GRANT_TTL_MS = 60_000;

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

export async function renderResponseData(token: string, locale?: Locale, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, _secret?: string): Promise<{ html?: string; error?: string; blocked?: boolean; reason?: string; message?: string; title?: string }> {
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
  const contentReplaceOn = await fetchContentReplaceFlag(token, configUrl || 'http://127.0.0.1:3098', _secret);

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

  // Fallback : quand contentReplace OFF, on RENVOIE la HTML du site (cache O(1)).
  // Plus de scan O(n) de tout le store en cas de miss (ancien code bouclait sur
  // _memoryStore pour "récupérer depuis n'importe quelle entrée" — coûteux et
  // potentiellement cross-site ; _siteCache est alimenté par storeHtml).
  if (!contentReplaceOn) {
    const siteKey = token.split(':')[0];
    const siteHtml = _siteCache.get(siteKey);
    if (siteHtml) return { html: siteHtml };
  }

  if (_diskEnabled) {
    const diskHtml = readFromDisk(token);
    if (diskHtml) return { html: diskHtml };
  }

  return verifyTokenAndRead(token, locale);
}

async function fetchContentReplaceFlag(token: string, internalUrl: string, _secret?: string, retries = 2): Promise<boolean> {
  try {
    const siteKey = token.split(':')[0];
    if (!siteKey) return false;
    // Le flag est lu via getConfig (cache mémoire + stale-refresh en arrière-plan).
    // Pas de __clearConfigCache() ici : purger le cache à CHAQUE render forçait un
    // fetch réseau (~300-400ms) vers l'API interne à chaque requête → render lent.
    const { flags } = await getConfig(siteKey, internalUrl, _secret);
    return flags?.enableContentReplacementCheck === true;
  } catch {
    if (retries > 0) return fetchContentReplaceFlag(token, internalUrl, _secret, retries - 1);
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

// Anti-leak du grant (re-audit 2026-08-03, résidu #2) : le render est appelé avec
// `token` (+ éventuellement `grant`/`mid`) en query string. APRÈS document.write, l'URL
// de la page est l'URL d'origine (le grant n'y est plus) → un referrer strict-origin
// suffit : cross-origin → seul l'ORIGINE est envoyée (jamais le grant, jamais le chemin).
// ⚠️ NE PAS utiliser no-referrer : ça casse les embeds YouTube (erreur 153 —
// "embedder identity missing referrer", YouTube exige un Referrer pour valider l'embedder).
export function injectReferrerPolicy(html: string): string {
  const meta = '<meta name="referrer" content="strict-origin-when-cross-origin">';
  if (html.includes('<head>')) return html.replace('<head>', '<head>' + meta);
  if (html.includes('<html')) {
    const m = html.match(/<html[^>]*>/);
    if (m) return html.replace(m[0], m[0] + meta);
  }
  return meta + html;
}

export async function handleRender(token: string, res: { setHeader?: (k: string, v: string) => void; send?: (body: string) => void; end?: (body: string) => void }, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, baseUrl?: string, _secret?: string) {
  const data = await renderResponseData(token, undefined, configUrl, mid, grant, ip, expectedSiteKey, _secret);
  if (data.html && mid) data.html = injectNoticeScript(data.html, mid, expectedSiteKey || token.split(':')[0], baseUrl);
  if (data.html) data.html = injectReferrerPolicy(data.html);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader('Content-Type', 'application/json');
  // Anti-leak du grant : strict-origin-when-cross-origin (pas no-referrer — casserait
  // les embeds YouTube 153). Cross-origin → origin seule, jamais le grant.
  if (res.setHeader) res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Contenu protégé : JAMAIS mis en cache (round 6, angle cache headers). Un CDN (ex.
  // Cloudflare) ou un proxy qui mettrait en cache la réponse render la servirait sans
  // le grant → le contenu whitelisté fuiterait. no-store sur la réponse ET no-transform
  // (évite qu'un CDN réécrive le HTML rendu).
  if (res.setHeader) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
  if (res.setHeader) res.setHeader('Pragma', 'no-cache');
  // Audits : pose un cookie d'autorisation __sg_authorized quand le render réussit
  // (grant valide + HTML servi). Ce cookie permet ensuite de charger les assets
  // protégés (/assets/*.js) — sans lui, un téléchargement direct du bundle est refusé.
  // Signé avec SHUGOKI_SIGNING_SECRET (jamais exposé), TTL court = durée de session.
  if (data.html && res.setHeader) {
    const authSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
    if (authSecret) {
      const ts = Math.floor(Date.now() / 1000);
      const val = ts + ':' + crypto.createHmac('sha256', authSecret).update('sg_authorized:' + ts).digest('hex');
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', '__sg_authorized=' + val + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=120' + secure);
    }
  }
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
  var _OVERLAY_DESK='position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(0,0,0,.6)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:1.2rem!important;pointer-events:auto!important';
  var _OVERLAY_MOB='position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(0,0,0,.6)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:.6rem!important;pointer-events:auto!important';
  var _CARD_DESK='background:#fffdfa!important;border:1px solid rgba(43,33,29,.16)!important;border-radius:16px 5px 16px 5px!important;box-shadow:0 10px 30px rgba(43,33,29,.08)!important;padding:2.8rem 2.4rem 2.6rem!important;max-width:460px!important;width:100%!important;text-align:center!important;font-family:system-ui,-apple-system,Arial,sans-serif!important';
  var _CARD_MOB='background:#fffdfa!important;border:1px solid rgba(43,33,29,.16)!important;border-radius:14px 4px 14px 4px!important;box-shadow:0 10px 30px rgba(43,33,29,.08)!important;padding:2rem 1.3rem 2.2rem!important;max-width:340px!important;width:100%!important;text-align:center!important;font-family:system-ui,-apple-system,Arial,sans-serif!important';
  var _CARD_DESK_DARK='background:#241a30!important;border:1px solid rgba(241,232,245,.14)!important;border-radius:16px 5px 16px 5px!important;box-shadow:0 10px 30px rgba(0,0,0,.4)!important;padding:2.8rem 2.4rem 2.6rem!important;max-width:460px!important;width:100%!important;text-align:center!important;font-family:system-ui,-apple-system,Arial,sans-serif!important';
  var _CARD_MOB_DARK='background:#241a30!important;border:1px solid rgba(241,232,245,.14)!important;border-radius:14px 4px 14px 4px!important;box-shadow:0 10px 30px rgba(0,0,0,.4)!important;padding:2rem 1.3rem 2.2rem!important;max-width:340px!important;width:100%!important;text-align:center!important;font-family:system-ui,-apple-system,Arial,sans-serif!important';
  var _MOBILE=false;
  function _isMobile(){try{return window.matchMedia&&window.matchMedia('(max-width:640px)').matches}catch(e){return false}}
  _MOBILE=_isMobile();
  var _DARK=false;
  function _isDark(){try{return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){return false}}
  _DARK=_isDark();
  function _OV(){return _MOBILE?_OVERLAY_MOB:_OVERLAY_DESK}
  function _CC(){return _DARK?(_MOBILE?_CARD_MOB_DARK:_CARD_DESK_DARK):(_MOBILE?_CARD_MOB:_CARD_DESK)}
  function _CH(){return _DARK?(_MOBILE?_CARD_HTML_MOB_DARK:_CARD_HTML_DESK_DARK):(_MOBILE?_CARD_HTML_MOB:_CARD_HTML_DESK)}
  var _CARD_HTML_DESK='<img src="'+origin+'/favicon-block.png" alt="" style="width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);filter:drop-shadow(2px 4px 8px rgba(231,112,144,.55));margin:0 auto .6rem;display:block"><img src="'+origin+'/brand-block.png" alt="Shugoi" style="display:block;margin:0 auto .4rem;pointer-events:none;max-width:100%;height:auto"><div style="display:inline-block;background:#fdf0f4;border:1px solid rgba(194,84,111,.35);border-radius:10px 4px 10px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#c2546f;margin-bottom:1.4rem">Protection anti-abus</div><p style="font-size:.9rem;color:#7a6a62;line-height:1.8;max-width:380px;margin:0 auto .9rem">Ce site utilise Shugoi pour se prot\\u00e9ger contre les abus et la fraude. Des caract\\u00e9ristiques techniques de votre navigateur sont analys\\u00e9es pour d\\u00e9tecter les scripts automatis\\u00e9s, Tor, les VPN et les environnements virtuels. Aucune donn\\u00e9e personnelle n\\'est collect\\u00e9e.</p><button id="__sg_ok" style="background:#E87090;color:#fff;border:1px solid #c2546f;border-radius:10px 4px 10px 4px;padding:.55rem 3rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit">OK</button><p style="font-size:.55rem;color:#c2546f;margin-top:1.5rem"><a href="'+origin+'/legal/shugoi-notice" target="_blank" style="color:#c2546f;text-decoration:underline">En savoir plus \\u00b7 shugoi.com</a></p>';
  var _CARD_HTML_MOB='<img src="'+origin+'/favicon-block.png" alt="" style="width:62px;height:62px;pointer-events:none;transform:rotate(-2.5deg);filter:drop-shadow(2px 4px 8px rgba(231,112,144,.55));margin:0 auto .6rem;display:block"><img src="'+origin+'/brand-block.png" alt="Shugoi" style="display:block;margin:0 auto .4rem;pointer-events:none;max-width:100%;height:auto"><div style="display:inline-block;background:#fdf0f4;border:1px solid rgba(194,84,111,.35);border-radius:10px 4px 10px 4px;padding:.3rem .9rem;font-size:.55rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#c2546f;margin-bottom:1.1rem">Protection anti-abus</div><p style="font-size:.85rem;color:#7a6a62;line-height:1.75;max-width:340px;margin:0 auto .8rem">Ce site utilise Shugoi pour se prot\\u00e9ger contre les abus et la fraude. Des caract\\u00e9ristiques techniques de votre navigateur sont analys\\u00e9es pour d\\u00e9tecter les scripts automatis\\u00e9s, Tor, les VPN et les environnements virtuels. Aucune donn\\u00e9e personnelle n\\'est collect\\u00e9e.</p><button id="__sg_ok" style="background:#E87090;color:#fff;border:1px solid #c2546f;border-radius:10px 4px 10px 4px;padding:.5rem 2.4rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit">OK</button><p style="font-size:.55rem;color:#c2546f;margin-top:1.3rem"><a href="'+origin+'/legal/shugoi-notice" target="_blank" style="color:#c2546f;text-decoration:underline">En savoir plus \\u00b7 shugoi.com</a></p>';
  var _CARD_HTML_DESK_DARK='<img src="'+origin+'/favicon-block.png" alt="" style="width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);filter:drop-shadow(2px 4px 8px rgba(231,112,144,.55));margin:0 auto .6rem;display:block"><img src="'+origin+'/brand-block.png" alt="Shugoi" style="display:block;margin:0 auto .4rem;pointer-events:none;max-width:100%;height:auto"><div style="display:inline-block;background:rgba(233,137,159,.16);border:1px solid rgba(233,137,159,.5);border-radius:10px 4px 10px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#e9899f;margin-bottom:1.4rem">Protection anti-abus</div><p style="font-size:.9rem;color:#a795b4;line-height:1.8;max-width:380px;margin:0 auto .9rem">Ce site utilise Shugoi pour se prot\\u00e9ger contre les abus et la fraude. Des caract\\u00e9ristiques techniques de votre navigateur sont analys\\u00e9es pour d\\u00e9tecter les scripts automatis\\u00e9s, Tor, les VPN et les environnements virtuels. Aucune donn\\u00e9e personnelle n\\'est collect\\u00e9e.</p><button id="__sg_ok" style="background:#E87090;color:#fff;border:1px solid #c2546f;border-radius:10px 4px 10px 4px;padding:.55rem 3rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit">OK</button><p style="font-size:.55rem;color:#e9899f;margin-top:1.5rem"><a href="'+origin+'/legal/shugoi-notice" target="_blank" style="color:#e9899f;text-decoration:underline">En savoir plus \\u00b7 shugoi.com</a></p>';
  var _CARD_HTML_MOB_DARK='<img src="'+origin+'/favicon-block.png" alt="" style="width:62px;height:62px;pointer-events:none;transform:rotate(-2.5deg);filter:drop-shadow(2px 4px 8px rgba(231,112,144,.55));margin:0 auto .6rem;display:block"><img src="'+origin+'/brand-block.png" alt="Shugoi" style="display:block;margin:0 auto .4rem;pointer-events:none;max-width:100%;height:auto"><div style="display:inline-block;background:rgba(233,137,159,.16);border:1px solid rgba(233,137,159,.5);border-radius:10px 4px 10px 4px;padding:.3rem .9rem;font-size:.55rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#e9899f;margin-bottom:1.1rem">Protection anti-abus</div><p style="font-size:.85rem;color:#a795b4;line-height:1.75;max-width:340px;margin:0 auto .8rem">Ce site utilise Shugoi pour se prot\\u00e9ger contre les abus et la fraude. Des caract\\u00e9ristiques techniques de votre navigateur sont analys\\u00e9es pour d\\u00e9tecter les scripts automatis\\u00e9s, Tor, les VPN et les environnements virtuels. Aucune donn\\u00e9e personnelle n\\'est collect\\u00e9e.</p><button id="__sg_ok" style="background:#E87090;color:#fff;border:1px solid #c2546f;border-radius:10px 4px 10px 4px;padding:.5rem 2.4rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit">OK</button><p style="font-size:.55rem;color:#e9899f;margin-top:1.3rem"><a href="'+origin+'/legal/shugoi-notice" target="_blank" style="color:#e9899f;text-decoration:underline">En savoir plus \\u00b7 shugoi.com</a></p>';
  var _closed=false;
  var mo=null;
  var _applying=false;
  function ack(){try{fetch(base+'/notice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({machineId:mid,siteKey:sk}),keepalive:true,signal:AbortSignal.timeout(4000)}).catch(function(){})}catch(e){}}
  function buildOverlay(){
    var o=document.createElement('div');o.id='__sg_o';o.style.cssText=_OV();
    var c=document.createElement('div');c.id='__sg_cd';c.style.cssText=_CC();
    c.innerHTML=_CH();
    o.appendChild(c);return o;
  }
  function close(){_closed=true;try{if(mo)mo.disconnect()}catch(e){}var el=document.getElementById('__sg_o');if(el&&el.parentNode)el.parentNode.removeChild(el);document.body.style.overflow='';document.documentElement.style.overflow='';}
  function okHandler(){ack();close();}
  function rebind(){var b=document.getElementById('__sg_ok');if(b)b.onclick=okHandler;}
  // Anti-bypass 100% MUTATION OBSERVER (aucun setInterval).
  // CRITIQUE anti-freeze : le flag _applying + mo.takeRecords() cassent la boucle MO —
  // nos propres modifications (style/innerHTML re-appliqués) ne re-déclenchent PAS le MO
  // (le navigateur normalise cssText/innerHTML, donc la comparaison échoue toujours et
  // on ré-appliquerait à l'infini). takeRecords() vide la file des mutations que NOS
  // changements ont générée → une seule passe par altération réelle, jamais de gel.
  function enforce(){
    if(_closed||_applying)return;
    _applying=true;
    try{
      var o=document.getElementById('__sg_o');
      if(!o){o=buildOverlay();document.documentElement.appendChild(o);}
      if(o.style.cssText!==_OV())o.style.cssText=_OV();
      var c=document.getElementById('__sg_cd');
      if(!c){o.innerHTML='';o.appendChild(buildOverlay().firstChild);}
      else{
        if(c.style.cssText!==_CC())c.style.cssText=_CC();
        if(c.innerHTML!==_CH())c.innerHTML=_CH();
      }
      rebind();
      if(document.body.style.overflow!=='hidden')document.body.style.overflow='hidden';
      if(document.documentElement.style.overflow!=='hidden')document.documentElement.style.overflow='hidden';
      try{
        if(o&&!o.__sgObserved){o.__sgObserved=true;mo&&mo.observe(o,{childList:true,subtree:true,attributes:true,characterData:true,attributeFilter:['style','class','id']});}
      }catch(e){}
    }finally{
      _applying=false;
      try{if(mo)mo.takeRecords();}catch(e){}
    }
  }
  function show(){
    _closed=false;
    var o=buildOverlay();document.documentElement.appendChild(o);
    document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';
    rebind();
    try{
      mo=new MutationObserver(function(){enforce();});
      mo.observe(document.documentElement,{childList:true});
      try{o.__sgObserved=true;mo.observe(o,{childList:true,subtree:true,attributes:true,characterData:true,attributeFilter:['style','class','id']});}catch(e){}
    }catch(e){}
  }
  // Mobile : bascule desktop/stackée sur redimensionnement (ré-applique via enforce).
  try{window.addEventListener('resize',function(){var _m=_isMobile();if(_m!==_MOBILE){_MOBILE=_m;enforce();}},{passive:true})}catch(e){}
  function init(){if(document.body)show();else if(document.addEventListener)document.addEventListener('DOMContentLoaded',show);else setTimeout(init,50)}
  fetch(base+'/notice?machineId='+encodeURIComponent(mid)+'&siteKey='+encodeURIComponent(sk),{signal:AbortSignal.timeout(4000)}).then(function(r){return r.json()}).then(function(d){if(!d.acknowledged)init()}).catch(function(){init()});
})();
</script>`;

function injectNoticeScript(html: string, mid: string, siteKey: string, baseUrl?: string): string {
  const baseVal = baseUrl || '';
  const inject = NOTICE_SCRIPT
    .replace('var mid=window.__sg_mid||\'\';', 'var mid=' + JSON.stringify(mid) + '||\'\';')
    .replace('var sk=window.__sg_siteKey||\'\';', 'var sk=' + JSON.stringify(siteKey) + '||\'\';')
    // base INJECTÉE (ne pas dépendre de window.__sg_baseUrl : nettoyé par _sgCl après 1,5s →
    // sinon la notice appelle /notice relatif → page d'éval → l'ack ne passe jamais)
    .replace('var base=window.__sg_baseUrl||\'\';', 'var base=' + JSON.stringify(baseVal) + '||window.__sg_baseUrl||\'\';')
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
  // O(n) borné : Map préserve l'ordre d'insertion → on éjecte les plus anciens
  // sans tri O(n log n). Suffisant comme LRU approximatif (même borne MAX_TENANTS).
  while (m.size > MAX_TENANTS) {
    const oldest = m.keys().next();
    if (oldest.done) return;
    m.delete(oldest.value);
  }
}

async function refreshConfig(siteKey: string, baseUrl: string, entry: ConfigEntry, secret?: string): Promise<void> {
  try {
    // F2 (divulgation) : la config (detectionFlags/skipPaths) n'est rendue qu'à une clé
    // prouvant possession du secret (sig = HMAC(secret, cb)). La siteKey est publique.
    const cb = Date.now();
    const sig = secret ? crypto.createHmac('sha256', secret).update(cb.toString()).digest('hex') : '';
    const res = await fetch(baseUrl + '/whitelist?key=' + encodeURIComponent(siteKey) + '&cb=' + cb + (sig ? '&sig=' + sig : ''), {
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

export async function getConfig(siteKey: string, baseUrl: string, secret?: string): Promise<{ whitelist: string[]; flags: Record<string, boolean>; skipPaths: string[] }> {
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
      entry.inflight = refreshConfig(siteKey, baseUrl, entry, secret).finally(() => { entry!.inflight = null; });
    }
    await entry.inflight;
    return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths };
  }

  if (age > CONFIG_CACHE_TTL && !entry.inflight) {
    entry.inflight = refreshConfig(siteKey, baseUrl, entry, secret).finally(() => { entry!.inflight = null; });
    entry.inflight.catch(() => {});
  }

  return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths };
}

export async function fetchWhitelistForSiteKey(siteKey: string, baseUrl: string): Promise<string[]> {
  return (await getConfig(siteKey, baseUrl)).whitelist;
}

export async function fetchConfigForSiteKey(siteKey: string, baseUrl: string, secret?: string): Promise<Record<string, boolean>> {
  return (await getConfig(siteKey, baseUrl, secret)).flags;
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

export async function generateSkeleton(siteKey: string, token: string, baseUrl: string, restrictedAccess?: boolean, whitelist?: string[], renderUrl?: string, locale?: Locale, flags?: Record<string, boolean>, clockts?: number, signingSecret?: string): Promise<string> {
  await ensureGuardsReady(baseUrl, undefined, siteKey);
  const rurl = renderUrl || './__shugoi/render';
  const cfg = flags ?? (await getConfig(siteKey, baseUrl, signingSecret)).flags;
  const loc = locale || 'en';
  const msgs = MESSAGES[loc];
  const cache = getCacheEntry(baseUrl, siteKey);
  const fragments: string[] = [];
  fragments.push('window.__sg_siteKey=' + JSON.stringify(siteKey));
  fragments.push('window.__sg_baseUrl=' + JSON.stringify(baseUrl));
  fragments.push('window.__sg_config=' + JSON.stringify(cfg));
  // Mode debug (audit #8) : piloté UNIQUEMENT par le serveur. En production ce flag
  // est toujours false → le guard n'active jamais ses traces via ?sg_probe_debug=1
  // ou localStorage. (Nom volontairement différent de "debug" pour ne pas exposer
  // un toggle générique que l'attaquant chercherait.)
  fragments.push('window.__sg_diagEnabled=' + (process.env.NODE_ENV === 'production' ? 'false' : 'true'));
  // Nettoie l'URL : retire ?sg_proof de la barre d'adresse (le PoW a été validé serveur).
  // history.replaceState ne recharge pas — le skeleton reste affiché, l'URL devient propre.
  // Conserve le reste du query (ex. ?sg_probe_debug=1), retire uniquement sg_proof.
  fragments.push("try{if((location.search||'').indexOf('sg_proof=')>=0){var _qs=location.search.replace(/[?&]sg_proof=[^&]*/,'');var _cu=location.pathname+(_qs?_qs:'')+location.hash;history.replaceState(null,'',_cu)}}catch(e){}");
  // Challenge PoW anti-curl (audit) : sel = HMAC(secret, ts + ':' + nonce). Le guard le
  // résout en JS et l'envoie au wlc (pow=ts:nonce:solution). curl n'exécute pas le JS →
  // pas de grant. Forteresse : nonce aléatoire 64 bits PAR requête (plus de sel
  // déterministe par seconde → précomputation par lots impossible).
  const _powTs = Math.floor(Date.now() / 1000);
  const _powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || '';
  const _powNonce = (typeof crypto.randomBytes === 'function' ? crypto.randomBytes(8).toString('hex') : String(Math.floor(Math.random() * 0xffffffff)).padStart(8, '0') + String(Math.floor(Math.random() * 0xffffffff)).padStart(8, '0'));
  const _powSalt = _powSecret ? crypto.createHmac('sha256', _powSecret).update(_powTs + ':' + _powNonce).digest('hex') : '';
  // ⚠️ DIFFICULTY 10 : 15 demandait ~32k itérations crypto.subtle (~1-3s navigateur) en
  // plus du pre-flight PoW → 2-5s de chargement. 10 bits suffit pour prouver le JS.
  // Audit #6 : la difficulté est désormais configurable (SHUGOKI_POW_DIFF, défaut 12),
  // et DOIT rester synchrone avec core.ts (POW_DIFF) et whitelist.ts (POW_DIFFICULTY).
  const _powDiff = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || '14');
    return Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
  })();
  fragments.push('window.__sg_pow=' + JSON.stringify({ ts: _powTs, nonce: _powNonce, salt: _powSalt, difficulty: _powDiff }));
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
  fragments.push(
    `window.__sg_showBlock=function(msg,title,badge){try{var _loading=document.getElementById("__sg_loading");if(_loading)_loading.remove();var _paint=document.getElementById("__sg_paint_guard");if(_paint)_paint.remove()}catch(_e){}var _saf=/AppleWebKit/i.test(navigator.userAgent||"")&&!/(Chrome|CriOS|Chromium|Edg|OPR)/i.test(navigator.userAgent||"");if(_saf&&/remplacement\s+de\s+contenu|content\s+replacement/i.test(String(msg||"")+" "+String(title||"")))return;` +
      NATIVE_BLOCK_PALETTE_SCRIPT +
      `var _palette=_sgNativeBlockPalette(navigator.userAgent||""),_light=_palette.light,_dark=_palette.dark;` +
      `var css='@font-face{font-family:"Reggae One";src:url(https://shugoi.com/reggae-one.woff2) format("woff2");font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:'+_light+'}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fffdfa;border:1px solid rgba(43,33,29,.16);border-radius:16px 5px 16px 5px;box-shadow:0 10px 30px rgba(43,33,29,.08);padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;filter:drop-shadow(2px 4px 8px rgba(231,112,144,.55));margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;background:#fdf0f4;border:1px solid rgba(194,84,111,.35);border-radius:10px 4px 10px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#a83d5a;margin-bottom:1.4rem}#c h2{font-family:"Reggae One",Georgia,serif;font-size:2.2rem;color:#a83d5a;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#7a6a62;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#a83d5a;margin-top:1.8rem}@media(prefers-color-scheme:dark){html,body{background:'+_dark+'}#c{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}#c .bdg{background:rgba(233,137,159,.16);border-color:rgba(233,137,159,.5);color:#e9899f}#c h2,#c p.ft{color:#e9899f}#c p.desc{color:#a795b4}}';` +
      `var h='<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><meta name=color-scheme content="light dark"><style>'+css+'</style></head><body><div id=c><img src=https://shugoi.com/favicon-block.png class=l><img src=https://shugoi.com/brand-block.png class=b><div class=bdg>'+(badge||${JSON.stringify(msgs.blockedBadge)})+'</div><h2>'+(title||${JSON.stringify(msgs.blockedTitle)})+'</h2><p class=desc>'+(msg||'')+'</p><p class=ft>'+location.hostname+' · Shugoi</p></div></body>';document.documentElement.innerHTML=h}`
  );
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
  // NOTE bench : la concaténation += bat ici le tableau pré-alloué + join
  // (V8 internez en ropes, ~3× plus rapide sur 100 Ko). Ne pas "optimiser".
  let encStr = '';
  for (let i = 0; i < combinedCode.length; i++) encStr += String.fromCodePoint(917504 + combinedCode.charCodeAt(i));
  const decodedCall = "[...'" + encStr + "'].map(x=>String.fromCodePoint(x.codePointAt(0)-917504)).join('')";
  const bootCode = "eval(" + decodedCall + ")";
  return '<script>' + bootCode + '</script>';
}

export async function injectGuardScripts(html: string, siteKey: string, baseUrl: string, whitelist?: string[] | null, restrictedAccess?: boolean, signingSecret?: string, req?: unknown, _allowedOrigins?: string[], locale?: Locale, clockts?: number): Promise<string> {
  await ensureGuardsReady(baseUrl, signingSecret, siteKey);
  const cfgData = await getConfig(siteKey, baseUrl, signingSecret);
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
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, wl, renderUrl, locale, cfgData.flags, clockts, signingSecret);
}

export function enableDiskStore(multiProcess: boolean) {
  _diskEnabled = multiProcess;
  if (multiProcess) startDiskCleanup();
}
