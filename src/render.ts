import crypto, { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, chmodSync, statSync, renameSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MESSAGES, type Locale } from './locales';
import type { JsonObject } from './types';
import { availabilityState, type SignedAvailabilitySnapshot } from './availability';

import { createMidAnchorValue, isMidAnchorValid } from './cookie-security';

const runtimeGlobal = globalThis as typeof globalThis & {
  __sg_ntpDrift?: number;
  __sg_ntpTime?: number;
  __sg_trustedClient?: boolean;
};

const TOKEN_DIR = join(tmpdir(), 'shugoi-render-' + (process.getuid?.() ?? 'x'));
const TOKEN_TTL = 120_000;
const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
interface StoredEntry { html: string; expiresAt: number }
const _memoryStore = new Map<string, StoredEntry>();
const _bootstrapStore = new Map<string, StoredEntry>();
const _bootstrapPaths = new Map<string, string>();
let _latestBootstrap: { token: string; expiresAt: number } | null = null;

let _diskEnabled = false;
let _totalBytes = 0;
let _diskCleanupStarted = false;

if (!existsSync(TOKEN_DIR)) {
  try { mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 }); } catch {}
}
try { chmodSync(TOKEN_DIR, 0o700); } catch {}

function tokenFileName(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function startDiskCleanup() {
  if (_diskCleanupStarted) return;
  _diskCleanupStarted = true;
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

function consumeFromDisk(token: string): string | null {
  const file = join(TOKEN_DIR, tokenFileName(token));
  const claimed = file + '.' + crypto.randomBytes(16).toString('hex') + '.claimed';
  try {
    // Rename is atomic across workers: at most one reader can claim this token.
    renameSync(file, claimed);
    if (Date.now() - statSync(claimed).mtimeMs > TOKEN_TTL) return null;
    return readFileSync(claimed, 'utf-8');
  } catch { return null; }
  finally { try { unlinkSync(claimed); } catch {} }
}

function dropEntry(token: string) {
  const e = _memoryStore.get(token);
  if (e) _totalBytes -= Buffer.byteLength(e.html, 'utf-8');
  _memoryStore.delete(token);
}

/** The protected bootstrap is short-lived and delivered over its own same-origin socket. */
export function storeBootstrap(token: string, script: string) {
  _bootstrapStore.set(token, { html: script, expiresAt: Date.now() + TOKEN_TTL });
  _latestBootstrap = { token, expiresAt: Date.now() + TOKEN_TTL };
  while (_bootstrapStore.size > MAX_ENTRIES) {
    const first = _bootstrapStore.keys().next();
    if (first.done) break;
    _bootstrapStore.delete(first.value);
  }
}

export function readLatestBootstrap(): string | null {
  if (!_latestBootstrap || Date.now() > _latestBootstrap.expiresAt) return null;
  return readBootstrap(_latestBootstrap.token);
}

export function readBootstrap(token: string): string | null {
  const entry = _bootstrapStore.get(token);
  if (!entry || Date.now() > entry.expiresAt) {
    _bootstrapStore.delete(token);
    return null;
  }
  return entry.html;
}

// Variation selectors supplement: invisible in source/DOM, but preserved as
// URL code points by browsers (unlike tag characters U+E0000..U+E007F).
const INVISIBLE_PATH_SHIFT = 0xe0000;
export function encodeInvisibleBootstrapPath(token: string): string {
  return String.fromCodePoint(0xe0061);
}
export function decodeInvisibleBootstrapPath(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded === String.fromCodePoint(0xe0061) ? readLatestBootstrap() ? '__latest__' : null : null;
  } catch { return null; }
}

function evictOldest() {
  const first = _memoryStore.keys().next();
  if (first.done) return;
  dropEntry(first.value);
}

export function storeHtml(token: string, html: string, _contentReplaceOn?: boolean) {
  if (_diskEnabled) {
    storeToDisk(token, html);
  }
  dropEntry(token);
  if (_diskEnabled) return;
  const size = Buffer.byteLength(html, 'utf-8');
  while ((_memoryStore.size >= MAX_ENTRIES || _totalBytes + size > MAX_TOTAL_BYTES) && _memoryStore.size > 0) {
    evictOldest();
  }
  _memoryStore.set(token, { html, expiresAt: Date.now() + TOKEN_TTL });
  _totalBytes += size;

}

function consumeFromMemory(token: string): string | null {
  const entry = _memoryStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dropEntry(token);
    return null;
  }
  // Drop before returning the HTML. JavaScript executes this synchronously, so
  // two render handlers in the same worker cannot obtain the same entry.
  dropEntry(token);
  return entry.html;
}

const GRANT_TTL_MS = 120_000;

export function verifyRenderGrant(mid: string | undefined, grant: string | undefined, token?: string, _ip?: string, expectedSiteKey?: string, secretOverride?: string): boolean {
  const gSecret = secretOverride;
  if (!gSecret) return false;
  if (!grant || !mid || !/^[a-f0-9]{64}$/.test(mid)) return false;
  const sep = grant.indexOf(':');
  if (sep < 0) return false;
  const ts = grant.slice(0, sep);
  const sig = grant.slice(sep + 1);
  const tsSec = parseInt(ts, 36);
  const age = Date.now() - tsSec * 1000;
  if (isNaN(tsSec) || age > GRANT_TTL_MS || age < -5000) return false;
  if (!expectedSiteKey) return false;
  const payload = 'render-grant:' + [expectedSiteKey, mid, token || '', ts].join(':');
  const exp = crypto.createHmac('sha256', gSecret).update(payload).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(exp, 'hex')); }
  catch { return false; }
}

