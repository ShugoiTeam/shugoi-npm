// src/csp.ts
var SHUGOI_ORIGIN = "https://shugoi.com";
function baseDirectives(apiOrigin) {
  const api = [...new Set([SHUGOI_ORIGIN, apiOrigin].filter(Boolean))];
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...api],
    "worker-src": ["'self'", "blob:", ...api],
    "connect-src": ["'self'", ...api],
    "style-src": ["'self'", "'unsafe-inline'", ...api],
    "font-src": ["'self'", ...api, "data:"],
    "img-src": ["'self'", ...api, "data:", "blob:"],
    "frame-src": ["'self'", "chrome-extension:", "moz-extension:", "safari-web-extension:"],
    "frame-ancestors": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"]
  };
}
function buildCsp(options) {
  const apiOrigin = options.apiOrigin ?? SHUGOI_ORIGIN;
  const merged = {};
  for (const [k, v] of Object.entries(baseDirectives(apiOrigin))) merged[k] = [...v];
  if (options.extraDirectives) {
    for (const [key, values] of Object.entries(options.extraDirectives)) {
      merged[key] = [.../* @__PURE__ */ new Set([...merged[key] ?? [], ...values])];
    }
  }
  return Object.entries(merged).map(([key, values]) => `${key} ${values.join(" ")}`).join("; ");
}

// src/next/with-shugoi.ts
function withShugoi(opts, nextConfig = {}) {
  const csp = buildCsp({ siteKey: opts.siteKey });
  return {
    ...nextConfig,
    async headers() {
      const existingHeaders = typeof nextConfig.headers === "function" ? await nextConfig.headers() : Array.isArray(nextConfig.headers) ? nextConfig.headers : [];
      return [
        ...existingHeaders,
        {
          source: "/(.*)",
          headers: [
            {
              key: "Content-Security-Policy",
              value: csp
            }
          ]
        }
      ];
    }
  };
}

// src/next/proxy.ts
import { NextResponse } from "next/server.js";

// src/render.ts
import crypto2, { createHash } from "crypto";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, chmodSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// src/locales.ts
var MESSAGES = {
  fr: {
    rateLimitTitle: "Trop de requ\xEAtes",
    rateLimitBody: (t) => `Vous avez effectu\xE9 trop de requ\xEAtes en peu de temps. Il reste ${t} avant de pouvoir r\xE9essayer.`,
    rateLimitBadge: "Rate Limit",
    blockedTitle: "Acc\xE8s bloqu\xE9",
    blockedBadge: "Blocage",
    tamperTitle: "Remplacement de contenu client d\xE9tect\xE9",
    tamperBody: "Nous avons remarqu\xE9 que vous avez tent\xE9 de modifier manuellement le rendu client c\xF4t\xE9 navigateur via les DevTools. Cette pratique est \xE9videmment bloqu\xE9e par nos services.",
    devtoolsBody: "L'utilisation des DevTools pour remplacer le contenu ou modifier les requ\xEAtes r\xE9seau a \xE9t\xE9 d\xE9tect\xE9e. L'int\xE9grit\xE9 de la page est prot\xE9g\xE9e et toute alt\xE9ration est imm\xE9diatement bloqu\xE9e.",
    fakeBrowserTitle: "Requ\xEAte non navigateur",
    fakeBrowserBody: "Votre requ\xEAte ne provient pas d'un navigateur standard. Utilisez un navigateur (Chrome, Firefox, Safari, Edge) pour acc\xE9der \xE0 ce site.",
    fakeBrowserBadge: "Acc\xE8s restreint",
    retryInSeconds: (s) => `Il reste ${s}s avant de pouvoir r\xE9essayer.`
  },
  en: {
    rateLimitTitle: "Too Many Requests",
    rateLimitBody: (t) => `You have made too many requests in a short time. ${t} remaining before you can try again.`,
    rateLimitBadge: "Rate Limit",
    blockedTitle: "Access Blocked",
    blockedBadge: "Blocked",
    tamperTitle: "Client Content Replacement Detected",
    tamperBody: "We noticed you attempted to manually modify the client-side rendering via DevTools. This practice is obviously blocked by our services.",
    devtoolsBody: "Using DevTools to replace content or modify network requests has been detected. Page integrity is protected and any alteration is immediately blocked.",
    fakeBrowserTitle: "Non-browser request",
    fakeBrowserBody: "Your request did not come from a standard browser. Please use a browser (Chrome, Firefox, Safari, Edge) to access this site.",
    fakeBrowserBadge: "Restricted access",
    retryInSeconds: (s) => `Retry in ${s}s.`
  }
};

