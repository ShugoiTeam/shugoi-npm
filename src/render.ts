// @ts-nocheck
import crypto from 'crypto';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Token storage ──
const TOKEN_DIR = join(tmpdir(), 'shugoi-render');
const TOKEN_TTL = 120_000;

if (!existsSync(TOKEN_DIR)) try { mkdirSync(TOKEN_DIR, { recursive: true }); } catch {}

setInterval(() => {
  try {
    for (const f of readdirSync(TOKEN_DIR)) {
      const p = join(TOKEN_DIR, f);
      if (Date.now() - parseInt(f.split('_')[0] || '0') > TOKEN_TTL) try { unlinkSync(p); } catch {}
    }
  } catch {}
}, 30_000).unref();

export function storeHtml(token, html) {
  try { writeFileSync(join(TOKEN_DIR, Date.now() + '_' + token.slice(-16)), html, 'utf-8'); } catch {}
}

export function renderResponseData(token) {
  if (!token || token.length < 16 || token.length > 300) return { error: 'not_found' };
  const suffix = token.slice(-16);
  try {
    for (const f of readdirSync(TOKEN_DIR)) {
      if (f.endsWith(suffix)) {
        const html = readFileSync(join(TOKEN_DIR, f), 'utf-8');
        try { unlinkSync(join(TOKEN_DIR, f)); } catch {}
        return { html };
      }
    }
  } catch {}
  const parts = token.split(':');
  if (parts.length === 4 && parts[3] && parts[3].length === 64) {
    return { blocked: true, reason: 'manual_modification', message: 'Nous avons remarqu\u00e9 que vous avez tent\u00e9 de modifier manuellement le rendu client c\u00f4t\u00e9 navigateur via les DevTools. Cette pratique est \u00e9videmment bloqu\u00e9e par nos services. Et oui, m\u00eame \u00e7a on le voit !', title: 'Remplacement de contenu client d\u00e9tect\u00e9' };
  }
  return { error: 'not_found' };
}

export function handleRender(token, res) {
  const data = renderResponseData(token);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader('Content-Type', 'application/json');
  if (res.send) res.send(json);
  else if (res.end) res.end(json);
}

// ── Signing ──
export function signToken(siteKey, timestamp, secretOverride) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!secret) return { token: '' };
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = [siteKey, timestamp, nonce].join(':');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { token: payload + ':' + sig };
}

