import crypto, { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, chmodSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MESSAGES, type Locale } from './locales';
import type { JsonObject } from './types';
import { applyBootObfuscation, applyInvisibleEval } from './obfuscate';
import { createMidAnchorValue, isMidAnchorValid } from './cookie-security';

const runtimeGlobal = globalThis as typeof globalThis & {
  __sg_ntpDrift?: number;
  __sg_ntpTime?: number;
};

const TOKEN_DIR = join(tmpdir(), 'shugoi-render-' + (process.getuid?.() ?? 'x'));
const TOKEN_TTL = 120_000;
const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_TOKEN_READS = 1;


interface StoredEntry { html: string; expiresAt: number; reads: number; contentReplaceOn?: boolean }
const _memoryStore = new Map<string, StoredEntry>();
const _siteCache = new Map<string, string>();

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
  dropEntry(token);
  const size = Buffer.byteLength(html, 'utf-8');
  while ((_memoryStore.size >= MAX_ENTRIES || _totalBytes + size > MAX_TOTAL_BYTES) && _memoryStore.size > 0) {
    evictOldest();
  }
  const entry: StoredEntry = { html, expiresAt: Date.now() + TOKEN_TTL, reads: 0 };
  if (contentReplaceOn !== undefined) entry.contentReplaceOn = contentReplaceOn;
  _memoryStore.set(token, entry);
  _totalBytes += size;
  const separator = token.indexOf(':');
  if (separator > 0) {
    const siteKey = token.slice(0, separator);
    _siteCache.delete(siteKey);
    _siteCache.set(siteKey, html);
    while (_siteCache.size > MAX_TENANTS) {
      const oldest = _siteCache.keys().next();
      if (oldest.done) break;
      _siteCache.delete(oldest.value);
    }
  }
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
    return entry.html;
  }
  return entry.html;
}

const GRANT_TTL_MS = 120_000;