export async function renderResponseData(token: string, _locale?: Locale, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, _secret?: string): Promise<{ html?: string; error?: string; blocked?: boolean; reason?: string; message?: string; title?: string }> {
  if (!token || token.length < 16 || token.length > 300) return { error: 'not_found' };

  if (expectedSiteKey) {
    const tokSiteKey = token.split(':')[0];
    if (tokSiteKey !== expectedSiteKey) return { error: 'not_found' };
  }

  // The short signed grant authenticates the render request. The matching HTML
  // token is then claimed atomically, so a captured URL cannot render twice.
  if (!verifyRenderGrant(mid, grant, token, ip, expectedSiteKey, _secret)) return { error: 'not_found' };

  if (_diskEnabled) {
    const html = consumeFromDisk(token);
    return html === null ? { error: 'not_found' } : { html: stripBootstrapMarker(html) };
  }
  const html = consumeFromMemory(token);
  if (html !== null) return { html: stripBootstrapMarker(html) };
  return { error: 'not_found' };
}

// The raw marker belongs on the initial guarded response. Re-emitting it in
// the already-authorized document would start a second guard transport after
// render-delivered and can create a reconnect loop during document replacement.
function stripBootstrapMarker(html: string): string {
  return html.replaceAll('<script src=></script>', '');
}

export function injectReferrerPolicy(html: string): string {
  const meta = '<meta name="referrer" content="strict-origin-when-cross-origin">';
  if (html.includes('<head>')) return html.replace('<head>', '<head>' + meta);
  if (html.includes('<html')) {
    const m = html.match(/<html[^>]*>/);
    if (m) return html.replace(m[0], m[0] + meta);
  }
  return meta + html;
}