// src/obfuscate.ts
import crypto from "crypto";
var RENAMES = {
  buildOverlay: "_wf",
  checkNotice: "_wg",
  hex: "_wh",
  stable: "_wi"
};
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function hexToBytes(hex) {
  const b = [];
  for (let i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16));
  return b;
}
function xorEncrypt(str, hexKey) {
  const kb = hexToBytes(hexKey);
  let enc = "";
  for (let i = 0; i < str.length; i++) {
    const cc = str.charCodeAt(i) ^ (kb[i % kb.length] ?? 0);
    enc += cc.toString(16).padStart(2, "0");
  }
  return enc;
}
function runtimeValue(str) {
  let s = str.slice(1, -1);
  return s.replace(/\\(['"\\bfnrtv0])/g, (_, c) => ({ "'": "'", '"': '"', "\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "	", "v": "\v", "0": "\0" })[c] ?? c).replace(/\\(u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/g, (_, __, ubrace, u4, x2) => {
    const code = ubrace ? parseInt(ubrace, 16) : u4 ? parseInt(u4, 16) : parseInt(x2, 16);
    return String.fromCodePoint(code);
  });
}
function encryptStrings(code, key) {
  let r = "", i = 0;
  while (i < code.length) {
    if (code[i] === "'" || code[i] === '"') {
      const q = code[i];
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === q) break;
        j++;
      }
      if (j < code.length) {
        const val = runtimeValue(code.slice(i, j + 1));
        r += '_D("' + xorEncrypt(val, key) + '")';
        i = j + 1;
      } else {
        r += code[i];
        i++;
      }
    } else {
      r += code[i];
      i++;
    }
  }
  return r;
}
function stripComments(s) {
  return s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n{3,}/g, "\n\n");
}
function escapeClosingTags(code) {
  return code.replace(/<\/(script|style)/gi, "<\\/$1");
}
function fixComputedProperties(code) {
  return code.replace(/([{,])(\s*)_D\("([^"]*)"\)(\s*:)/g, '$1$2[_D("$3")]$4');
}
function deriveKey(seed) {
  return crypto.createHash("sha256").update(seed + "sg_val_v1").digest("hex").slice(0, 32);
}
function seededRng(seed) {
  let s = hash(seed + "_shuffle");
  return function() {
    s = s * 1103515245 + 12345 & 2147483647;
    return s / 2147483647;
  };
}
function shuffleCode(code, seed) {
  const lines = code.split("\n");
  const depth = new Array(lines.length).fill(0);
  let d = 0;
  for (let i = 0; i < lines.length; i++) {
    depth[i] = d;
    for (const ch of lines[i] ?? "") {
      if (ch === "{") d++;
      else if (ch === "}") d--;
    }
  }
  const blocks = [];
  let start = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const isShuffleable = depth[i] === 1 && /^\s*R\.\w+\s*=/.test(line) && !/[{}]/.test(line) && line.trimEnd().endsWith(";");
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
      const current = slice[i];
      const replacement = slice[j];
      if (current !== void 0 && replacement !== void 0) {
        slice[i] = replacement;
        slice[j] = current;
      }
    }
    lines.splice(blk.start, slice.length, ...slice);
  }
  return lines.join("\n");
}
function renameFunctions(code, seed) {
  let r = code;
  const names = Object.entries(RENAMES).sort((a, b) => {
    const ha = hash(a[0] + seed), hb = hash(b[0] + seed);
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });
  for (const [from, to] of names) {
    const suffix = (hash(from + seed) % 9e3 + 1e3).toString(36);
    const newName = to + suffix;
    r = r.replace(new RegExp("\\b" + from + "\\(", "g"), newName + "(");
  }
  return r;
}
function injectDecoder(hexKey) {
  const kb = hexToBytes(hexKey);
  const ks = kb.map((b) => "\\x" + b.toString(16).padStart(2, "0")).join("");
  return 'var _D=function(h){var k="' + ks + '",r="";for(var i=0;i<h.length;i+=2){r+=String.fromCharCode(parseInt(h.substr(i,2),16)^k.charCodeAt((i/2)%' + kb.length + "))}return r};";
}
function removeFunction(code, name) {
  const regex = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^{}]*\\}", "g");
  let r = code.replace(regex, "");
  const multiRegex = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^}]*\\{[^}]*\\}[^}]*\\}", "g");
  r = r.replace(multiRegex, "");
  return r;
}
function stripTrace(code) {
  let r = code;
  r = removeFunction(r, "_sgLogCP");
  r = removeFunction(r, "_sgErr");
  r = r.replace(/_sgLogCP\(\s*\d+\s*\)\s*[;,]?/g, "");
  r = r.replace(/_sgErr\(\s*(['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*,\s*(['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*\)\s*[;,]?/g, "");
  r = r.replace(/var\s+_SG_TRACE\s*=\s*(?:true|false)\s*;\s*/g, "");
  r = r.replace(/var\s+_sgCP\s*=\s*[^;]*;\s*/g, "");
  r = r.replace(/;\s*;/g, ";");
  return r;
}
function applyObfuscation(code, seed) {
  let r = stripComments(code);
  r = stripTrace(r);
  r = renameFunctions(r, seed);
  r = shuffleCode(r, seed);
  const encKey = deriveKey(seed);
  r = encryptStrings(r, encKey);
  r = r.replace(/^\s*\(function\(\)\{/, (m) => m + injectDecoder(encKey));
  r = escapeClosingTags(r);
  r = fixComputedProperties(r);
  return r;
}

// src/render.ts
var runtimeGlobal = globalThis;
var TOKEN_DIR = join(tmpdir(), "shugoi-render-" + (process.getuid?.() ?? "x"));
var TOKEN_TTL = 12e4;
var MAX_ENTRIES = 5e3;
var MAX_TOTAL_BYTES = 64 * 1024 * 1024;
var _memoryStore = /* @__PURE__ */ new Map();
var _siteCache = /* @__PURE__ */ new Map();
var _diskEnabled = false;
var _totalBytes = 0;
if (!existsSync(TOKEN_DIR)) {
  try {
    mkdirSync(TOKEN_DIR, { recursive: true, mode: 448 });
  } catch {
  }
}
try {
  chmodSync(TOKEN_DIR, 448);
} catch {
}
function tokenFileName(token) {
  return createHash("sha256").update(token).digest("hex");
}
function storeToDisk(token, html) {
  try {
    writeFileSync(join(TOKEN_DIR, tokenFileName(token)), html, { encoding: "utf-8", mode: 384 });
  } catch {
  }
}
function dropEntry(token) {
  const e = _memoryStore.get(token);
  if (e) _totalBytes -= Buffer.byteLength(e.html, "utf-8");
  _memoryStore.delete(token);
}
function evictOldest() {
  const first = _memoryStore.keys().next();
  if (first.done) return;
  dropEntry(first.value);
}
function storeHtml(token, html, contentReplaceOn) {
  if (_diskEnabled) {
    storeToDisk(token, html);
  }
  dropEntry(token);
  const size = Buffer.byteLength(html, "utf-8");
  while ((_memoryStore.size >= MAX_ENTRIES || _totalBytes + size > MAX_TOTAL_BYTES) && _memoryStore.size > 0) {
    evictOldest();
  }
  const entry = { html, expiresAt: Date.now() + TOKEN_TTL, reads: 0 };
  if (contentReplaceOn !== void 0) entry.contentReplaceOn = contentReplaceOn;
  _memoryStore.set(token, entry);
  _totalBytes += size;
  const separator = token.indexOf(":");
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
var GRANT_TTL_MS = 6e4;
function verifyRenderGrant(mid, grant, token, _ip, expectedSiteKey) {
  const gSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!gSecret) return false;
  if (!grant || !mid || !/^[a-f0-9]{64}$/.test(mid)) return false;
  const sep = grant.indexOf(":");
  if (sep < 0) return false;
  const ts = grant.slice(0, sep);
  const sig = grant.slice(sep + 1);
  const tsSec = parseInt(ts, 36);
  const age = Date.now() - tsSec * 1e3;
  if (isNaN(tsSec) || age > GRANT_TTL_MS || age < -5e3) return false;
  if (!expectedSiteKey) return false;
  const payload = "render-grant:" + [expectedSiteKey, mid, token || "", ts].join(":");
  const exp = crypto2.createHmac("sha256", gSecret).update(payload).digest("hex");
  try {
    return crypto2.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(exp, "hex"));
  } catch {
    return false;
  }
}
function signToken(siteKey, timestamp, secretOverride) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!secret) return { token: "" };
  const nonce = crypto2.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = crypto2.createHmac("sha256", secret).update(payload).digest("hex");
  return { token: payload + ":" + sig };
}
var CONFIG_CACHE_TTL = 3e4;
var CONFIG_STALE_MAX = 6e5;
var CONFIG_FETCH_TIMEOUT = 2e3;
var MAX_TENANTS = 500;
var _configCache = /* @__PURE__ */ new Map();
function configKey(baseUrl, siteKey) {
  return baseUrl + "@" + siteKey;
}
function pruneCache(m) {
  if (m.size <= MAX_TENANTS) return;
  const sorted = [...m.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  for (let i = 0; i < sorted.length - MAX_TENANTS; i++) {
    const entry = sorted[i];
    if (entry) m.delete(entry[0]);
  }
}
async function refreshConfig(siteKey, baseUrl, entry, secret) {
  try {
    const cb = Date.now();
    const sig = secret ? crypto2.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
    const res = await fetch(baseUrl + "/whitelist?key=" + encodeURIComponent(siteKey) + "&cb=" + cb + (sig ? "&sig=" + sig : ""), {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT)
    });
    if (res.ok) {
      const data = await res.json();
      entry.whitelist = data.whitelistedMachines || [];
      entry.flags = data.detectionFlags || data.flags || {};
      entry.skipPaths = data.skipPaths || [];
    }
  } catch {
  }
  entry.fetchedAt = Date.now();
}
async function getConfig(siteKey, baseUrl, secret) {
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
      entry.inflight = refreshConfig(siteKey, baseUrl, entry, secret).finally(() => {
        entry.inflight = null;
      });
    }
    await entry.inflight;
    return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths };
  }
  if (age > CONFIG_CACHE_TTL && !entry.inflight) {
    entry.inflight = refreshConfig(siteKey, baseUrl, entry, secret).finally(() => {
      entry.inflight = null;
    });
    entry.inflight.catch(() => {
    });
  }
  return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths };
}
var GUARD_CACHE_TTL = 3e5;
var _guardCaches = /* @__PURE__ */ new Map();
function cacheKey(baseUrl, siteKey) {
  return `${baseUrl}::${siteKey}`;
}
function getCacheEntry(baseUrl, siteKey) {
  const key = cacheKey(baseUrl, siteKey);
  if (!_guardCaches.has(key)) {
    _guardCaches.set(key, { detect: null, guard: null, fetching: false, queue: [], fetchedAt: 0 });
    pruneCache(_guardCaches);
  }
  return _guardCaches.get(key);
}
async function fetchGuardScripts(baseUrl, secret, siteKey) {
  const sk = siteKey || "cache";
  const cache2 = getCacheEntry(baseUrl, sk);
  if (cache2.fetching) return new Promise((resolve) => {
    cache2.queue.push(resolve);
  });
  cache2.fetching = true;
  try {
    const cb = Date.now();
    const sig = secret ? crypto2.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
    const [dRes, gRes] = await Promise.all([
      fetch(baseUrl + "/guard-detect?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) }),
      fetch(baseUrl + "/guard?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) })
    ]);
    const rawDetect = await dRes.text();
    const rawGuard = await gRes.text();
    cache2.detect = rawDetect;
    cache2.guard = rawGuard;
    cache2.fetchedAt = Date.now();
  } catch {
    cache2.detect = cache2.detect || 'console.error("Shugoi guard-detect unavailable")';
    cache2.guard = cache2.guard || 'console.error("Shugoi guard unavailable")';
  }
  cache2.fetching = false;
  cache2.queue.forEach((r) => r());
  cache2.queue = [];
}
async function ensureGuardsReady(baseUrl, secret, siteKey) {
  const cache2 = getCacheEntry(baseUrl, siteKey || "cache");
  if (cache2.detect && cache2.guard && Date.now() - cache2.fetchedAt < GUARD_CACHE_TTL) return;
  await fetchGuardScripts(baseUrl, secret, siteKey);
}
async function generateSkeleton(siteKey, token, baseUrl, restrictedAccess, _whitelist, renderUrl, locale, flags, clockts, signingSecret) {
  await ensureGuardsReady(baseUrl, void 0, siteKey);
  const rurl = renderUrl || "./__shugoi/render";
  const cfg = flags ?? (await getConfig(siteKey, baseUrl, signingSecret)).flags;
  const loc = locale || "en";
  const msgs = MESSAGES[loc];
  const cache2 = getCacheEntry(baseUrl, siteKey);
  const fragments = [];
  fragments.push("window.__sg_siteKey=" + JSON.stringify(siteKey));
  fragments.push("window.__sg_baseUrl=" + JSON.stringify(baseUrl));
  fragments.push("window.__sg_config=" + JSON.stringify(cfg));
  fragments.push("window.__sg_diagEnabled=" + (process.env.NODE_ENV === "production" ? "false" : "true"));
  fragments.push("try{if((location.search||'').indexOf('sg_proof=')>=0){var _qs=location.search.replace(/[?&]sg_proof=[^&]*/,'');var _cu=location.pathname+(_qs?_qs:'')+location.hash;history.replaceState(null,'',_cu)}}catch(e){}");
  const _powTs = Math.floor(Date.now() / 1e3);
  const _powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || "";
  const _powNonce = typeof crypto2.randomBytes === "function" ? crypto2.randomBytes(8).toString("hex") : String(Math.floor(Math.random() * 4294967295)).padStart(8, "0") + String(Math.floor(Math.random() * 4294967295)).padStart(8, "0");
  const _powSalt = _powSecret ? crypto2.createHmac("sha256", _powSecret).update(_powTs + ":" + _powNonce).digest("hex") : "";
  const _powDiff = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "14");
    return Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
  })();
  fragments.push("window.__sg_pow=" + JSON.stringify({ ts: _powTs, nonce: _powNonce, salt: _powSalt, difficulty: _powDiff }));
  const _ntpDrift = runtimeGlobal.__sg_ntpDrift || 0;
  const _ntpTime = runtimeGlobal.__sg_ntpTime || Date.now() - _ntpDrift;
  const _clockts = clockts || _ntpTime;
  fragments.push("window.__sg_ntp=" + _ntpTime);
  fragments.push("window.__sg_serverTime=" + _clockts);
  fragments.push("window.__sg_clockts=" + _clockts);
  if (!restrictedAccess) fragments.push("window.__sg_disableRestrictedAccess=true");
  if (cache2.detect) fragments.push("try{" + cache2.detect + "}catch(e){window.__sg_blocked=true}");
  const jsStr = (s) => JSON.stringify(s).slice(1, -1).replace(/</g, "\\x3c");
  const devtoolsMsg = jsStr(msgs.devtoolsBody);
  const tamperTitle = jsStr(msgs.tamperTitle);
  const fbBadge = jsStr(msgs.blockedBadge);
  const fbTitle = jsStr(msgs.blockedTitle);
  fragments.push('window.__sg_showBlock=function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><style>@font-face{font-family:\\x27Alex Brush\\x27;src:url(https://shugoi.com/alex-brush.woff2?v=2) format(\\x27woff2\\x27);font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\\\\x27Segoe UI\\\\x27,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\\x27Alex Brush\\x27,Georgia,\\\\x27Times New Roman\\\\x27,serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}@media (prefers-color-scheme:dark){html,body{background:#16101c}#c{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}#c .bdg{background:rgba(233,137,159,.16);border-color:rgba(233,137,159,.5);color:#e9899f}#c h2{color:#e9899f}#c p.desc{color:#a795b4}#c p.ft{color:#e9899f}}</style></head><body><div id=c><img src=https://shugoi.com/favicon-block.png class=l><img src=https://shugoi.com/brand-block.png class=b><div class=bdg>"+(badge||"' + fbBadge + '")+"</div><h2>"+(title||"' + fbTitle + '")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push("var t=" + JSON.stringify(token));
  fragments.push("window.__sg_token=" + JSON.stringify(token));
  fragments.push("var k=" + JSON.stringify(siteKey));
  fragments.push("var b=" + JSON.stringify(baseUrl));
  fragments.push("var r=" + JSON.stringify(rurl));
  fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");return}var _g=(window.__sg_grant||"");if(_g){p=p+("&grant="+encodeURIComponent(_g))}var _m=(window.__sg_detectMid||window.__sg_mid||"");if(_m){p=p+("&mid="+encodeURIComponent(_m))}fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(d.error){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '")}else if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('function _sgCl(){try{for(var _i in window){if(_i.indexOf("__sg")===0){window[_i]=null;delete window[_i]}}window._sgLogCP=function(){};window.midHex=function(){};window.rd=function(){};window._gw=function(){};window.applyDecision=function(){};window._D=function(){};window.z=function(f){return f()}}catch(_e){}}_gw(function(){rd(r+"?token="+t,0);setTimeout(_sgCl,1500)})');
  const rawBootCode = fragments.join(";");
  const variantSeed = createHash("sha256").update(`${siteKey}:${token}`).digest("hex");
  const bootCode = (process.env.NODE_ENV === "production" ? applyObfuscation(rawBootCode, variantSeed) : rawBootCode).replace(/<\/(script|style)/gi, "<\\/$1");
  return "<script>" + bootCode + "</script>";
}
async function injectGuardScripts(html, siteKey, baseUrl, whitelist, restrictedAccess, signingSecret, _req, _allowedOrigins, locale, clockts) {
  await ensureGuardsReady(baseUrl, signingSecret, siteKey);
  const cfgData = await getConfig(siteKey, baseUrl, signingSecret);
  const wl = whitelist ?? cfgData.whitelist;
  const ts = Date.now();
  const signed = signToken(siteKey, ts, signingSecret);
  const configVars = [];
  if (!restrictedAccess) configVars.push("window.__sg_disableRestrictedAccess=true");
  const configScript = configVars.length ? "<script>" + configVars.join(";") + "</script>" : "";
  let injectedHtml = html;
  const headClose = injectedHtml.indexOf("</head>");
  if (headClose >= 0) injectedHtml = injectedHtml.slice(0, headClose) + configScript + injectedHtml.slice(headClose);
  else if (injectedHtml.includes("<body")) {
    const bm = injectedHtml.match(/<body[^>]*>/);
    if (bm) {
      const at = injectedHtml.indexOf(bm[0]) + bm[0].length;
      injectedHtml = injectedHtml.slice(0, at) + configScript + injectedHtml.slice(at);
    }
  } else injectedHtml = configScript + injectedHtml;
  const renderUrl = "./__shugoi/render";
  storeHtml(signed.token, injectedHtml);
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, wl, renderUrl, locale, cfgData.flags, clockts, signingSecret);
}