// ── Guard cache ──
const RENAMES = { buildOverlay: '_wf', checkNotice: '_wg', hex: '_wh', stable: '_wi' };
let _lastConfig = {};
const GUARD_CACHE_TTL = 300_000;
let _guardCache = { detect: null, guard: null, fetching: false, queue: [], fetchedAt: 0 };

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function hexToBytes(hex) {
  const b = [];
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
  return s.replace(/\\(['"\\bfnrtv0])/g, (_, c) => ({ "'": "'", '"': '"', '\\': '\\', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v', '0': '\0' })[c])
    .replace(/\\(u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/g, (_, __, ubrace, u4, x2) => {
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
      while (j < code.length) { if (code[j] === '\\') { j += 2; continue; } if (code[j] === q) break; j++; }
      if (j < code.length) {
        const val = runtimeValue(code.slice(i, j + 1));
        r += '_D("' + xorEncrypt(val, key) + '")';
        i = j + 1;
      } else { r += code[i]; i++; }
    } else { r += code[i]; i++; }
  }
  return r;
}

function fixComputedProperties(code) {
  return code.replace(/([{,])(\s*)_D\("([^"]*)"\)(\s*:)/g, '$1$2[_D("$3")]$4');
}

function stripComments(s) {
  return s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n');
}

function _dFunc(hexKey) {
  const keyLen = hexKey.length / 2;
  return 'var _D=function(h){var k="' + hexKey + '",r="";for(var i=0;i<h.length;i+=2){r+=String.fromCharCode(parseInt(h.substr(i,2),16)^parseInt(k.substr(((i/2)%' + keyLen + ')*2,2),16))}return r};';
}

function obfuscateGuards(code, seed) {
  let r = stripComments(code);
  const names = Object.entries(RENAMES).sort((a, b) => { const ha = hash(a[0] + seed), hb = hash(b[0] + seed); return ha < hb ? -1 : ha > hb ? 1 : 0; });
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

function seededRng(seed) {
  let s = hash(seed + '_shuffle');
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function shuffleCode(code, seed) {
  const lines = code.split('\n');
  const depth = new Array(lines.length).fill(0);
  let d = 0;
  for (let i = 0; i < lines.length; i++) {
    depth[i] = d;
    for (const ch of lines[i]) {
      if (ch === '{') d++;
      else if (ch === '}') d--;
    }
  }
  const blocks = [];
  let start = null;
  for (let i = 0; i < lines.length; i++) {
    const isShuffleable = depth[i] === 1 && /^\s*R\.\w+\s*=/.test(lines[i]) && !/[{}]/.test(lines[i]) && lines[i].trimEnd().endsWith(';');
    if (isShuffleable && start === null) start = i;
    if (!isShuffleable && start !== null) {
      blocks.push({ start, end: i - 1 });
      start = null;
    }
  }
  if (start !== null) blocks.push({ start, end: lines.length - 1 });
  const rng = seededRng(seed);
  for (const blk of blocks) {
    const slice = lines.slice(blk.start, blk.end + 1);
    for (let i = slice.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [slice[i], slice[j]] = [slice[j], slice[i]];
    }
    lines.splice(blk.start, slice.length, ...slice);
  }
  return lines.join('\n');
}

function applyObfuscation(code, seed) {
  let r = obfuscateGuards(code, seed);
  r = shuffleCode(r, seed);
  const encKey = deriveKey(seed);
  r = encryptStrings(r, encKey);
  r = r.replace(/^\s*\(function\(\)\{/, (m) => m + _dFunc(encKey));
  r = r.replace(/<\/(script|style)/gi, '<\\/$1');
  r = fixComputedProperties(r);
  return r;
}

export async function fetchWhitelistForSiteKey(siteKey, baseUrl) {
  try {
    const res = await fetch(baseUrl + '/whitelist?key=' + encodeURIComponent(siteKey) + '&_=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      _lastConfig[baseUrl + '@' + siteKey] = data.detectionFlags || {};
      return data.whitelistedMachines || [];
    }
  } catch {}
  return [];
}

export async function fetchConfigForSiteKey(siteKey, baseUrl) {
  await fetchWhitelistForSiteKey(siteKey, baseUrl);
  return _lastConfig[baseUrl + '@' + siteKey] || {};
}

async function fetchGuardScripts(baseUrl, secret, siteKey) {
  if (_guardCache.fetching) return new Promise((resolve) => { _guardCache.queue.push(resolve); });
  _guardCache.fetching = true;
  try {
    const cb = Date.now();
    const sk = siteKey || 'cache';
    const sig = secret ? crypto.createHmac('sha256', secret).update(cb.toString()).digest('hex') : '';
    const [dRes, gRes] = await Promise.all([
      fetch(baseUrl + '/guard-detect?key=' + sk + '&raw=1&cb=' + cb + (sig ? '&sig=' + sig : '')),
      fetch(baseUrl + '/guard?key=' + sk + '&raw=1&cb=' + cb + (sig ? '&sig=' + sig : '')),
    ]);
    const rawDetect = await dRes.text();
    const rawGuard = await gRes.text();
    const seed = cb.toString(36);
    _guardCache.detect = applyObfuscation(rawDetect, seed);
    _guardCache.guard = applyObfuscation(rawGuard, seed);
    _guardCache.fetchedAt = Date.now();
  } catch (e) {
    _guardCache.detect = _guardCache.detect || 'console.error("Shugoi guard-detect unavailable")';
    _guardCache.guard = _guardCache.guard || 'console.error("Shugoi guard unavailable")';
  }
  _guardCache.fetching = false;
  _guardCache.queue.forEach((r) => r());
  _guardCache.queue = [];
}

export async function ensureGuardsReady(baseUrl, secret, siteKey) {
  if (_guardCache.detect && _guardCache.guard && Date.now() - _guardCache.fetchedAt < GUARD_CACHE_TTL) return;
  await fetchGuardScripts(baseUrl, secret, siteKey);
}

export async function generateSkeleton(siteKey, token, baseUrl, restrictedAccess, whitelist, renderUrl) {
  await ensureGuardsReady(baseUrl);
  const rurl = renderUrl || './__shugoi/render';
  if (!whitelist) whitelist = await fetchWhitelistForSiteKey(siteKey, baseUrl);
  const cfg = await fetchConfigForSiteKey(siteKey, baseUrl);
  const fragments = [];
  fragments.push('window.__sg_siteKey=' + JSON.stringify(siteKey));
  fragments.push('window.__sg_config=' + JSON.stringify(cfg));
  if (!restrictedAccess) fragments.push('window.__sg_disableRestrictedAccess=true');
  if (_guardCache.detect) fragments.push("try{" + _guardCache.detect + "}catch(e){window.__sg_blocked=true}");
  if (_guardCache.guard) fragments.push("try{" + _guardCache.guard + "}catch(e){window.__sg_blocked=true}");
  fragments.push('window.__sg_showBlock=function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><link href=https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap rel=stylesheet><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:Alex Brush,cursive;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon-block.png class=l><img src=https://shugoi.com/brand-block.png class=b><div class=bdg>"+(badge||"Blocage")+"</div><h2>"+(title||"Acces bloque")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push('var t="' + token + '"');
  fragments.push('var k="' + siteKey + '"');
  fragments.push('var b="' + baseUrl + '"');
  fragments.push('var r="' + rurl + '"');
  fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if((window.__sg_config||{}).enableContentReplacementCheck!==false)window.__sg_showBlock&&window.__sg_showBlock("L\\u0027utilisation des Devtools pour remplacer le contenu ou modifier les requ\\u00eates r\\u00e9seau a \\u00e9t\\u00e9 d\\u00e9tect\\u00e9e. L\\u0027int\\u00e9grit\\u00e9 de la page est prot\\u00e9g\\u00e9e et toute alt\\u00e9ration est imm\\u00e9diatement bloqu\\u00e9e. Eh oui ! On le d\\u00e9tecte aussi.","Remplacement de contenu client d\\u00e9tect\\u00e9");return}fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('function _sgCl(){try{for(var _i in window){if(_i.indexOf("__sg")===0){window[_i]=null;delete window[_i]}}window._sgLogCP=function(){};window.midHex=function(){};window.rd=function(){};window._gw=function(){};window.applyDecision=function(){};window._D=function(){};window.z=function(f){return f()}}catch(_e){}}_gw(function(){rd(r+"?token="+t,0);setTimeout(_sgCl,1500)})');
  const combinedCode = fragments.join(';');
  let encStr = '';
  for (let i = 0; i < combinedCode.length; i++) encStr += String.fromCodePoint(917504 + combinedCode.charCodeAt(i));
  const decodedCall = "[...'" + encStr + "'].map(x=>String.fromCodePoint(x.codePointAt(0)-917504)).join('')";
  const bootCode = "eval(" + decodedCall + ")";
  return '<script>' + bootCode + '</script>';
}

export async function injectGuardScripts(html, siteKey, baseUrl, whitelist, restrictedAccess, signingSecret, req, allowedOrigins = []) {
  await ensureGuardsReady(baseUrl);
  if (!whitelist) whitelist = await fetchWhitelistForSiteKey(siteKey, baseUrl);
  const cfg = await fetchConfigForSiteKey(siteKey, baseUrl);
  const ts = Date.now();
  const signed = signToken(siteKey, ts, signingSecret);
  const configVars = [];
  if (!restrictedAccess) configVars.push('window.__sg_disableRestrictedAccess=true');
  if (allowedOrigins && allowedOrigins.length > 0) configVars.push('window.__sg_allowedOrigins=' + JSON.stringify(allowedOrigins));
  const configScript = configVars.length ? '<script>' + configVars.join(';') + '</script>' : '';
  let injectedHtml = html;
  const headClose = injectedHtml.indexOf('</head>');
  if (headClose >= 0) injectedHtml = injectedHtml.slice(0, headClose) + configScript + injectedHtml.slice(headClose);
  else if (injectedHtml.includes('<body')) { const bm = injectedHtml.match(/<body[^>]*>/); if (bm) { const at = injectedHtml.indexOf(bm[0]) + bm[0].length; injectedHtml = injectedHtml.slice(0, at) + configScript + injectedHtml.slice(at); } }
  else injectedHtml = configScript + injectedHtml;
  storeHtml(signed.token, injectedHtml);
  const renderUrl = './__shugoi/render';
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, whitelist, renderUrl);
}