export function verifyRenderGrant(mid: string | undefined, grant: string | undefined, token?: string, _ip?: string, expectedSiteKey?: string): boolean {
  const gSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
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

export async function renderResponseData(token: string, locale?: Locale, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, _secret?: string): Promise<{ html?: string; error?: string; blocked?: boolean; reason?: string; message?: string; title?: string }> {
  if (!token || token.length < 16 || token.length > 300) return { error: 'not_found' };

  if (expectedSiteKey) {
    const tokSiteKey = token.split(':')[0];
    if (tokSiteKey !== expectedSiteKey) return { error: 'not_found' };
  }

  // Le grant signé (≤ GRANT_TTL_MS) est l'autorisation réelle. Un token plus
  // ancien que TOKEN_TTL reste accepté quand un grant FRAIS et valide le couvre
  // (ex. content-override d'une machine autorisée qui réutilise son token :
  // le wlc a ré-émis un grant pour ce token). Sans grant valide → not_found.
  if (!verifyRenderGrant(mid, grant, token, ip, expectedSiteKey)) return { error: 'not_found' };

  const contentReplaceOn = await fetchContentReplaceFlag(token, configUrl || 'http://127.0.0.1:3098', _secret);

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

  if (!contentReplaceOn) {
    const siteKey = token.split(':')[0] ?? '';
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
    const { flags } = await getConfig(siteKey, internalUrl, _secret);
    return flags?.enableContentReplacementCheck === true;
  } catch {
    if (retries > 0) return fetchContentReplaceFlag(token, internalUrl, _secret, retries - 1);
    return false;
  }
}

function verifyTokenAndRead(token: string, _locale?: Locale): { html?: string; error?: string; blocked?: boolean; reason?: string; message?: string; title?: string } {
  const parts = token.split(':');
  if (parts.length !== 4 || parts[3] === undefined || parts[3].length !== 64) {
    return { error: 'not_found' };
  }

  const [siteKey = '', timestamp = '', nonce = '', sig = ''] = parts;
  const ts = parseInt(timestamp, 10);

  if (isNaN(ts)) {
    return { error: 'not_found' };
  }
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

export function injectReferrerPolicy(html: string): string {
  const meta = '<meta name="referrer" content="strict-origin-when-cross-origin">';
  if (html.includes('<head>')) return html.replace('<head>', '<head>' + meta);
  if (html.includes('<html')) {
    const m = html.match(/<html[^>]*>/);
    if (m) return html.replace(m[0], m[0] + meta);
  }
  return meta + html;
}

export async function handleRender(token: string, res: { setHeader?: (k: string, v: string) => void; getHeader?: (k: string) => string | number | string[] | undefined; send?: (body: string) => void; end?: (body: string) => void }, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, baseUrl?: string, _secret?: string, ua?: string, midAnchor?: string) {
  const data = await renderResponseData(token, undefined, configUrl, mid, grant, ip, expectedSiteKey, _secret);
  if (data.html && mid) data.html = injectNoticeScript(data.html, mid, expectedSiteKey || token.split(':')[0] || '', baseUrl);
  if (data.html) data.html = injectReferrerPolicy(data.html);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader('Content-Type', 'application/json');
  if (res.setHeader) res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (res.setHeader) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
  if (res.setHeader) res.setHeader('Pragma', 'no-cache');
  if (data.html && res.setHeader) {
    const authSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
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
        const current = Array.isArray(existing) ? existing : [existing];
        res.setHeader('Set-Cookie', [...current, ...cookies] as unknown as string);
      } else {
        res.setHeader('Set-Cookie', cookies as unknown as string);
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
  const inject = NOTICE_SCRIPT
    .replace('var mid=window.__sg_mid||\'\';', 'var mid=' + JSON.stringify(mid) + '||\'\';')
    .replace('var sk=window.__sg_siteKey||\'\';', 'var sk=' + JSON.stringify(siteKey) + '||\'\';')
    .replace('var base=window.__sg_baseUrl||\'\';', 'var base=' + JSON.stringify(baseVal) + '||window.__sg_baseUrl||\'\';')
    .replace('window.__sg_noticeEnabled', 'window.__sg_noticeEnabled');
  if (html.includes('</body>')) return html.replace('</body>', inject + '</body>');
  return html + inject;
}

export function signToken(siteKey: string, timestamp: number, secretOverride?: string): { token: string } {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
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
  try {
    const cb = Date.now();
    const sig = secret ? crypto.createHmac('sha256', secret).update(cb.toString()).digest('hex') : '';
    const res = await fetch(baseUrl + '/whitelist?key=' + encodeURIComponent(siteKey) + '&cb=' + cb + (sig ? '&sig=' + sig : ''), {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json() as JsonObject;
      entry.whitelist = (data.whitelistedMachines as string[]) || [];
      entry.flags = (data.detectionFlags as Record<string, boolean>) || (data.flags as Record<string, boolean>) || {};
      entry.skipPaths = (data.skipPaths as string[]) || [];
      entry.supportEmail = typeof data.supportEmail === 'string' ? data.supportEmail : '';
    }
  } catch {}
  entry.fetchedAt = Date.now();
}

export async function getConfig(siteKey: string, baseUrl: string, secret?: string): Promise<{ whitelist: string[]; flags: Record<string, boolean>; skipPaths: string[]; supportEmail: string }> {
  const key = configKey(baseUrl, siteKey);
  let entry = _configCache.get(key);
  if (!entry) {
    entry = { whitelist: [], flags: {}, skipPaths: [], supportEmail: '', fetchedAt: 0, inflight: null };
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
    entry.inflight.catch(() => {});
  }

  return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths, supportEmail: entry.supportEmail };
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
    cache.detect = cache.detect || 'console.error("Shugoi guard-detect unavailable")';
    cache.guard = cache.guard || 'console.error("Shugoi guard unavailable")';
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

export async function ensureGuardsReady(baseUrl: string, secret?: string, siteKey?: string): Promise<void> {
  const cache = getCacheEntry(baseUrl, siteKey || 'cache');
  if (!cache.detect || !cache.guard) {
    await fetchGuardScripts(baseUrl, secret, siteKey);
  }
  startGuardPoller(baseUrl, secret, siteKey);
}

export async function generateSkeleton(siteKey: string, token: string, baseUrl: string, restrictedAccess?: boolean, _whitelist?: string[], renderUrl?: string, locale?: Locale, flags?: Record<string, boolean>, clockts?: number, signingSecret?: string, supportEmail?: string, midAnchorOk?: boolean): Promise<string> {
  await ensureGuardsReady(baseUrl, undefined, siteKey);
  const rurl = renderUrl || './__shugoi/render';
  const fetched = flags ? null : await getConfig(siteKey, baseUrl, signingSecret);
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
  const _powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || '';
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
  if (cache.detect) fragments.push("try{" + cache.detect + "}catch(e){window.__sg_blocked=true}");
  const jsStr = (s: string) => JSON.stringify(s).slice(1, -1).replace(/</g, '\\x3c');
  const devtoolsMsg = jsStr(msgs.devtoolsBody);
  const tamperTitle = jsStr(msgs.tamperTitle);
  const fbBadge = jsStr(msgs.blockedBadge);
  const fbTitle = jsStr(msgs.blockedTitle);
  fragments.push('window.__sg_showBlock=window.__sg_showBlock||function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><style>@font-face{font-family:\\x27Alex Brush\\x27;src:url(https://shugoi.com/alex-brush.woff2?v=2) format(\\x27woff2\\x27);font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\\\\x27Segoe UI\\\\x27,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\\x27Alex Brush\\x27,Georgia,\\\\x27Times New Roman\\\\x27,serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}@media (prefers-color-scheme:dark){html,body{background:#16101c}#c{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}#c .bdg{background:rgba(233,137,159,.16);border-color:rgba(233,137,159,.5);color:#e9899f}#c h2{color:#e9899f}#c p.desc{color:#a795b4}#c p.ft{color:#e9899f}}</style></head><body><div id=c><img src=https://shugoi.com/favicon-block.png class=l><img src=https://shugoi.com/brand-block.png class=b><div class=bdg>"+(badge||"' + fbBadge + '")+"</div><h2>"+(title||"' + fbTitle + '")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push('var t=' + JSON.stringify(token));
  fragments.push('window.__sg_token=' + JSON.stringify(token));
  fragments.push('var k=' + JSON.stringify(siteKey));
  fragments.push('var b=' + JSON.stringify(baseUrl));
  fragments.push('var r=' + JSON.stringify(rurl));
  fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if((window.__sg_config||{}).enableContentReplacementCheck===true&&!window.__sg_lowInternet&&localStorage.getItem(\'__sg_lowInternet\')!==\'1\')window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");else location.reload();return}var _g=(window.__sg_grant||"");if(_g){p=p+("&grant="+encodeURIComponent(_g))}var _m=(window.__sg_detectMid||window.__sg_mid||"");if(_m){p=p+("&mid="+encodeURIComponent(_m))}fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(d.error){if((window.__sg_config||{}).enableContentReplacementCheck===true&&!window.__sg_lowInternet&&localStorage.getItem(\'__sg_lowInternet\')!==\'1\')window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");else setTimeout(function(){rd(p,n+1)},300)}else if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('function _sgCl(){try{for(var _i in window){if(_i.indexOf("__sg")===0&&_i!=="__sg_grant"&&_i!=="__sg_config"){window[_i]=null;delete window[_i]}}window._sgLogCP=function(){};window.midHex=function(){};window.rd=function(){};window._gw=function(){};window.applyDecision=function(){};window._D=function(){};window.z=function(f){return f()}}catch(_e){}}_gw(function(){rd(r+"?token="+t,0);setTimeout(_sgCl,1500)})');
  const rawBootCode = fragments.join(';');
  const variantSeed = createHash('sha256').update(`${siteKey}:${token}`).digest('hex');
  const bootCode = (process.env.NODE_ENV === 'production' && cfg.enableDevtoolsCheck !== false
    ? applyInvisibleEval(applyBootObfuscation(rawBootCode, variantSeed), variantSeed + '::e0')
    : rawBootCode).replace(/<\/(script|style)/gi, '<\\/$1');
  return '<script>' + bootCode + '</script>';
}

export async function injectGuardScripts(html: string, siteKey: string, baseUrl: string, whitelist?: string[] | null, restrictedAccess?: boolean, signingSecret?: string, _req?: object, _allowedOrigins?: string[], locale?: Locale, clockts?: number, midAnchorOk?: boolean): Promise<string> {
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
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, wl, renderUrl, locale, cfgData.flags, clockts, signingSecret, cfgData.supportEmail, midAnchorOk);
}

export function enableDiskStore(multiProcess: boolean) {
  _diskEnabled = multiProcess;
  if (multiProcess) startDiskCleanup();
}