// src/block-page.ts
var BLOCK_PAGE = [
  "+---------------------------------------------+",
  "|           BLOCKED BY SHUGOI                 |",
  "+---------------------------------------------+",
  "|  Bots, scrapers and headless clients        |",
  "|  are blocked by Shugoi protection.          |",
  "|                                             |",
  "|  Use a standard browser to access           |",
  "|  this site.                                 |",
  "|                                             |",
  "|  - web: https://shugoi.com -                |",
  "+---------------------------------------------+"
].join("\n") + "\n";

// src/next/proxy.ts
var DEFAULT_HEADLESS = [
  /^curl/i,
  /^wget/i,
  /^python/i,
  /^Go-http-client/i,
  /^Java\//,
  /HTTPie/i,
  /^node-fetch/i,
  /axios/i,
  /^okhttp/i,
  /^scrapy/i,
  /PowerShell/i,
  /WinHttp/i
];
var BASE_URL = "https://shugoi.com/api/v1";
function createShugoiProxy(options) {
  const { siteKey, target } = options;
  const allowlist = options.allowlist ?? ["/legal"];
  const headless = options.headlessPatterns ?? DEFAULT_HEADLESS;
  return async function proxy(request) {
    const path = request.nextUrl.pathname;
    const accept = request.headers.get("accept") || "";
    if (request.headers.get("x-shugoi-internal") === "1")
      return NextResponse.next();
    if (path.startsWith("/_next/") || path.startsWith("/api/"))
      return NextResponse.next();
    if (allowlist.some((p) => path === p || path.startsWith(p + "/")))
      return NextResponse.next();
    const ua = request.headers.get("user-agent") || "";
    if (headless.some((p) => p.test(ua))) {
      return new NextResponse(BLOCK_PAGE, { status: 403 });
    }
    if (!accept.includes("text/html")) return NextResponse.next();
    try {
      const fetchUrl = target ? target + path : new URL(path, request.url).toString();
      const pageRes = await fetch(fetchUrl, {
        headers: {
          accept: "text/html",
          "user-agent": "Shugoi",
          cookie: request.headers.get("cookie") || "",
          "x-shugoi-internal": "1"
        },
        signal: AbortSignal.timeout(1e4)
      });
      if (!pageRes.ok) return NextResponse.next();
      const html = await pageRes.text();
      const skeleton = await injectGuardScripts(
        html,
        siteKey,
        BASE_URL,
        void 0,
        false,
        void 0,
        { url: path }
      );
      return new NextResponse(skeleton, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate"
        }
      });
    } catch {
      return NextResponse.next();
    }
  };
}

