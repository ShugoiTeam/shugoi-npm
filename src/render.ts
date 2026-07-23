// @ts-nocheck
import crypto from 'node:crypto';

// ── Obfuscation ──
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function hexToBytes(hex) {
  let b = [];
  for (let i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16));
  return b;
}

function xorEncrypt(str, hexKey) {
  const kb = hexToBytes(hexKey);
  let enc = '';
  for (let i = 0; i < str.length; i++) {
    let cc = str.charCodeAt(i) ^ kb[i % kb.length];
    enc += cc.toString(16).padStart(2, '0');
  }
  return enc;
}

function runtimeValue(str) {
  let s = str.slice(1, -1);
  return s.replace(/\\(['"\\bfnrtv0])/g, (_, c) => {
    const map = { "'": "'", '"': '"', '\\': '\\', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v', '0': '\0' };
    return map[c];
  }).replace(/\\(u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/g, (_, __, ubrace, u4, x2) => {
    const code = ubrace ? parseInt(ubrace, 16) : (u4 ? parseInt(u4, 16) : parseInt(x2, 16));
    return String.fromCodePoint(code);
  });
}

function encryptStrings(code, key) {
  let r = '', i = 0;
  while (i < code.length) {
    if (code[i] === "'" || code[i] === '"') {
      const q = code[i];
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === q) break;
        j++;
      }
      if (j < code.length) {
        const val = runtimeValue(code.slice(i, j + 1));
        r += '_D("' + xorEncrypt(val, key) + '")';
        i = j + 1;
      } else { r += code[i]; i++; }
    } else { r += code[i]; i++; }
  }
  return r;
}

// Fix object property keys: {_D("hex"):} -> {[_D("hex")]:}
function fixComputedProperties(code) {
  return code.replace(/([{,])(\s*)_D\("([^"]*)"\)(\s*:)/g, '$1$2[_D("$3")]$4');
}

function stripComments(s) {
  return s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n');
}

function _dFunc(hexKey) {
  let kb = hexToBytes(hexKey);
  let ks = kb.map(b => '\\x' + b.toString(16).padStart(2, '0')).join('');
  return 'var _D=function(h){var k="' + ks + '",r="";for(var i=0;i<h.length;i+=2){r+=String.fromCharCode(parseInt(h.substr(i,2),16)^k.charCodeAt((i/2)%' + kb.length + '))}return r};';
}

const RENAMES = { buildOverlay: '_wf', checkNotice: '_wg', hex: '_wh', stable: '_wi' };

function obfuscateGuards(code, seed) {
  let r = stripComments(code);
  const names = Object.entries(RENAMES).sort((a, b) => {
    const ha = hash(a[0] + seed), hb = hash(b[0] + seed);
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });
  for (const [from, to] of names) {
    const suffix = (hash(from + seed) % 9000 + 1000).toString(36);
    const newName = to + suffix;
    r = r.replace(new RegExp('\\b' + from + '\\(', 'g'), newName + '(');
  }
  return r;
}

function deriveKey(seed) {
  const shasum = crypto.createHash('sha256');
  return shasum.update(seed + 'sg_val_v1').digest('hex').slice(0, 32);
}

function applyObfuscation(code, seed) {
  let r = obfuscateGuards(code, seed);
  const encKey = deriveKey(seed);
  r = encryptStrings(r, encKey);
  r = r.replace(/^\s*\(function\(\)\{/, (m) => m + _dFunc(encKey));
  r = r.replace(/<\/(script|style)/gi, '<\\/$1');
  r = fixComputedProperties(r);
  return r;
}

// ── Token Store ──
const _tokenStore = new Map();
const _consumedTokens = new Set();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _tokenStore) if (now - val.createdAt > 30000) _tokenStore.delete(key);
  for (const key of _consumedTokens) if (now - parseInt(key.split(':')[1] || '0') > 60000) _consumedTokens.delete(key);
}, 10000).unref();

// ── Guard Script Cache ──
const _guardCache = { detect: null, guard: null, fetching: false, queue: [] };
async function fetchGuardScripts(baseUrl) {
  if (_guardCache.fetching) return new Promise(resolve => { _guardCache.queue.push(resolve); });
  _guardCache.fetching = true;
  try {
    const cb = Date.now();
    const [dRes, gRes] = await Promise.all([
      fetch(baseUrl + '/guard-detect?key=cache&cb=' + cb),
      fetch(baseUrl + '/guard?key=cache&cb=' + cb),
    ]);
    const rawDetect = await dRes.text();
    const rawGuard = await gRes.text();
    // Apply obfuscation with per-init seed
    const seed = cb.toString(36);
    _guardCache.detect = applyObfuscation(rawDetect, seed);
    _guardCache.guard = applyObfuscation(rawGuard, seed);
  } catch (e) {
    _guardCache.detect = _guardCache.detect || 'console.error("Shugoi guard-detect unavailable")';
    _guardCache.guard = _guardCache.guard || 'console.error("Shugoi guard unavailable")';
  }
  _guardCache.fetching = false;
  _guardCache.queue.forEach(r => r());
  _guardCache.queue = [];
}

// ── Token Store ──
export function storeHtml(token, html) {
  _tokenStore.set(token, { html, consumed: false, createdAt: Date.now() });
}

// ── Token Signing ──
export function signToken(siteKey, timestamp, secretOverride) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || 'dev-secret-do-not-use-in-prod';
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = [siteKey, timestamp, nonce].join(':');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { token: payload + ':' + sig };
}