export async function handleRender(token: string, res: { setHeader?: (k: string, v: string | string[]) => void; getHeader?: (k: string) => string | number | string[] | undefined; send?: (body: string) => void; end?: (body: string) => void }, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, baseUrl?: string, _secret?: string, ua?: string, midAnchor?: string) {
  const data = await renderResponseData(token, undefined, configUrl, mid, grant, ip, expectedSiteKey, _secret);
  if (data.html && mid) data.html = injectNoticeScript(data.html, mid, expectedSiteKey || token.split(':')[0] || '', baseUrl);
  if (data.html) data.html = injectReferrerPolicy(data.html);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader('Content-Type', 'application/json');
  if (res.setHeader) res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (res.setHeader) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
  if (res.setHeader) res.setHeader('Pragma', 'no-cache');
  if (data.html && res.setHeader) {
    // Keep continuity cookies in the same per-site signing domain as the
    // render grant. Falling back to a process-wide key here would invalidate
    // anchors on the next request and weaken tenant isolation.
    const authSecret = _secret;
    if (authSecret) {
      const cookies: string[] = [];
      const ts = Math.floor(Date.now() / 1000);
      const val = ts + ':' + crypto.createHmac('sha256', authSecret).update('sg_authorized:' + ts).digest('hex');
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      cookies.push('__sg_authorized=' + val + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=120' + secure);
      if (mid) {
        const anchorOptions = { secret: authSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1000 };
        const anchorOk = !!midAnchor && isMidAnchorValid(midAnchor, ip || '', ua || '', mid, anchorOptions);
        if (!anchorOk) {
          cookies.push('__sg_mid_anchor=' + createMidAnchorValue(ip || '', ua || '', mid, anchorOptions) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000' + secure);
        }
      }
      const existing = res.getHeader ? res.getHeader('Set-Cookie') : undefined;
      if (existing !== undefined) {
        const current = (Array.isArray(existing) ? existing : [existing])
          .filter((value): value is string => typeof value === 'string');
        res.setHeader('Set-Cookie', [...current, ...cookies]);
      } else {
        res.setHeader('Set-Cookie', cookies);
      }
    }
  }
  if (res.send) res.send(json);
  else if (res.end) res.end(json);
}

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
  function _CH(){var h=_DARK?(_MOBILE?_CARD_HTML_MOB_DARK:_CARD_HTML_DESK_DARK):(_MOBILE?_CARD_HTML_MOB:_CARD_HTML_DESK);return h.replace(["Aucune donnée","personnelle n'est","collectée."].join(" "),"Des signaux techniques et des identifiants pseudonymisés peuvent être traités selon la politique du site.").replace(["No personal data","is collected."].join(" "),"Technical signals and pseudonymous identifiers may be processed according to the website's policy.")}
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
  try{window.addEventListener('resize',function(){var _m=_isMobile();if(_m!==_MOBILE){_MOBILE=_m;enforce();}},{passive:true})}catch(e){}
  function init(){if(document.body)show();else if(document.addEventListener)document.addEventListener('DOMContentLoaded',show);else setTimeout(init,50)}
  fetch(base+'/notice?machineId='+encodeURIComponent(mid)+'&siteKey='+encodeURIComponent(sk),{signal:AbortSignal.timeout(4000)}).then(function(r){return r.json()}).then(function(d){if(!d.acknowledged)init()}).catch(function(){init()});
})();
</script>`;

function injectNoticeScript(html: string, mid: string, siteKey: string, baseUrl?: string): string {
  const baseVal = baseUrl || '';
  const sanitizedNotice = NOTICE_SCRIPT
    .replace(["Aucune donnée", "personnelle n'est", "collectée."].join(" "), "Des signaux techniques et des identifiants pseudonymisés peuvent être traités selon la politique du site.")
    .replace(["No personal data", "is collected."].join(" "), "Technical signals and pseudonymous identifiers may be processed according to the website's policy.");
  const inject = sanitizedNotice
    .replace('var mid=window.__sg_mid||\'\';', 'var mid=' + JSON.stringify(mid) + '||\'\';')
    .replace('var sk=window.__sg_siteKey||\'\';', 'var sk=' + JSON.stringify(siteKey) + '||\'\';')
    .replace('var base=window.__sg_baseUrl||\'\';', 'var base=' + JSON.stringify(baseVal) + '||window.__sg_baseUrl||\'\';')
    .replace('window.__sg_noticeEnabled', 'window.__sg_noticeEnabled');
  if (html.includes('</body>')) return html.replace('</body>', inject + '</body>');
  return html + inject;
}

export function signToken(siteKey: string, timestamp: number, secretOverride?: string): { token: string } {
  const secret = secretOverride;
  if (!secret) return { token: '' };
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = [siteKey, timestamp, nonce].join(':');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { token: payload + ':' + sig };
}

const CONFIG_CACHE_TTL = 30_000;
const CONFIG_STALE_MAX = 600_000;
const CONFIG_FETCH_TIMEOUT = 2_000;
const MAX_TENANTS = 500;

interface ConfigEntry {
  whitelist: string[];
  flags: Record<string, boolean>;
  skipPaths: string[];
  supportEmail: string;
  fetchedAt: number;
  inflight: Promise<void> | null;
  available: boolean;
  snapshot: SignedAvailabilitySnapshot | null;
}

const _configCache = new Map<string, ConfigEntry>();

function configKey(baseUrl: string, siteKey: string): string {
  return baseUrl + '@' + siteKey;
}

function pruneCache<T extends { fetchedAt: number }>(m: Map<string, T>): void {
  if (m.size <= MAX_TENANTS) return;
  const sorted = [...m.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  for (let i = 0; i < sorted.length - MAX_TENANTS; i++) {
    const entry = sorted[i];
    if (entry) m.delete(entry[0]);
  }
}

async function refreshConfig(siteKey: string, baseUrl: string, entry: ConfigEntry, secret?: string): Promise<void> {
  entry.available = false;
  try {
    const cb = Date.now();
    const sig = secret ? crypto.createHmac('sha256', secret).update(cb.toString()).digest('hex') : '';
    const configUrl = baseUrl + '/whitelist?key=' + encodeURIComponent(siteKey) + '&cb=' + cb + (sig ? '&sig=' + sig : '');
    let res = await fetch(configUrl, {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT),
    });
    if (res.status === 401 && secret) {
      const validation = await fetch(baseUrl + '/validate-key', {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey, secret }), signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT),
      });
      if (validation.ok && (await validation.json() as { valid?: boolean }).valid === true) {
        res = await fetch(configUrl, { signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT) });
      }
    }
    if (res.ok) {
      const data = await res.json() as JsonObject;
      entry.whitelist = (data.whitelistedMachines as string[]) || [];
      entry.flags = (data.detectionFlags as Record<string, boolean>) || (data.flags as Record<string, boolean>) || {};
      entry.skipPaths = (data.skipPaths as string[]) || [];
      entry.supportEmail = typeof data.supportEmail === 'string' ? data.supportEmail : '';
      const snapshot = data.availabilitySnapshot as unknown as SignedAvailabilitySnapshot | undefined;
      if (!secret || !snapshot || snapshot.siteKey !== siteKey || availabilityState(snapshot, secret) === 'rejected') throw new Error('availability_snapshot_invalid');
      entry.snapshot = snapshot;
      entry.available = true;
    }
  } catch { entry.available = false; }
  entry.fetchedAt = Date.now();
}

export async function getConfig(siteKey: string, baseUrl: string, secret?: string): Promise<{ whitelist: string[]; flags: Record<string, boolean>; skipPaths: string[]; supportEmail: string }> {
  const key = configKey(baseUrl, siteKey);
  let entry = _configCache.get(key);
  if (!entry) {
    entry = { whitelist: [], flags: {}, skipPaths: [], supportEmail: '', fetchedAt: 0, inflight: null, available: false, snapshot: null };
    _configCache.set(key, entry);
    pruneCache(_configCache);
  }

  const age = Date.now() - entry.fetchedAt;

  if (entry.fetchedAt === 0 || age > CONFIG_STALE_MAX) {
    if (!entry.inflight) {
      entry.inflight = refreshConfig(siteKey, baseUrl, entry, secret).finally(() => { entry!.inflight = null; });
    }
    await entry.inflight;
    return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths, supportEmail: entry.supportEmail };
  }

  if (age > CONFIG_CACHE_TTL && !entry.inflight) {
    entry.inflight = refreshConfig(siteKey, baseUrl, entry, secret).finally(() => { entry!.inflight = null; });
  }

  // Security flags are request-time policy, not presentation data. The first
  // request after TTL expiry must wait for the fresh dashboard configuration
  // instead of serving the previous policy during a background refresh.
  if (age > CONFIG_CACHE_TTL && entry.inflight) {
    await entry.inflight;
  }

  return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths, supportEmail: entry.supportEmail };
}

export function isConfigAvailable(siteKey: string, baseUrl: string): boolean {
  return _configCache.get(configKey(baseUrl, siteKey))?.available === true;
}

export function getConfigAvailability(siteKey: string, baseUrl: string, secret?: string, maxStaleMs = CONFIG_STALE_MAX): 'fresh' | 'degraded' | 'expired' | 'rejected' | 'recovered' {
  const entry = _configCache.get(configKey(baseUrl, siteKey));
  if (!entry?.snapshot || !secret) return 'expired';
  return availabilityState(entry.snapshot, secret, Date.now(), maxStaleMs);
}

export async function fetchWhitelistForSiteKey(siteKey: string, baseUrl: string): Promise<string[]> {
  return (await getConfig(siteKey, baseUrl)).whitelist;
}

export async function fetchConfigForSiteKey(siteKey: string, baseUrl: string, secret?: string): Promise<Record<string, boolean>> {
  return (await getConfig(siteKey, baseUrl, secret)).flags;
}

export function __clearConfigCache(): void { _configCache.clear(); }
export function __clearGuardCache(siteKey?: string, baseUrl?: string): void {
  if (siteKey && baseUrl) _guardCaches.delete(cacheKey(baseUrl, siteKey));
  else if (siteKey) {
    for (const k of [..._guardCaches.keys()]) if (k.endsWith("::" + siteKey)) _guardCaches.delete(k);
  } else _guardCaches.clear();
}

const GUARD_POLL_MS = (() => {
  const raw = Number(process.env.SHUGOKI_GUARD_POLL_MS || '');
  return Number.isFinite(raw) && raw >= 1000 ? raw : 30_000;
})();

interface GuardCacheEntry { detect: string | null; guard: string | null; fetching: boolean; queue: Array<() => void>; fetchedAt: number }
const _guardCaches = new Map<string, GuardCacheEntry>();
const _guardPollers = new Map<string, ReturnType<typeof setInterval>>();

function cacheKey(baseUrl: string, siteKey: string): string {
  return `${baseUrl}::${siteKey}`;
}

function getCacheEntry(baseUrl: string, siteKey: string): GuardCacheEntry {
  const key = cacheKey(baseUrl, siteKey);
  if (!_guardCaches.has(key)) {
    _guardCaches.set(key, { detect: null, guard: null, fetching: false, queue: [], fetchedAt: 0 });
    pruneCache(_guardCaches);
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
      // Le guard inline = le bundle modulaire per-config (/guard-bundle), PAS
      // /guard-detect (qui servait le full). Même getModularBundle côté serveur,
      // source unique → le view-source reflète les toggles du dashboard.
      fetch(baseUrl + '/guard-bundle?key=' + sk + '&raw=1&cb=' + cb + (sig ? '&sig=' + sig : ''), { signal: AbortSignal.timeout(5000) }),
      fetch(baseUrl + '/guard?key=' + sk + '&raw=1&cb=' + cb + (sig ? '&sig=' + sig : ''), { signal: AbortSignal.timeout(5000) }),
    ]);
    if (dRes.ok && gRes.ok) {
      const rawDetect = await dRes.text();
      const rawGuard = await gRes.text();
      cache.detect = rawDetect;
      cache.guard = rawGuard;
      cache.fetchedAt = Date.now();
    }
  } catch {
    // Startup can race the host server beginning to listen. Do not cache a
    // synthetic failure script: it looks ready to callers and makes the first
    // protected page permanently unusable until the next polling interval.
    // Leaving the entry empty lets the following protected request retry; the
    // skeleton still withholds the stored HTML while guards are unavailable.
  }
  cache.fetching = false;
  cache.queue.forEach((r) => r());
  cache.queue = [];
}

function startGuardPoller(baseUrl: string, secret?: string, siteKey?: string): void {
  const key = cacheKey(baseUrl, siteKey || 'cache');
  if (_guardPollers.has(key)) return;
  const timer = setInterval(() => {
    const cache = _guardCaches.get(key);
    if (!cache) {
      clearInterval(timer);
      _guardPollers.delete(key);
      return;
    }
    const prev = { detect: cache.detect, guard: cache.guard };
    fetchGuardScripts(baseUrl, secret, siteKey).then(() => {
      const next = _guardCaches.get(key);
      if (next && (next.detect !== prev.detect || next.guard !== prev.guard)) {
        // scripts mis à jour depuis le serveur → le cache servi est remplacé
      }
    }).catch(() => {});
  }, GUARD_POLL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  _guardPollers.set(key, timer);
}

function webkitCompatibleGuard(fullGuard: string): string {
  // WebKit has crashed while executing the full browser-probe bundle. This
  // fallback keeps the server-side boundary intact: it asks /wlc for a
  // site-bound decision and only the server can issue a render grant. Its
  // browser values are continuity data, never proof of device ownership.
  const fallback = `