// src/next/middleware.ts
import { NextResponse as NextResponse2 } from "next/server.js";
import crypto3 from "crypto";

// src/next/guard-cache.ts
import { readFileSync as readFileSync2 } from "fs";
import { join as join2 } from "path";
var cache = /* @__PURE__ */ new Map();
function replaceAssets(code, assets) {
  return code.replaceAll("__SG_FAVICON__", assets.favicon ?? "__SG_FAVICON__").replaceAll("__SG_BRAND_IMG__", assets.brand ?? "__SG_BRAND_IMG__").replaceAll("__SG_TITLE_TOR__", assets.title_tor ?? "__SG_TITLE_TOR__").replaceAll("__SG_FONT_FACE__", assets.fontFace ?? "__SG_FONT_FACE__");
}
function loadLocalGuards(root, production = process.env.NODE_ENV === "production") {
  const cached = cache.get(root);
  if (cached && production) return cached;
  try {
    const assets = JSON.parse(readFileSync2(join2(root, "lib", "guard-assets.json"), "utf8"));
    const guards = {
      detect: replaceAssets(readFileSync2(join2(root, "scripts", "guard-detect.src.js"), "utf8"), assets),
      guard: replaceAssets(readFileSync2(join2(root, "scripts", "guard.src.js"), "utf8"), assets)
    };
    cache.set(root, guards);
    return guards;
  } catch {
    return null;
  }
}