// ── Render Response Data ──
export function renderResponseData(token) {
  const entry = _tokenStore.get(token);
  if (!entry) {
    const parts = token.split(':');
    if (parts.length === 4 && !_consumedTokens.has(token)) {
      return { blocked: true, reason: 'manual_modification', message: 'Remplacement de contenu client d\u00e9tect\u00e9', title: 'Remplacement de contenu client d\u00e9tect\u00e9' };
    }
    return { error: 'not_found' };
  }
  if (entry.consumed) return { error: 'not_found' };
  entry.consumed = true;
  _consumedTokens.add(token);
  return { html: entry.html };
}

// ── Handle Render Endpoint ──
export function handleRender(token, res) {
  const data = renderResponseData(token);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader('Content-Type', 'application/json');
  if (res.send) res.send(json); else if (res.end) res.end(json);
}

// ── Skeleton HTML Generator ──
export async function generateSkeleton(siteKey, token, baseUrl, restrictedAccess, whitelist, renderUrl) {
  await ensureGuardsReady(baseUrl);
  const rurl = renderUrl || './__shugoi/render';

  const fragments = [];
  if (whitelist) fragments.push('window.__sg_whitelist=' + JSON.stringify(whitelist));
  if (!restrictedAccess) fragments.push('window.__sg_disableRestrictedAccess=true');
  if (_guardCache.detect) fragments.push('try{' + _guardCache.detect + '}catch(e){window.__sg_blocked=true}');
  if (_guardCache.guard) fragments.push('try{' + _guardCache.guard + '}catch(e){window.__sg_blocked=true}');
  fragments.push('window.__sg_showBlock=function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><link href=https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap rel=stylesheet><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:Alex Brush,cursive;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon.png class=l><img src=https://shugoi.com/brand.png class=b><div class=bdg>"+(badge||"Blocage")+"</div><h2>"+(title||"Acces bloque")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push('var t="' + token + '"');
  fragments.push('var k="' + siteKey + '"');
  fragments.push('var b="' + baseUrl + '"');
  fragments.push('var r="' + rurl + '"');
  fragments.push('function rd(p,n){if(window.__sg_blocked)return;if(n>6){window.__sg_showBlock&&window.__sg_showBlock("L\\u0027utilisation des Devtools pour remplacer le contenu ou modifier les requ\\u00eates r\\u00e9seau a \\u00e9t\\u00e9 d\\u00e9tect\\u00e9e. L\\u0027int\\u00e9grit\\u00e9 de la page est prot\\u00e9g\\u00e9e et toute alt\\u00e9ration est imm\\u00e9diatement bloqu\\u00e9e. Eh oui ! On le d\\u00e9tecte aussi.","Remplacement de contenu client d\\u00e9tect\\u00e9");return}fetch(p).then(function(x){return x.json()}).then(function(d){if(d.html){document.body.innerHTML=d.html;var q=document.querySelectorAll("body script");for(var i=0;i<q.length;i++)q[i].remove()}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('setTimeout(function(){if(!window.__sg_blocked){rd(r+"?token="+t,0)}},500)');

  const combinedCode = fragments.join(';');
  let encStr = '';
  for (let i = 0; i < combinedCode.length; i++) {
    encStr += String.fromCodePoint(917504 + combinedCode.charCodeAt(i));
  }

  const bootCode = "eval([...'" + encStr + "'].map(x=>String.fromCodePoint(x.codePointAt(0)-917504)).join(''))";
  return '<script>' + bootCode + '</script>';
}

// ── Guard Script Injection (replaces HTML with skeleton) ──
export async function injectGuardScripts(html, siteKey, baseUrl, whitelist, restrictedAccess, signingSecret, req) {
  await ensureGuardsReady(baseUrl);
  const ts = Date.now();
  const signed = signToken(siteKey, ts, signingSecret);

  const configVars = [];
  if (whitelist) configVars.push('window.__sg_whitelist=' + JSON.stringify(whitelist));
  if (!restrictedAccess) configVars.push('window.__sg_disableRestrictedAccess=true');
  const configScript = configVars.length ? '<script>' + configVars.join(';') + '</script>' : '';

  let injectedHtml = html;
  const headClose = injectedHtml.indexOf('</head>');
  if (headClose >= 0) {
    injectedHtml = injectedHtml.slice(0, headClose) + configScript + injectedHtml.slice(headClose);
  } else if (injectedHtml.includes('<body')) {
    const bm = injectedHtml.match(/<body[^>]*>/);
    if (bm) {
      const at = injectedHtml.indexOf(bm[0]) + bm[0].length;
      injectedHtml = injectedHtml.slice(0, at) + configScript + injectedHtml.slice(at);
    }
  } else {
    injectedHtml = configScript + injectedHtml;
  }

  storeHtml(signed.token, injectedHtml);

  const renderUrl = './__shugoi/render';
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, whitelist, renderUrl);
}

// ── Lazy guard fetch ──
// Not called at module init to avoid deadlock when server fetches from itself.
// Call ensureGuardsReady(baseUrl) before generateSkeleton/injectGuardScripts.
export async function ensureGuardsReady(baseUrl) {
  if (_guardCache.detect && _guardCache.guard) return;
  await fetchGuardScripts(baseUrl);
}