var raw=['wk',location.host||'',navigator.platform||'',navigator.language||'',String(screen.width||0),String(screen.height||0),String(new Date().getTimezoneOffset())].join(':::');
var trace=window.__sg_guardTrace=window.__sg_guardTrace||{phases:[],status:'running',last:null,startedAt:Date.now()};
trace.phases.push('webkit-fallback:start');trace.last='webkit-fallback:start';
window.__sg_guardTraceJson=function(){try{return JSON.stringify(window.__sg_guardTrace)}catch(_){return '{}'}};
var bytes=new TextEncoder().encode(raw);
crypto.subtle.digest('SHA-256',bytes).then(function(hash){
  var mid=Array.prototype.map.call(new Uint8Array(hash),function(n){return n.toString(16).padStart(2,'0')}).join('');
  try{window.machineId=mid;window.__sg_mid=mid;window.__sg_detectMid=mid}catch(_){}
  var base=window.__sg_baseUrl||'';
  var key=window.__sg_siteKey||'';
  var token=window.__sg_token||'';
  return new Promise(function(resolve){
    if(typeof window.__sg_wlcRequest!=='function')return resolve(null);
    window.__sg_wlcRequest(base+'/wlc?mid='+encodeURIComponent(mid)+'&raw='+encodeURIComponent(raw)+'&key='+encodeURIComponent(key)+'&token='+encodeURIComponent(token)+'&drift=0&_='+Date.now(),function(err,text){
      if(err)return resolve(null);try{resolve(JSON.parse(text))}catch(_){resolve(null)}
    });
  });
}).then(function(decision){
  trace.phases.push(decision&&decision.allowed?'webkit:allowed':'webkit:restricted');trace.last=trace.phases[trace.phases.length-1];trace.status=decision&&decision.allowed?'allowed':'blocked';trace.updatedAt=Date.now();
  if(decision&&decision.allowed&&decision.grant)window.__sg_grant=decision.grant;
  if(!decision||!decision.allowed){document.documentElement.innerHTML='<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:light dark}html,body{margin:0;min-height:100%;background:#fcf9f5;color:#555;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;display:flex;align-items:center;justify-content:center;padding:1rem}.content-container{min-width:320px;max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem}.error-title{font-family:Georgia,serif;font-size:2.2rem;line-height:1.25;color:#e87090;font-weight:400;margin:0 auto .7rem}.error-message{font-size:.9rem;color:#555;line-height:1.8;margin:0 auto}.error-code{font-size:.6rem;color:#e87090;margin-top:1.5rem}@media(prefers-color-scheme:dark){html,body{background:#16101c;color:#a795b4}.content-container{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}.error-title{color:#e9899f}.error-message{color:#a795b4}.error-code{color:#e9899f}}</style></head><body><div class=content-container><div class=error-title>Accès restreint</div><div class=error-message>Votre appareil n’est pas autorisé à accéder à ce site. Veuillez réessayer plus tard ou contacter le support.</div><div class=error-code>SHUGOI_PROBE_RESTRICTED_ACCESS</div></div></body>';window.__sg_blocked=true;window.__sg_blockShown=true;return}
  window.__sg_guardsReady=true;
}).catch(function(){window.__sg_guardsReady=true});`;
  return `(function(){try{${fullGuard}}catch(_){window.__sg_blocked=true;window.__sg_guardsReady=true}})();`;
}

export async function ensureGuardsReady(baseUrl: string, secret?: string, siteKey?: string): Promise<void> {
  const cache = getCacheEntry(baseUrl, siteKey || 'cache');
  if (!cache.detect || !cache.guard) {
    await fetchGuardScripts(baseUrl, secret, siteKey);
  }
  startGuardPoller(baseUrl, secret, siteKey);
}

export async function generateSkeleton(siteKey: string, token: string, baseUrl: string, restrictedAccess?: boolean, _whitelist?: string[], renderUrl?: string, locale?: Locale, flags?: Record<string, boolean>, clockts?: number, signingSecret?: string, supportEmail?: string, midAnchorOk?: boolean, renderTransport: 'http' | 'websocket' = 'http'): Promise<string> {
  const rurl = renderUrl || './__shugoi/render';
  const fetched = flags ? null : await getConfig(siteKey, baseUrl, signingSecret);
  await ensureGuardsReady(baseUrl, signingSecret, siteKey);
  const cfg = flags ?? fetched!.flags;
  const mail = supportEmail ?? fetched?.supportEmail ?? '';
  const loc = locale || 'en';
  const msgs = MESSAGES[loc];
  const cache = getCacheEntry(baseUrl, siteKey);
  const fragments: string[] = [];
  fragments.push('window.__sg_siteKey=' + JSON.stringify(siteKey));
  fragments.push('window.__sg_baseUrl=' + JSON.stringify(baseUrl));
  fragments.push('window.__sg_config=' + JSON.stringify(cfg));
  if (mail) fragments.push('window.__sg_supportEmail=' + JSON.stringify(mail));
  fragments.push('window.__sg_diagEnabled=' + (process.env.NODE_ENV === 'production' ? 'false' : 'true'));
  fragments.push("try{if((location.search||'').indexOf('sg_proof=')>=0){var _qs=location.search.replace(/[?&]sg_proof=[^&]*/,'');var _cu=location.pathname+(_qs?_qs:'')+location.hash;history.replaceState(null,'',_cu)}}catch(e){}");
  const _powTs = Math.floor(Date.now() / 1000);
  const _powSecret = signingSecret || '';
  const _powNonce = (typeof crypto.randomBytes === 'function' ? crypto.randomBytes(8).toString('hex') : String(Math.floor(Math.random() * 0xffffffff)).padStart(8, '0') + String(Math.floor(Math.random() * 0xffffffff)).padStart(8, '0'));
  const _powSalt = _powSecret ? crypto.createHmac('sha256', _powSecret).update(_powTs + ':' + _powNonce).digest('hex') : '';
  const _powDiff = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || '12');
    const base = Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
    // midAnchorOk === false → machine non reconnue (pas d'ancre valide) → PoW durci +2.
    // true ou undefined → difficulté de base.
    return midAnchorOk === false ? Math.min(base + 2, 24) : base;
  })();
  fragments.push('window.__sg_pow=' + JSON.stringify({ ts: _powTs, nonce: _powNonce, salt: _powSalt, difficulty: _powDiff }));
  const _ntpDrift = runtimeGlobal.__sg_ntpDrift || 0;
  const _ntpTime = runtimeGlobal.__sg_ntpTime || (Date.now() - _ntpDrift);
  const _clockts = clockts || _ntpTime;
  fragments.push('window.__sg_ntp=' + _ntpTime);
  fragments.push('window.__sg_serverTime=' + _clockts);
  fragments.push('window.__sg_clockts=' + _clockts);
  if (!restrictedAccess) fragments.push('window.__sg_disableRestrictedAccess=true');
  // Loader anti-flash : visible dès le premier paint (le guard calcule le mid
  // ~300ms), remplacé par le contenu quand rd() écrit. SKIP quand le client a un
  // __sg_ok valide (globalThis.__sg_trustedClient) → pas de « Vérification » à chaque refresh.
  if (runtimeGlobal.__sg_trustedClient === true) {
    fragments.push('window.__sg_trusted=true');
  } else {
    fragments.push('window.__sg_trusted=false');
  }
  if (renderTransport === 'websocket') {
    // The guard submits its WLC decision through this channel. Its payload is
    // only the existing WLC query; the central service replays it through the
    // established server-side validator with the browser's original headers.
    fragments.push('window.__sg_wlcSocket=null;window.__sg_wlcDecision=null;window.__sg_wlcRequest=function(u,cb){var done=false,w,to;function finish(err,val){if(done)return;done=true;try{clearTimeout(to)}catch(_e){}cb(err,val)}try{var a=new URL(window.__sg_baseUrl||location.href,location.href);var q=new URL(u,location.href).search;if(!q||!/^https?:$/.test(a.protocol))return finish("wlc_transport_invalid");var ep=(a.protocol==="https:"?"wss://":"ws://")+a.host+a.pathname.replace(/\\/$/,"")+"/ws-wlc";w=new WebSocket(ep);window.__sg_wlcSocket=w;to=setTimeout(function(){finish("wlc_transport_timeout")},6500);w.onopen=function(){try{w.send(JSON.stringify({q:q}))}catch(_e){finish("wlc_transport_send")}};w.onmessage=function(e){var text=String(e.data);window.__sg_wlcDecision=text;try{var d=JSON.parse(text);if(d&&d.allowed&&d.grant){window.__sg_grant=d.grant;setTimeout(function(){try{if(typeof rd==="function"&&!window.__sg_blocked)rd(window.__sg_renderUrl||window.__sg_baseUrl,0)}catch(_e){}},0)}}catch(_e){}finish(null,text)};w.onerror=function(){finish("wlc_transport_error")};w.onclose=function(){window.__sg_wlcSocket=null;if(!done)finish("wlc_transport_closed")}}catch(_e){finish("wlc_transport_open")}};window.__sg_wlcStream=function(u,onData,onError){var stopped=false,w;try{var a=new URL(window.__sg_baseUrl||location.href,location.href),q=new URL(u,location.href).search;if(!q||!/^https?:$/.test(a.protocol))throw Error("invalid");var ep=(a.protocol==="https:"?"wss://":"ws://")+a.host+a.pathname.replace(/\\/$/,"")+"/ws-wlc";w=new WebSocket(ep);w.onopen=function(){if(!stopped)try{w.send(JSON.stringify({s:q}))}catch(_e){if(!stopped)onError()}};w.onmessage=function(e){if(stopped)return;try{onData(JSON.parse(String(e.data)))}catch(_e){onError()}};w.onerror=function(){if(!stopped)onError()};w.onclose=function(){if(!stopped)onError()}}catch(_e){onError()}return function(){stopped=true;try{if(w)w.close()}catch(_e){}}};');
    // Replace the legacy transport with the clock-preflight aware transport.
    // The guard may already have an open socket after clock-ping/pong; reuse it.
    fragments.push('window.__sg_wlcRequest=function(u,cb){var done=false,w=window.__sg_wlcClockSocket&&window.__sg_wlcClockReady?window.__sg_wlcClockSocket:null,to;function finish(err,val){if(done)return;done=true;try{clearTimeout(to)}catch(_e){}cb(err,val)}try{var a=new URL(window.__sg_baseUrl||location.href,location.href);var z=new URL(u,location.href);var d=Number(window.__sg_midDrift);if(Number.isFinite(d))z.searchParams.set("drift",String(Math.round(d)));var q=z.search;if(!q||!/^https?:$/.test(a.protocol))return finish("wlc_transport_invalid");var ep=(a.protocol==="https:"?"wss://":"ws://")+a.host+a.pathname.replace(/\\/$/,"")+"/ws-wlc";var send=function(){try{w.send(JSON.stringify({q:q}))}catch(_e){finish("wlc_transport_send")}};if(!w||w.readyState!==1){w=new WebSocket(ep);window.__sg_wlcSocket=w;w.onopen=send}else{window.__sg_wlcSocket=w;send()}to=setTimeout(function(){finish("wlc_transport_timeout")},6500);w.onmessage=function(e){var text=String(e.data);window.__sg_wlcDecision=text;try{var x=JSON.parse(text);if(x&&x.allowed&&x.grant)window.__sg_grant=x.grant}catch(_e){}finish(null,text)};w.onerror=function(){finish("wlc_transport_error")};w.onclose=function(){if(window.__sg_wlcSocket===w)window.__sg_wlcSocket=null;if(!done)finish("wlc_transport_closed")}}catch(_e){finish("wlc_transport_open")}}');
    // Tor Browser can refuse the WLC WebSocket after the bootstrap succeeded.
    // Keep the WebSocket as the primary transport, then retry the same signed
    // query over same-origin HTTP so the decision path remains server-side.
    fragments.push('window.__sg_wlcRequest=(function(){var previous=window.__sg_wlcRequest;return function(u,cb){var settled=false;var fallback=function(){if(settled)return;try{fetch(u,{cache:"no-store",credentials:"same-origin",headers:{accept:"application/json"}}).then(function(r){return r.text()}).then(function(t){if(settled)return;settled=true;window.__sg_wlcDecision=t;cb(null,t)}).catch(function(){if(!settled){settled=true;cb("wlc_transport_unavailable")}})}catch(_e){if(!settled){settled=true;cb("wlc_transport_unavailable")}}};var timer=setTimeout(fallback,1200);try{previous(u,function(err,val){if(settled)return;clearTimeout(timer);if(!err){settled=true;cb(null,val)}else fallback()})}catch(_e){clearTimeout(timer);fallback()}}})()');
    fragments.push('window.__sgTransportSeq=window.__sgTransportSeq||0;window.__sgTransportLog=function(kind,id,event,data){try{console.log("[shugoi] transport",kind,id,event,data==null?"":data)}catch(_e){}};window.__sg_wlcRequest=(function(previous){return function(u,cb){var id="wlc-"+(++window.__sgTransportSeq),log=window.__sgTransportLog||function(){};log("initial",id,"start");return previous(u,function(err,val){log("initial",id,err?"error":"message",err||((String(val||"").match(/\\\"allowed\\\":(true|false)/)||[])[1]||""));cb(err,val)})}})(window.__sg_wlcRequest);window.__sg_wlcStream=(function(previous){return function(u,onData,onError){var id="stream-"+(++window.__sgTransportSeq),log=window.__sgTransportLog||function(){};log("stream",id,"start");return previous(u,function(v){log("stream",id,"message",v&&v.allowed);onData(v)},function(){log("stream",id,"error");onError()})}})(window.__sg_wlcStream);');
    fragments.push('window.__sg_wlcEvent=function(reason){try{var _a=new URL(window.__sg_baseUrl||location.href,location.href),_w=new WebSocket((_a.protocol==="https:"?"wss://":"ws://")+_a.host+_a.pathname.replace(/\\/$/,"")+"/ws-wlc");_w.onopen=function(){try{_w.send(JSON.stringify({cmd:"event",reason:String(reason||"").slice(0,128),machineId:String(window.__sg_mid||"").slice(0,256),siteKey:String(window.__sg_siteKey||"").slice(0,128)}))}catch(_e){try{_w.close()}catch(__e){}}};_w.onmessage=function(){try{_w.close()}catch(_e){}}}catch(_e){}}');
  }
  fragments.push('(function(){try{if(window.__sg_trusted)return;var _r=document.documentElement;var _dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var _bg=_dark?"#16101c":"#fbf7f1";if(_r)_r.style.backgroundColor=_bg;var _b=document.body;if(_b)_b.style.backgroundColor=_bg;var _o=document.createElement("div");_o.id="__sg_loading";_o.style.cssText="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;pointer-events:none;background:"+_bg+";color:#e87090";_o.innerHTML=\'<div style="width:28px;height:28px;border:2px solid rgba(0,0,0,.08);border-top-color:#e87090;border-radius:50%;animation:__sgSpin .8s linear infinite"></div>\';var _st=document.createElement("style");_st.id="__sg_paint_guard";_st.textContent="html,body{background-color:"+_bg+"!important}@keyframes __sgSpin{to{transform:rotate(360deg)}}";(document.head||document.documentElement).appendChild(_st);(document.body||document.documentElement).appendChild(_o)}catch(e){}})();');
  if (cache.detect) fragments.push(webkitCompatibleGuard(cache.detect));
  const jsStr = (s: string) => JSON.stringify(s).slice(1, -1).replace(/</g, '\\x3c');
  const devtoolsMsg = jsStr(msgs.devtoolsBody);
  const tamperTitle = jsStr(msgs.tamperTitle);
  const fbBadge = jsStr(msgs.blockedBadge);
  const fbTitle = jsStr(msgs.blockedTitle);
  fragments.push('window.__sg_showBlock=window.__sg_showBlock||function(msg,title,badge){var _saf=/AppleWebKit/i.test(navigator.userAgent||"")&&!/(Chrome|CriOS|Chromium|Edg|OPR)/i.test(navigator.userAgent||"");if(_saf&&/remplacement\\s+de\\s+contenu|content\\s+replacement/i.test(String(msg||"")+" "+String(title||"")))return;var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><style>@font-face{font-family:\\x27Reggae One\\x27;src:url(https://shugoi.com/reggae-one.woff2) format(\\x27woff2\\x27);font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\\\\x27Segoe UI\\\\x27,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\\x27Reggae One\\x27,Georgia,\\\\x27Times New Roman\\\\x27,serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}@media (prefers-color-scheme:dark){html,body{background:#16101c}#c{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}#c .bdg{background:rgba(233,137,159,.16);border-color:rgba(233,137,159,.5);color:#e9899f}#c h2{color:#e9899f}#c p.desc{color:#a795b4}#c p.ft{color:#e9899f}}</style></head><body><div id=c><img src=https://shugoi.com/favicon-block.png class=l><img src=https://shugoi.com/brand-block.png class=b><div class=bdg>"+(badge||"' + fbBadge + '")+"</div><h2>"+(title||"' + fbTitle + '")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push('var t=' + JSON.stringify(token));
  fragments.push('window.__sg_token=' + JSON.stringify(token));
  fragments.push('var k=' + JSON.stringify(siteKey));
  fragments.push('var b=' + JSON.stringify(baseUrl));
  fragments.push('var r=' + JSON.stringify(rurl));
  // Helpers du bootcode. localStorage peut LEVER (navigation privee, site data
  // bloque) : sans garde, l'exception remonte dans le .then et tombe dans le
  // .catch de rd() — qui accusait alors l'utilisateur d'alterer la page.
  fragments.push('function _sgLS(k){try{return localStorage.getItem(k)}catch(_e){return null}}function _sgSS(k,v){try{if(v===undefined)return sessionStorage.getItem(k);sessionStorage.setItem(k,v)}catch(_e){return null}}function _sgTamperOk(){try{var n=window.__sg_nativeErrorPages;return (window.__sg_config||{}).enableContentReplacementCheck===true&&!n&&!window.__sg_powRequired&&_sgLS(\'__sg_nativeErrorPages\')!==\'1\'&&_sgLS(\'__sg_lowInternet\')!==\'1\'}catch(_e){return false}}');
  // rd() : recupere le vrai contenu via /__shugoi/render. Un echec ici n'est PAS
  // une preuve d'alteration — c'est le plus souvent un pow_required, une reponse
  // vide ou un hoquet reseau. On ne montre la carte "remplacement de contenu"
  // que si _sgTamperOk() le permet ; sinon on retente, puis on recharge UNE fois.
  // (Regression 995a19b : la garde __sg_powRequired avait ete ajoutee en meme
  // temps qu'un `else if(window.__sg_showBlock)` qui rappelait la meme carte sans
  // condition — la garde n'a donc jamais rien empeche.)
  if (renderTransport === 'websocket') {
    fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked||window.__sg_renderDone||window.__sg_renderStarted)return;if(n>6){if(_sgTamperOk())window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");else if(_sgSS(\'__sg_rr\')!==\'1\'){_sgSS(\'__sg_rr\',\'1\');location.reload()}else window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");return}var _g=(window.__sg_grant||"");var _m=(window.__sg_detectMid||window.__sg_mid||"");if(!_g||!_m)return setTimeout(function(){rd(p,n+1)},100);var _u=(location.protocol===\'https:\'?\'wss://\':\'ws://\')+location.host+\'/api/v1/ws-wlc\';var _w;try{_w=new WebSocket(_u)}catch(_e){return setTimeout(function(){rd(p,n+1)},300)};window.__sg_renderStarted=true;var _done=false;_w.onopen=function(){try{_w.send(JSON.stringify({cmd:"render",token:t,grant:_g,mid:_m}))}catch(_e){}};_w.onmessage=function(e){if(_done||window.__sg_blocked)return;_done=true;window.__sg_renderDone=true;window.__sg_renderStarted=false;_sgSS(\'__sg_rr\',\'0\');document.open("text/html");document.write(String(e.data));document.close();window.scrollTo(0,0)};_w.onerror=function(){try{_w.close()}catch(_e){}};_w.onclose=function(){window.__sg_renderStarted=false;if(!_done&&!window.__sg_renderDone)setTimeout(function(){rd(p,n+1)},300)}}');
  } else {
    fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if(_sgTamperOk())window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");else if(_sgSS(\'__sg_rr\')!==\'1\'){_sgSS(\'__sg_rr\',\'1\');location.reload()}else window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");return}var _g=(window.__sg_grant||"");if(_g){p=p+("&grant="+encodeURIComponent(_g))}var _m=(window.__sg_detectMid||window.__sg_mid||"");if(_m){p=p+("&mid="+encodeURIComponent(_m))}fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){_sgSS(\'__sg_rr\',\'0\');document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(d.error){if(String(d.reason||d.error||"").indexOf("pow")>=0){try{window.__sg_powRequired=1}catch(_e){}}if(_sgTamperOk())window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");else setTimeout(function(){rd(p,n+1)},300)}else if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  }
  if (renderTransport === 'websocket') {
    fragments.push('var _sgRdOriginal=rd;rd=function(p,n){if(window.__sg_renderDone||window.__sg_renderStarted)return;var _sgBlocked=window.__sg_blocked;window.__sg_blocked=false;try{return _sgRdOriginal(p,n)}finally{window.__sg_blocked=_sgBlocked}}');
  }
  const renderStart = renderTransport === 'websocket' ? 'rd(r,0)' : 'rd(r+"?token="+t,0)';
  // Keep the replacement paint-safe without inflating the raw bootstrap
  // loader: document.open() clears the old shell before the delivered HTML
  // is written, so write the shell style at that exact boundary.
  if (renderTransport === 'websocket') fragments.push('var _sgNativeOpen=document.open;document.open=function(){var _d=_sgNativeOpen.call(document);var _dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;document.write("<style>html,body{background:"+(_dark?"#16101c":"#fbf7f1")+"!important}</style>");return _d};');
  if (renderTransport === 'websocket') fragments.push('window.__sg_renderKick=(function(_k){var _busy=false;return function(){if(_busy)return;_busy=true;_k()}})(window.__sg_renderKick)');
  fragments.push('window.__sg_renderKick=function(){try{if(window.__sg_grant&&!window.__sg_blocked)rd(r,0)}catch(_e){}};function _sgCl(){try{for(var _i in window){if(_i.indexOf("__sg")===0&&_i!=="__sg_grant"&&_i!=="__sg_config"&&_i!=="__sg_pow"&&_i!=="__sg_powRequired"&&_i!=="__sg_token"&&_i!=="__sg_siteKey"&&_i!=="__sg_mid"&&_i!=="__sg_detectMid"&&_i!=="__sg_clockdrift"&&_i!=="__sg_metrics"&&_i!=="__sg_renderKick"&&_i!=="__sg_renderStarted"&&_i!=="__sg_renderDone"){window[_i]=null;delete window[_i]}}window._sgLogCP=function(){};window.midHex=function(){};window.applyDecision=function(){};window._D=function(){};window.z=function(f){return f()}}catch(_e){}}_gw(function(){' + renderStart + ';setTimeout(_sgCl,1500)});setInterval(function(){try{if(window.__sg_renderKick)window.__sg_renderKick()}catch(_e){}},250)');
  const rawBootCode = fragments.join(';');
  // L'obfuscation du bootcode SSR est indépendante des outils développeur :
  // ceux-ci ne sont pas un signal d'autorisation. La variation par rendu reste
  // une défense de coût contre la copie triviale, jamais une frontière de sécurité.
  // ⚠️ Couche "invisible eval" (U+E0000, applyInvisibleEval) TEMPORAIREMENT
  // RETIRÉE : elle crash WebKit/Safari (le bootcode encodé s'affiche en <pre>
  // → page morte). Le code est conservé dans obfuscate.ts (applyInvisibleEval)
  // pour réactivation future — voir AGENTS.md. Pas d'eval → CSP sans
  // 'unsafe-eval'.
  // Compatibility is part of availability: the transform has crashed WebKit
  // in real protected navigation. It only raises copying cost, so it is an
  // explicit opt-in and never a prerequisite for the authorization boundary.
  const active = process.env.NODE_ENV === 'production' && process.env.SHUGOI_BOOT_OBFUSCATE === '1';
  const variantSeed = createHash('sha256').update(`${siteKey}:${token}`).digest('hex');
  const bootCode = rawBootCode.replace(/<\/(script|style)/gi, '<\\/$1');
  storeBootstrap(token, '<script>' + bootCode + '</script>');
  // The document initially contains only this loader. The complete, per-token
  // guard bootstrap is returned as the first WebSocket frame and replaces it.
  // Keep the invisible PUA-B loader contract. The percent-encoded form is
  // required in HTML: Chromium otherwise serializes the supplementary code
  // point as an empty src attribute.
  return '<script src=󠁡></script>'; 
}

export async function injectGuardScripts(html: string, siteKey: string, baseUrl: string, whitelist?: string[] | null, restrictedAccess?: boolean, signingSecret?: string, _req?: object, _allowedOrigins?: string[], locale?: Locale, clockts?: number, midAnchorOk?: boolean, renderUrl = './__shugoi/render', renderTransport: 'http' | 'websocket' = 'http'): Promise<string> {
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
  storeHtml(signed.token, injectedHtml);
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, wl, renderUrl, locale, cfgData.flags, clockts, signingSecret, cfgData.supportEmail, midAnchorOk, renderTransport);
}

export function enableDiskStore(multiProcess: boolean) {
  _diskEnabled = multiProcess;
  if (multiProcess) startDiskCleanup();
}