// src/next/token-store.ts
import { createHash as createHash2 } from "crypto";
import { chmodSync as chmodSync2, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync3, readdirSync as readdirSync2, statSync as statSync2, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "fs";
import { join as join3 } from "path";
import { tmpdir as tmpdir2 } from "os";
var TOKEN_TTL_MS = 12e4;
var MAX_ENTRIES2 = 5e3;
function fileName(token) {
  return createHash2("sha256").update(token).digest("hex");
}
function createDiskHtmlStore(directory = join3(tmpdir2(), `shugoi-next-render-${process.getuid?.() ?? "x"}`)) {
  if (!existsSync2(directory)) mkdirSync2(directory, { recursive: true, mode: 448 });
  try {
    chmodSync2(directory, 448);
  } catch {
  }
  return {
    put(token, html) {
      try {
        writeFileSync2(join3(directory, fileName(token)), html, { encoding: "utf8", mode: 384 });
      } catch {
      }
    },
    get(token) {
      try {
        const path = join3(directory, fileName(token));
        return existsSync2(path) ? readFileSync3(path, "utf8") : null;
      } catch {
        return null;
      }
    },
    cleanup(now = Date.now()) {
      try {
        const entries = readdirSync2(directory).flatMap((name) => {
          const path = join3(directory, name);
          try {
            return [{ path, mtime: statSync2(path).mtimeMs }];
          } catch {
            return [];
          }
        });
        const live = entries.filter(({ path, mtime }) => {
          if (now - mtime <= TOKEN_TTL_MS) return true;
          try {
            unlinkSync2(path);
          } catch {
          }
          return false;
        });
        live.sort((left, right) => left.mtime - right.mtime);
        for (const { path } of live.slice(0, Math.max(0, live.length - MAX_ENTRIES2))) {
          try {
            unlinkSync2(path);
          } catch {
          }
        }
      } catch {
      }
    }
  };
}

// src/next/middleware.ts
var tokenStore = createDiskHtmlStore();
setInterval(() => {
  tokenStore.cleanup();
}, 3e4).unref();
var DEFAULT_HEADLESS2 = [
  /^curl/i,
  /^wget/i,
  /^python/i,
  /^Go-http-client/i,
  /^Java\//,
  /HTTPie/i,
  /^node-fetch/i,
  /axios/i,
  /^okhttp/i,
  /^scrapy/i,
  /PowerShell/i,
  /WinHttp/i
];
var DEFAULT_BOT_WHITELIST = [
  /Googlebot/i,
  /Bingbot/i,
  /Slurp/i,
  /DuckDuckBot/i,
  /YandexBot/i,
  /FacebookExternalHit/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /Applebot/i,
  /AhrefsBot/i,
  /SemrushBot/i
];
function signToken2(siteKey, timestamp, secretOverride) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!secret) return { token: "" };
  const nonce = crypto3.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = crypto3.createHmac("sha256", secret).update(payload).digest("hex");
  return { token: payload + ":" + sig };
}
var _httpGuardCache = { detect: null, guard: null, fetchedAt: 0 };
async function fetchGuardsHttp(baseUrl, siteKey, signingSecret) {
  const GUARD_CACHE_TTL2 = 3e5;
  if (_httpGuardCache.detect && _httpGuardCache.guard && Date.now() - _httpGuardCache.fetchedAt < GUARD_CACHE_TTL2) {
    return { detect: _httpGuardCache.detect, guard: _httpGuardCache.guard };
  }
  try {
    const cb = Date.now();
    const sk = siteKey || "cache";
    const secret = signingSecret || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
    const sig = secret ? crypto3.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
    const [dRes, gRes] = await Promise.all([
      fetch(baseUrl + "/guard-detect?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) }),
      fetch(baseUrl + "/guard?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) })
    ]);
    if (!dRes.ok || !gRes.ok) return null;
    _httpGuardCache.detect = await dRes.text();
    _httpGuardCache.guard = await gRes.text();
    _httpGuardCache.fetchedAt = Date.now();
    return { detect: _httpGuardCache.detect, guard: _httpGuardCache.guard };
  } catch {
    return null;
  }
}
function generateBootcode(siteKey, config, detectCode, guardCode) {
  const combined = "window.__sg_siteKey=" + JSON.stringify(siteKey) + ";window.__sg_config=" + config + ";try{" + detectCode + "}catch(e){window.__sg_blocked=true};try{" + guardCode + "}catch(e){window.__sg_blocked=true}";
  return "<script>" + combined.replace(/<\/(script|style)/gi, "<\\/$1") + "</script>";
}
function renderResponseData(token, mid, grant, ip, expectedSiteKey) {
  if (!token || token.length < 16 || token.length > 300) return { error: "not_found" };
  if (expectedSiteKey && token.split(":")[0] !== expectedSiteKey) return { error: "not_found" };
  if (!verifyRenderGrant(mid, grant, token, ip, expectedSiteKey)) return { error: "not_found" };
  const html = tokenStore.get(token);
  if (html) return { html };
  return { blocked: true };
}
function createShugoiNextMiddleware(options) {
  const { siteKey, baseUrl, allowlist, signingSecret } = options;
  const headless = DEFAULT_HEADLESS2;
  const root = process.cwd();
  const BASE_URL2 = baseUrl ?? "https://shugoi.com/api/v1";
  return async function shugoiMiddleware(request) {
    if (request.headers.get("x-shugoi-internal") === "1")
      return NextResponse2.next();
    const path = request.nextUrl.pathname;
    const accept = request.headers.get("accept") || "";
    if (path.endsWith("/__shugoi/render")) {
      const token = request.nextUrl.searchParams.get("token") || "";
      const mid = request.nextUrl.searchParams.get("mid") || "";
      const grant = request.nextUrl.searchParams.get("grant") || "";
      const xff = request.headers.get("x-forwarded-for") || "";
      const ip = xff.split(",")[0]?.trim() || "unknown";
      return NextResponse2.json(renderResponseData(token, mid, grant, ip, options.siteKey));
    }
    if (path.startsWith("/_next/") || path.startsWith("/api/")) return NextResponse2.next();
    if (allowlist?.some((p) => path === p || path.startsWith(p + "/"))) return NextResponse2.next();
    const ua = request.headers.get("user-agent") || "";
    if (headless.some((p) => p.test(ua))) {
      return new NextResponse2(BLOCK_PAGE, { status: 403 });
    }
    if (!accept.includes("text/html")) return NextResponse2.next();
    const isBot = DEFAULT_BOT_WHITELIST.some((p) => p.test(ua));
    if (isBot) return NextResponse2.next();
    try {
      let detectCode = "";
      let guardCode = "";
      const localGuards = loadLocalGuards(root);
      detectCode = localGuards?.detect ?? "";
      guardCode = localGuards?.guard ?? "";
      if (!detectCode || !guardCode) {
        const httpGuards = await fetchGuardsHttp(BASE_URL2, siteKey, signingSecret);
        if (httpGuards) {
          detectCode = httpGuards.detect;
          guardCode = httpGuards.guard;
        }
      }
      if (!detectCode) {
        console.error("[shugoi] WARNING: unable to load guard scripts \u2014 protection inactive");
        return NextResponse2.next();
      }
      const ts = Date.now();
      const signed = signToken2(siteKey, ts, signingSecret);
      const cfg = JSON.stringify({
        enableWhitelist: true,
        enableVmCheck: true,
        enableTorCheck: true,
        enableHeadlessCheck: true,
        enableAntiDetectCheck: true,
        enableContentReplacementCheck: false
      });
      const internalFetch = await fetch(request.url, {
        headers: { accept: "text/html", "user-agent": "Shugoi", "x-shugoi-internal": "1", cookie: request.headers.get("cookie") || "" },
        signal: AbortSignal.timeout(5e3)
      });
      if (internalFetch.ok) {
        const originalHtml = await internalFetch.text();
        tokenStore.put(signed.token, originalHtml);
      }
      const skeleton = generateBootcode(siteKey, cfg, detectCode, guardCode);
      const fullPage = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' + skeleton + '</head><body><div id="__sg_root"></div></body></html>';
      return new NextResponse2(fullPage, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    } catch {
      return NextResponse2.next();
    }
  };
}

// src/next/guard-component.ts
async function generateGuardHtml({ siteKey, enableWhitelist = true, enableVmCheck = true }) {
  try {
    const root = process.cwd();
    const guards = loadLocalGuards(root);
    if (!guards) return '<script>console.warn("Shugoi guards not found")</script>';
    const cfg = JSON.stringify({ enableWhitelist, enableVmCheck, enableTorCheck: true, enableHeadlessCheck: true, enableAntiDetectCheck: true, enableContentReplacementCheck: false });
    const combined = "window.__sg_siteKey=" + JSON.stringify(siteKey) + ";window.__sg_config=" + cfg + ";try{" + guards.detect + "}catch(e){window.__sg_blocked=true};try{" + guards.guard + "}catch(e){window.__sg_blocked=true}";
    return "<script>" + combined.replace(/<\/(script|style)/gi, "<\\/$1") + "</script>";
  } catch {
    return '<script>console.warn("Shugoi guard generation failed")</script>';
  }
}

// src/next/index.ts
var SHUGOI_MATCHER = "/((?!_next/static|_next/image|favicon.ico).*)";
export {
  SHUGOI_MATCHER,
  createShugoiNextMiddleware,
  createShugoiProxy,
  generateGuardHtml,
  withShugoi
};
