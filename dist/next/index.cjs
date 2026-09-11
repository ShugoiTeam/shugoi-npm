"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/next/index.ts
var next_exports = {};
__export(next_exports, {
  SHUGOI_MATCHER: () => SHUGOI_MATCHER,
  createShugoiNextMiddleware: () => createShugoiNextMiddleware,
  createShugoiProxy: () => createShugoiProxy,
  generateGuardHtml: () => generateGuardHtml,
  withShugoi: () => withShugoi
});
module.exports = __toCommonJS(next_exports);

// src/csp.ts
function originOf(baseUrl) {
  if (!baseUrl) return null;
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.protocol + "//" + u.host;
  } catch {
    return null;
  }
}
var SHUGOI_ORIGIN = "https://shugoi.com";
function baseDirectives(apiOrigin) {
  const api = [...new Set([SHUGOI_ORIGIN, apiOrigin].filter(Boolean))];
  const websocket = api.map((origin) => {
    try {
      const url = new URL(origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return url.origin;
    } catch {
      return "";
    }
  }).filter(Boolean);
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...api],
    "worker-src": ["'self'", "blob:", ...api],
    // `https:` does not authorize a `wss:` connection in every browser/CSP
    // implementation. Declare the exact transport origins used by WLC.
    "connect-src": ["'self'", ...api, ...websocket],
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
  const requireUnsafeEval = false;
  const scriptSrc = merged["script-src"] ?? [];
  if (requireUnsafeEval && !scriptSrc.includes("'unsafe-eval'")) {
    scriptSrc.push("'unsafe-eval'");
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

// src/next/middleware.ts
var import_server = require("next/server.js");

// src/render.ts
var import_crypto = __toESM(require("crypto"), 1);
var import_fs = require("fs");
var import_path = require("path");
var import_os = require("os");

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

// src/availability.ts
var import_node_crypto = __toESM(require("crypto"), 1);
var DEFAULT_MAX_STALE_MS = 5 * 6e4;
function canonical(snapshot) {
  return JSON.stringify({ flags: snapshot.flags, fetchedAt: snapshot.fetchedAt, siteKey: snapshot.siteKey, skipPaths: snapshot.skipPaths, version: snapshot.version });
}
function signAvailabilitySnapshot(snapshot, secret) {
  if (!secret) throw new Error("availability_secret_required");
  return { ...snapshot, signature: import_node_crypto.default.createHmac("sha256", secret).update(canonical(snapshot)).digest("hex") };
}
function verifyAvailabilitySnapshot(snapshot, secret, now = Date.now(), maxStaleMs = DEFAULT_MAX_STALE_MS) {
  if (!secret || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1) return false;
  if (!Number.isFinite(snapshot.fetchedAt) || snapshot.fetchedAt > now || now - snapshot.fetchedAt > maxStaleMs) return false;
  const { signature: _signature, ...unsigned } = snapshot;
  const expected = signAvailabilitySnapshot(unsigned, secret).signature;
  return /^[a-f0-9]{64}$/.test(snapshot.signature) && import_node_crypto.default.timingSafeEqual(Buffer.from(expected), Buffer.from(snapshot.signature));
}
function availabilityState(snapshot, secret, now = Date.now(), maxStaleMs = DEFAULT_MAX_STALE_MS) {
  if (!snapshot) return "expired";
  if (!verifyAvailabilitySnapshot(snapshot, secret, now, maxStaleMs)) return "rejected";
  return now - snapshot.fetchedAt > 3e4 ? "degraded" : "fresh";
}

// src/render.ts
var runtimeGlobal = globalThis;
var TOKEN_DIR = (0, import_path.join)((0, import_os.tmpdir)(), "shugoi-render-" + (process.getuid?.() ?? "x"));
var TOKEN_TTL = 12e4;
var MAX_ENTRIES = 5e3;
var MAX_TOTAL_BYTES = 64 * 1024 * 1024;
var _memoryStore = /* @__PURE__ */ new Map();
var _bootstrapStore = /* @__PURE__ */ new Map();
var _latestBootstrap = null;
var _diskEnabled = false;
var _totalBytes = 0;
var _diskCleanupStarted = false;
if (!(0, import_fs.existsSync)(TOKEN_DIR)) {
  try {
    (0, import_fs.mkdirSync)(TOKEN_DIR, { recursive: true, mode: 448 });
  } catch {
  }
}
try {
  (0, import_fs.chmodSync)(TOKEN_DIR, 448);
} catch {
}
function tokenFileName(token) {
  return (0, import_crypto.createHash)("sha256").update(token).digest("hex");
}
function startDiskCleanup() {
  if (_diskCleanupStarted) return;
  _diskCleanupStarted = true;
  setInterval(() => {
    try {
      for (const f of (0, import_fs.readdirSync)(TOKEN_DIR)) {
        const p = (0, import_path.join)(TOKEN_DIR, f);
        try {
          if (Date.now() - (0, import_fs.statSync)(p).mtimeMs > TOKEN_TTL) (0, import_fs.unlinkSync)(p);
        } catch {
        }
      }
    } catch {
    }
  }, 3e4).unref();
}
function storeToDisk(token, html) {
  try {
    (0, import_fs.writeFileSync)((0, import_path.join)(TOKEN_DIR, tokenFileName(token)), html, { encoding: "utf-8", mode: 384 });
  } catch {
  }
}
function consumeFromDisk(token) {
  const file = (0, import_path.join)(TOKEN_DIR, tokenFileName(token));
  const claimed = file + "." + import_crypto.default.randomBytes(16).toString("hex") + ".claimed";
  try {
    (0, import_fs.renameSync)(file, claimed);
    if (Date.now() - (0, import_fs.statSync)(claimed).mtimeMs > TOKEN_TTL) return null;
    return (0, import_fs.readFileSync)(claimed, "utf-8");
  } catch {
    return null;
  } finally {
    try {
      (0, import_fs.unlinkSync)(claimed);
    } catch {
    }
  }
}
function dropEntry(token) {
  const e = _memoryStore.get(token);
  if (e) _totalBytes -= Buffer.byteLength(e.html, "utf-8");
  _memoryStore.delete(token);
}
function storeBootstrap(token, script) {
  _bootstrapStore.set(token, { html: script, expiresAt: Date.now() + TOKEN_TTL });
  _latestBootstrap = { token, expiresAt: Date.now() + TOKEN_TTL };
  while (_bootstrapStore.size > MAX_ENTRIES) {
    const first = _bootstrapStore.keys().next();
    if (first.done) break;
    _bootstrapStore.delete(first.value);
  }
}
function readLatestBootstrap() {
  if (!_latestBootstrap || Date.now() > _latestBootstrap.expiresAt) return null;
  return readBootstrap(_latestBootstrap.token);
}
function readBootstrap(token) {
  const entry = _bootstrapStore.get(token);
  if (!entry || Date.now() > entry.expiresAt) {
    _bootstrapStore.delete(token);
    return null;
  }
  return entry.html;
}
function decodeInvisibleBootstrapPath(value) {
  try {
    const decoded = decodeURIComponent(value);
    return decoded === String.fromCodePoint(917601) ? readLatestBootstrap() ? "__latest__" : null : null;
  } catch {
    return null;
  }
}
function evictOldest() {
  const first = _memoryStore.keys().next();
  if (first.done) return;
  dropEntry(first.value);
}
function storeHtml(token, html, _contentReplaceOn) {
  if (_diskEnabled) {
    storeToDisk(token, html);
  }
  dropEntry(token);
  if (_diskEnabled) return;
  const size = Buffer.byteLength(html, "utf-8");
  while ((_memoryStore.size >= MAX_ENTRIES || _totalBytes + size > MAX_TOTAL_BYTES) && _memoryStore.size > 0) {
    evictOldest();
  }
  _memoryStore.set(token, { html, expiresAt: Date.now() + TOKEN_TTL });
  _totalBytes += size;
}
function consumeFromMemory(token) {
  const entry = _memoryStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dropEntry(token);
    return null;
  }
  dropEntry(token);
  return entry.html;
}
var GRANT_TTL_MS = 12e4;
function verifyRenderGrant(mid, grant, token, _ip, expectedSiteKey, secretOverride) {
  const gSecret = secretOverride;
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
  const exp = import_crypto.default.createHmac("sha256", gSecret).update(payload).digest("hex");
  try {
    return import_crypto.default.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(exp, "hex"));
  } catch {
    return false;
  }
}
async function renderResponseData(token, _locale, configUrl, mid, grant, ip, expectedSiteKey, _secret) {
  if (!token || token.length < 16 || token.length > 300) return { error: "not_found" };
  if (expectedSiteKey) {
    const tokSiteKey = token.split(":")[0];
    if (tokSiteKey !== expectedSiteKey) return { error: "not_found" };
  }
  if (!verifyRenderGrant(mid, grant, token, ip, expectedSiteKey, _secret)) return { error: "not_found" };
  if (_diskEnabled) {
    const html2 = consumeFromDisk(token);
    return html2 === null ? { error: "not_found" } : { html: stripBootstrapMarker(html2) };
  }
  const html = consumeFromMemory(token);
  if (html !== null) return { html: stripBootstrapMarker(html) };
  return { error: "not_found" };
}
function stripBootstrapMarker(html) {
  return html.replaceAll("<script src=></script>", "");
}
function signToken(siteKey, timestamp, secretOverride) {
  const secret = secretOverride;
  if (!secret) return { token: "" };
  const nonce = import_crypto.default.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = import_crypto.default.createHmac("sha256", secret).update(payload).digest("hex");
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
  entry.available = false;
  try {
    const cb = Date.now();
    const sig = secret ? import_crypto.default.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
    const configUrl = baseUrl + "/whitelist?key=" + encodeURIComponent(siteKey) + "&cb=" + cb + (sig ? "&sig=" + sig : "");
    let res = await fetch(configUrl, {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT)
    });
    if (res.status === 401 && secret) {
      const validation = await fetch(baseUrl + "/validate-key", {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey, secret }),
        signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT)
      });
      if (validation.ok && (await validation.json()).valid === true) {
        res = await fetch(configUrl, { signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT) });
      }
    }
    if (res.ok) {
      const data = await res.json();
      entry.whitelist = data.whitelistedMachines || [];
      entry.flags = data.detectionFlags || data.flags || {};
      entry.skipPaths = data.skipPaths || [];
      entry.supportEmail = typeof data.supportEmail === "string" ? data.supportEmail : "";
      const snapshot = data.availabilitySnapshot;
      if (!secret || !snapshot || snapshot.siteKey !== siteKey || availabilityState(snapshot, secret) === "rejected") throw new Error("availability_snapshot_invalid");
      entry.snapshot = snapshot;
      entry.available = true;
    }
  } catch {
    entry.available = false;
  }
  entry.fetchedAt = Date.now();
}
async function getConfig(siteKey, baseUrl, secret) {
  const key = configKey(baseUrl, siteKey);
  let entry = _configCache.get(key);
  if (!entry) {
    entry = { whitelist: [], flags: {}, skipPaths: [], supportEmail: "", fetchedAt: 0, inflight: null, available: false, snapshot: null };
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
    return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths, supportEmail: entry.supportEmail };
  }
  if (age > CONFIG_CACHE_TTL && !entry.inflight) {
    entry.inflight = refreshConfig(siteKey, baseUrl, entry, secret).finally(() => {
      entry.inflight = null;
    });
  }
  if (age > CONFIG_CACHE_TTL && entry.inflight) {
    await entry.inflight;
  }
  return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths, supportEmail: entry.supportEmail };
}
var GUARD_POLL_MS = (() => {
  const raw = Number(process.env.SHUGOKI_GUARD_POLL_MS || "");
  return Number.isFinite(raw) && raw >= 1e3 ? raw : 3e4;
})();
var _guardCaches = /* @__PURE__ */ new Map();
var _guardPollers = /* @__PURE__ */ new Map();
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
    const sig = secret ? import_crypto.default.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
    const [dRes, gRes] = await Promise.all([
      // Le guard inline = le bundle modulaire per-config (/guard-bundle), PAS
      // /guard-detect (qui servait le full). Même getModularBundle côté serveur,
      // source unique → le view-source reflète les toggles du dashboard.
      fetch(baseUrl + "/guard-bundle?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) }),
      fetch(baseUrl + "/guard?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) })
    ]);
    if (dRes.ok && gRes.ok) {
      const rawDetect = await dRes.text();
      const rawGuard = await gRes.text();
      cache2.detect = rawDetect;
      cache2.guard = rawGuard;
      cache2.fetchedAt = Date.now();
    }
  } catch {
  }
  cache2.fetching = false;
  cache2.queue.forEach((r) => r());
  cache2.queue = [];
}
function startGuardPoller(baseUrl, secret, siteKey) {
  const key = cacheKey(baseUrl, siteKey || "cache");
  if (_guardPollers.has(key)) return;
  const timer = setInterval(() => {
    const cache2 = _guardCaches.get(key);
    if (!cache2) {
      clearInterval(timer);
      _guardPollers.delete(key);
      return;
    }
    const prev = { detect: cache2.detect, guard: cache2.guard };
    fetchGuardScripts(baseUrl, secret, siteKey).then(() => {
      const next = _guardCaches.get(key);
      if (next && (next.detect !== prev.detect || next.guard !== prev.guard)) {
      }
    }).catch(() => {
    });
  }, GUARD_POLL_MS);
  if (typeof timer.unref === "function") timer.unref();
  _guardPollers.set(key, timer);
}
function webkitCompatibleGuard(fullGuard) {
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
  if(!decision||!decision.allowed){document.documentElement.innerHTML='<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:light dark}html,body{margin:0;min-height:100%;background:#fcf9f5;color:#555;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;display:flex;align-items:center;justify-content:center;padding:1rem}.content-container{min-width:320px;max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem}.error-title{font-family:Georgia,serif;font-size:2.2rem;line-height:1.25;color:#e87090;font-weight:400;margin:0 auto .7rem}.error-message{font-size:.9rem;color:#555;line-height:1.8;margin:0 auto}.error-code{font-size:.6rem;color:#e87090;margin-top:1.5rem}@media(prefers-color-scheme:dark){html,body{background:#16101c;color:#a795b4}.content-container{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}.error-title{color:#e9899f}.error-message{color:#a795b4}.error-code{color:#e9899f}}</style></head><body><div class=content-container><div class=error-title>Acc\xE8s restreint</div><div class=error-message>Votre appareil n\u2019est pas autoris\xE9 \xE0 acc\xE9der \xE0 ce site. Veuillez r\xE9essayer plus tard ou contacter le support.</div><div class=error-code>SHUGOI_PROBE_RESTRICTED_ACCESS</div></div></body>';window.__sg_blocked=true;window.__sg_blockShown=true;return}
  window.__sg_guardsReady=true;
}).catch(function(){window.__sg_guardsReady=true});`;
  return `(function(){try{${fullGuard}}catch(_){window.__sg_blocked=true;window.__sg_guardsReady=true}})();`;
}
async function ensureGuardsReady(baseUrl, secret, siteKey) {
  const cache2 = getCacheEntry(baseUrl, siteKey || "cache");
  if (!cache2.detect || !cache2.guard) {
    await fetchGuardScripts(baseUrl, secret, siteKey);
  }
  startGuardPoller(baseUrl, secret, siteKey);
}
async function generateSkeleton(siteKey, token, baseUrl, restrictedAccess, _whitelist, renderUrl, locale, flags, clockts, signingSecret, supportEmail, midAnchorOk, renderTransport = "http") {
  const rurl = renderUrl || "./__shugoi/render";
  const fetched = flags ? null : await getConfig(siteKey, baseUrl, signingSecret);
  await ensureGuardsReady(baseUrl, signingSecret, siteKey);
  const cfg = flags ?? fetched.flags;
  const mail = supportEmail ?? fetched?.supportEmail ?? "";
  const loc = locale || "en";
  const msgs = MESSAGES[loc];
  const cache2 = getCacheEntry(baseUrl, siteKey);
  const fragments = [];
  fragments.push("window.__sg_siteKey=" + JSON.stringify(siteKey));
  fragments.push("window.__sg_baseUrl=" + JSON.stringify(baseUrl));
  fragments.push("window.__sg_config=" + JSON.stringify(cfg));
  if (mail) fragments.push("window.__sg_supportEmail=" + JSON.stringify(mail));
  fragments.push("window.__sg_diagEnabled=" + (process.env.NODE_ENV === "production" ? "false" : "true"));
  fragments.push("try{if((location.search||'').indexOf('sg_proof=')>=0){var _qs=location.search.replace(/[?&]sg_proof=[^&]*/,'');var _cu=location.pathname+(_qs?_qs:'')+location.hash;history.replaceState(null,'',_cu)}}catch(e){}");
  const _powTs = Math.floor(Date.now() / 1e3);
  const _powSecret = signingSecret || "";
  const _powNonce = typeof import_crypto.default.randomBytes === "function" ? import_crypto.default.randomBytes(8).toString("hex") : String(Math.floor(Math.random() * 4294967295)).padStart(8, "0") + String(Math.floor(Math.random() * 4294967295)).padStart(8, "0");
  const _powSalt = _powSecret ? import_crypto.default.createHmac("sha256", _powSecret).update(_powTs + ":" + _powNonce).digest("hex") : "";
  const _powDiff = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "12");
    const base = Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
    return midAnchorOk === false ? Math.min(base + 2, 24) : base;
  })();
  fragments.push("window.__sg_pow=" + JSON.stringify({ ts: _powTs, nonce: _powNonce, salt: _powSalt, difficulty: _powDiff }));
  const _ntpDrift = runtimeGlobal.__sg_ntpDrift || 0;
  const _ntpTime = runtimeGlobal.__sg_ntpTime || Date.now() - _ntpDrift;
  const _clockts = clockts || _ntpTime;
  fragments.push("window.__sg_ntp=" + _ntpTime);
  fragments.push("window.__sg_serverTime=" + _clockts);
  fragments.push("window.__sg_clockts=" + _clockts);
  if (!restrictedAccess) fragments.push("window.__sg_disableRestrictedAccess=true");
  if (runtimeGlobal.__sg_trustedClient === true) {
    fragments.push("window.__sg_trusted=true");
  } else {
    fragments.push("window.__sg_trusted=false");
  }
  if (renderTransport === "websocket") {
    fragments.push('window.__sg_wlcSocket=null;window.__sg_wlcDecision=null;window.__sg_wlcRequest=function(u,cb){var done=false,w,to;function finish(err,val){if(done)return;done=true;try{clearTimeout(to)}catch(_e){}cb(err,val)}try{var a=new URL(window.__sg_baseUrl||location.href,location.href);var q=new URL(u,location.href).search;if(!q||!/^https?:$/.test(a.protocol))return finish("wlc_transport_invalid");var ep=(a.protocol==="https:"?"wss://":"ws://")+a.host+a.pathname.replace(/\\/$/,"")+"/ws-wlc";w=new WebSocket(ep);window.__sg_wlcSocket=w;to=setTimeout(function(){finish("wlc_transport_timeout")},6500);w.onopen=function(){try{w.send(JSON.stringify({q:q}))}catch(_e){finish("wlc_transport_send")}};w.onmessage=function(e){var text=String(e.data);window.__sg_wlcDecision=text;try{var d=JSON.parse(text);if(d&&d.allowed&&d.grant){window.__sg_grant=d.grant;setTimeout(function(){try{if(typeof rd==="function"&&!window.__sg_blocked)rd(window.__sg_renderUrl||window.__sg_baseUrl,0)}catch(_e){}},0)}}catch(_e){}finish(null,text)};w.onerror=function(){finish("wlc_transport_error")};w.onclose=function(){window.__sg_wlcSocket=null;if(!done)finish("wlc_transport_closed")}}catch(_e){finish("wlc_transport_open")}};window.__sg_wlcStream=function(u,onData,onError){var stopped=false,w;try{var a=new URL(window.__sg_baseUrl||location.href,location.href),q=new URL(u,location.href).search;if(!q||!/^https?:$/.test(a.protocol))throw Error("invalid");var ep=(a.protocol==="https:"?"wss://":"ws://")+a.host+a.pathname.replace(/\\/$/,"")+"/ws-wlc";w=new WebSocket(ep);w.onopen=function(){if(!stopped)try{w.send(JSON.stringify({s:q}))}catch(_e){if(!stopped)onError()}};w.onmessage=function(e){if(stopped)return;try{onData(JSON.parse(String(e.data)))}catch(_e){onError()}};w.onerror=function(){if(!stopped)onError()};w.onclose=function(){if(!stopped)onError()}}catch(_e){onError()}return function(){stopped=true;try{if(w)w.close()}catch(_e){}}};');
    fragments.push('window.__sg_wlcRequest=function(u,cb){var done=false,w=window.__sg_wlcClockSocket&&window.__sg_wlcClockReady?window.__sg_wlcClockSocket:null,to;function finish(err,val){if(done)return;done=true;try{clearTimeout(to)}catch(_e){}cb(err,val)}try{var a=new URL(window.__sg_baseUrl||location.href,location.href);var z=new URL(u,location.href);var d=Number(window.__sg_midDrift);if(Number.isFinite(d))z.searchParams.set("drift",String(Math.round(d)));var q=z.search;if(!q||!/^https?:$/.test(a.protocol))return finish("wlc_transport_invalid");var ep=(a.protocol==="https:"?"wss://":"ws://")+a.host+a.pathname.replace(/\\/$/,"")+"/ws-wlc";var send=function(){try{w.send(JSON.stringify({q:q}))}catch(_e){finish("wlc_transport_send")}};if(!w||w.readyState!==1){w=new WebSocket(ep);window.__sg_wlcSocket=w;w.onopen=send}else{window.__sg_wlcSocket=w;send()}to=setTimeout(function(){finish("wlc_transport_timeout")},6500);w.onmessage=function(e){var text=String(e.data);window.__sg_wlcDecision=text;try{var x=JSON.parse(text);if(x&&x.allowed&&x.grant)window.__sg_grant=x.grant}catch(_e){}finish(null,text)};w.onerror=function(){finish("wlc_transport_error")};w.onclose=function(){if(window.__sg_wlcSocket===w)window.__sg_wlcSocket=null;if(!done)finish("wlc_transport_closed")}}catch(_e){finish("wlc_transport_open")}}');
    fragments.push('window.__sg_wlcRequest=(function(){var previous=window.__sg_wlcRequest;return function(u,cb){var settled=false;var fallback=function(){if(settled)return;try{fetch(u,{cache:"no-store",credentials:"same-origin",headers:{accept:"application/json"}}).then(function(r){return r.text()}).then(function(t){if(settled)return;settled=true;window.__sg_wlcDecision=t;cb(null,t)}).catch(function(){if(!settled){settled=true;cb("wlc_transport_unavailable")}})}catch(_e){if(!settled){settled=true;cb("wlc_transport_unavailable")}}};var timer=setTimeout(fallback,1200);try{previous(u,function(err,val){if(settled)return;clearTimeout(timer);if(!err){settled=true;cb(null,val)}else fallback()})}catch(_e){clearTimeout(timer);fallback()}}})()');
    fragments.push('window.__sgTransportSeq=window.__sgTransportSeq||0;window.__sgTransportLog=function(kind,id,event,data){try{console.log("[shugoi] transport",kind,id,event,data==null?"":data)}catch(_e){}};window.__sg_wlcRequest=(function(previous){return function(u,cb){var id="wlc-"+(++window.__sgTransportSeq),log=window.__sgTransportLog||function(){};log("initial",id,"start");return previous(u,function(err,val){log("initial",id,err?"error":"message",err||((String(val||"").match(/\\"allowed\\":(true|false)/)||[])[1]||""));cb(err,val)})}})(window.__sg_wlcRequest);window.__sg_wlcStream=(function(previous){return function(u,onData,onError){var id="stream-"+(++window.__sgTransportSeq),log=window.__sgTransportLog||function(){};log("stream",id,"start");return previous(u,function(v){log("stream",id,"message",v&&v.allowed);onData(v)},function(){log("stream",id,"error");onError()})}})(window.__sg_wlcStream);');
    fragments.push('window.__sg_wlcEvent=function(reason){try{var _a=new URL(window.__sg_baseUrl||location.href,location.href),_w=new WebSocket((_a.protocol==="https:"?"wss://":"ws://")+_a.host+_a.pathname.replace(/\\/$/,"")+"/ws-wlc");_w.onopen=function(){try{_w.send(JSON.stringify({cmd:"event",reason:String(reason||"").slice(0,128),machineId:String(window.__sg_mid||"").slice(0,256),siteKey:String(window.__sg_siteKey||"").slice(0,128)}))}catch(_e){try{_w.close()}catch(__e){}}};_w.onmessage=function(){try{_w.close()}catch(_e){}}}catch(_e){}}');
  }
  fragments.push(`(function(){try{if(window.__sg_trusted)return;var _r=document.documentElement;var _dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var _bg=_dark?"#16101c":"#fbf7f1";if(_r)_r.style.backgroundColor=_bg;var _b=document.body;if(_b)_b.style.backgroundColor=_bg;var _o=document.createElement("div");_o.id="__sg_loading";_o.style.cssText="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;pointer-events:none;background:"+_bg+";color:#e87090";_o.innerHTML='<div style="width:28px;height:28px;border:2px solid rgba(0,0,0,.08);border-top-color:#e87090;border-radius:50%;animation:__sgSpin .8s linear infinite"></div>';var _st=document.createElement("style");_st.id="__sg_paint_guard";_st.textContent="html,body{background-color:"+_bg+"!important}@keyframes __sgSpin{to{transform:rotate(360deg)}}";(document.head||document.documentElement).appendChild(_st);(document.body||document.documentElement).appendChild(_o)}catch(e){}})();`);
  if (cache2.detect) fragments.push(webkitCompatibleGuard(cache2.detect));
  const jsStr = (s) => JSON.stringify(s).slice(1, -1).replace(/</g, "\\x3c");
  const devtoolsMsg = jsStr(msgs.devtoolsBody);
  const tamperTitle = jsStr(msgs.tamperTitle);
  const fbBadge = jsStr(msgs.blockedBadge);
  const fbTitle = jsStr(msgs.blockedTitle);
  fragments.push('window.__sg_showBlock=window.__sg_showBlock||function(msg,title,badge){var _saf=/AppleWebKit/i.test(navigator.userAgent||"")&&!/(Chrome|CriOS|Chromium|Edg|OPR)/i.test(navigator.userAgent||"");if(_saf&&/remplacement\\s+de\\s+contenu|content\\s+replacement/i.test(String(msg||"")+" "+String(title||"")))return;var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><style>@font-face{font-family:\\x27Reggae One\\x27;src:url(https://shugoi.com/reggae-one.woff2) format(\\x27woff2\\x27);font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\\\\x27Segoe UI\\\\x27,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\\x27Reggae One\\x27,Georgia,\\\\x27Times New Roman\\\\x27,serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}@media (prefers-color-scheme:dark){html,body{background:#16101c}#c{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}#c .bdg{background:rgba(233,137,159,.16);border-color:rgba(233,137,159,.5);color:#e9899f}#c h2{color:#e9899f}#c p.desc{color:#a795b4}#c p.ft{color:#e9899f}}</style></head><body><div id=c><img src=https://shugoi.com/favicon-block.png class=l><img src=https://shugoi.com/brand-block.png class=b><div class=bdg>"+(badge||"' + fbBadge + '")+"</div><h2>"+(title||"' + fbTitle + '")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push("var t=" + JSON.stringify(token));
  fragments.push("window.__sg_token=" + JSON.stringify(token));
  fragments.push("var k=" + JSON.stringify(siteKey));
  fragments.push("var b=" + JSON.stringify(baseUrl));
  fragments.push("var r=" + JSON.stringify(rurl));
  fragments.push("function _sgLS(k){try{return localStorage.getItem(k)}catch(_e){return null}}function _sgSS(k,v){try{if(v===undefined)return sessionStorage.getItem(k);sessionStorage.setItem(k,v)}catch(_e){return null}}function _sgTamperOk(){try{var n=window.__sg_nativeErrorPages;return (window.__sg_config||{}).enableContentReplacementCheck===true&&!n&&!window.__sg_powRequired&&_sgLS('__sg_nativeErrorPages')!=='1'&&_sgLS('__sg_lowInternet')!=='1'}catch(_e){return false}}");
  if (renderTransport === "websocket") {
    fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked||window.__sg_renderDone||window.__sg_renderStarted)return;if(n>6){if(_sgTamperOk())window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + `");else if(_sgSS('__sg_rr')!=='1'){_sgSS('__sg_rr','1');location.reload()}else window.__sg_showBlock&&window.__sg_showBlock("` + devtoolsMsg + '","' + tamperTitle + `");return}var _g=(window.__sg_grant||"");var _m=(window.__sg_detectMid||window.__sg_mid||"");if(!_g||!_m)return setTimeout(function(){rd(p,n+1)},100);var _u=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/v1/ws-wlc';var _w;try{_w=new WebSocket(_u)}catch(_e){return setTimeout(function(){rd(p,n+1)},300)};window.__sg_renderStarted=true;var _done=false;_w.onopen=function(){try{_w.send(JSON.stringify({cmd:"render",token:t,grant:_g,mid:_m}))}catch(_e){}};_w.onmessage=function(e){if(_done||window.__sg_blocked)return;_done=true;window.__sg_renderDone=true;window.__sg_renderStarted=false;_sgSS('__sg_rr','0');document.open("text/html");document.write(String(e.data));document.close();window.scrollTo(0,0)};_w.onerror=function(){try{_w.close()}catch(_e){}};_w.onclose=function(){window.__sg_renderStarted=false;if(!_done&&!window.__sg_renderDone)setTimeout(function(){rd(p,n+1)},300)}}`);
  } else {
    fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if(_sgTamperOk())window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + `");else if(_sgSS('__sg_rr')!=='1'){_sgSS('__sg_rr','1');location.reload()}else window.__sg_showBlock&&window.__sg_showBlock("` + devtoolsMsg + '","' + tamperTitle + `");return}var _g=(window.__sg_grant||"");if(_g){p=p+("&grant="+encodeURIComponent(_g))}var _m=(window.__sg_detectMid||window.__sg_mid||"");if(_m){p=p+("&mid="+encodeURIComponent(_m))}fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){_sgSS('__sg_rr','0');document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(d.error){if(String(d.reason||d.error||"").indexOf("pow")>=0){try{window.__sg_powRequired=1}catch(_e){}}if(_sgTamperOk())window.__sg_showBlock&&window.__sg_showBlock("` + devtoolsMsg + '","' + tamperTitle + '");else setTimeout(function(){rd(p,n+1)},300)}else if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  }
  if (renderTransport === "websocket") {
    fragments.push("var _sgRdOriginal=rd;rd=function(p,n){if(window.__sg_renderDone||window.__sg_renderStarted)return;var _sgBlocked=window.__sg_blocked;window.__sg_blocked=false;try{return _sgRdOriginal(p,n)}finally{window.__sg_blocked=_sgBlocked}}");
  }
  const renderStart = renderTransport === "websocket" ? "rd(r,0)" : 'rd(r+"?token="+t,0)';
  if (renderTransport === "websocket") fragments.push('var _sgNativeOpen=document.open;document.open=function(){var _d=_sgNativeOpen.call(document);var _dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;document.write("<style>html,body{background:"+(_dark?"#16101c":"#fbf7f1")+"!important}</style>");return _d};');
  if (renderTransport === "websocket") fragments.push("window.__sg_renderKick=(function(_k){var _busy=false;return function(){if(_busy)return;_busy=true;_k()}})(window.__sg_renderKick)");
  fragments.push('window.__sg_renderKick=function(){try{if(window.__sg_grant&&!window.__sg_blocked)rd(r,0)}catch(_e){}};function _sgCl(){try{for(var _i in window){if(_i.indexOf("__sg")===0&&_i!=="__sg_grant"&&_i!=="__sg_config"&&_i!=="__sg_pow"&&_i!=="__sg_powRequired"&&_i!=="__sg_token"&&_i!=="__sg_siteKey"&&_i!=="__sg_mid"&&_i!=="__sg_detectMid"&&_i!=="__sg_clockdrift"&&_i!=="__sg_metrics"&&_i!=="__sg_renderKick"&&_i!=="__sg_renderStarted"&&_i!=="__sg_renderDone"){window[_i]=null;delete window[_i]}}window._sgLogCP=function(){};window.midHex=function(){};window.applyDecision=function(){};window._D=function(){};window.z=function(f){return f()}}catch(_e){}}_gw(function(){' + renderStart + ";setTimeout(_sgCl,1500)});setInterval(function(){try{if(window.__sg_renderKick)window.__sg_renderKick()}catch(_e){}},250)");
  const rawBootCode = fragments.join(";");
  const active = process.env.NODE_ENV === "production" && process.env.SHUGOI_BOOT_OBFUSCATE === "1";
  const variantSeed = (0, import_crypto.createHash)("sha256").update(`${siteKey}:${token}`).digest("hex");
  const bootCode = rawBootCode.replace(/<\/(script|style)/gi, "<\\/$1");
  storeBootstrap(token, "<script>" + bootCode + "</script>");
  return "<script src=\u{E0061}></script>";
}
async function injectGuardScripts(html, siteKey, baseUrl, whitelist, restrictedAccess, signingSecret, _req, _allowedOrigins, locale, clockts, midAnchorOk, renderUrl = "./__shugoi/render", renderTransport = "http") {
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
  storeHtml(signed.token, injectedHtml);
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, wl, renderUrl, locale, cfgData.flags, clockts, signingSecret, cfgData.supportEmail, midAnchorOk, renderTransport);
}
function enableDiskStore(multiProcess) {
  _diskEnabled = multiProcess;
  if (multiProcess) startDiskCleanup();
}

// src/block-page.ts
var BLOCK_PAGE = [
  "+---------------------------------------------+",
  "|           BLOCKED BY SHUGOI                 |",
  "+---------------------------------------------+",
  "|  Automated requests require a browser       |",
  "|  challenge before access is granted.        |",
  "|                                             |",
  "|  Complete the browser challenge to continue.|",
  "|                                             |",
  "|  - web: https://shugoi.com -                |",
  "+---------------------------------------------+"
].join("\n") + "\n";

// src/next/internal-request.ts
var import_node_crypto2 = require("crypto");
var INTERNAL_HEADER = "x-shugoi-internal";
var MAX_AGE_MS = 5e3;
function signature(secret, siteKey, url, cookie, stamp, nonce) {
  return (0, import_node_crypto2.createHmac)("sha256", secret).update(JSON.stringify(["next-internal-v1", siteKey, "GET", url, cookie, stamp, nonce])).digest("hex");
}
function signInternalRequest(secret, siteKey, url, cookie, now = Date.now()) {
  const stamp = String(now);
  const nonce = (0, import_node_crypto2.randomBytes)(16).toString("hex");
  return [stamp, nonce, signature(secret, siteKey, url, cookie, stamp, nonce)].join(".");
}
function verifyInternalRequest(value, secret, siteKey, url, cookie, method, now = Date.now()) {
  if (!secret || method !== "GET" || !/^\d{13}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value)) return false;
  const [stamp, nonce, mac] = value.split(".");
  const age = now - Number(stamp);
  if (age < -1e3 || age > MAX_AGE_MS) return false;
  return (0, import_node_crypto2.timingSafeEqual)(Buffer.from(mac, "hex"), Buffer.from(signature(secret, siteKey, url, cookie, stamp, nonce), "hex"));
}

// src/next/middleware.ts
var DEFAULT_HEADLESS = [/^curl/i, /^wget/i, /^python/i, /^Go-http-client/i, /^Java\//, /HTTPie/i, /^node-fetch/i, /axios/i, /^okhttp/i, /^scrapy/i, /PowerShell/i, /WinHttp/i];
var PRIVATE_HEADERS = { "cache-control": "private, no-store, max-age=0", vary: "Cookie" };
var INVISIBLE_LOADER = "(function(){var done=false;function deliver(t){if(done||!t)return;done=true;document.write(t);try{document.close()}catch(e){}}function fallback(){if(done)return;fetch('/__shugoi/bootstrap/http',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.text():''}).then(deliver).catch(function(){})}try{var ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/__shugoi/bootstrap/ws');var timer=setTimeout(function(){try{ws.close()}catch(e){}fallback()},2500);ws.onmessage=function(e){clearTimeout(timer);deliver(e.data);try{ws.close()}catch(x){}};ws.onerror=function(){clearTimeout(timer);fallback()}}catch(e){fallback()}})()";
async function renderResponseData2(token, mid, grant, ip, expectedSiteKey, secret, baseUrl) {
  return renderResponseData(token, void 0, baseUrl, mid, grant, ip, expectedSiteKey, secret);
}
function createShugoiNextMiddleware(options) {
  const baseUrl = options.baseUrl ?? "https://api.shugoi.com/api/v1";
  const secret = options.signingSecret;
  if (!secret) throw new Error("Shugoi requires an explicit site signing secret");
  const configuredApiOrigin = originOf(baseUrl);
  const responseHeaders = {
    ...PRIVATE_HEADERS,
    "content-security-policy": buildCsp(configuredApiOrigin ? { siteKey: options.siteKey, apiOrigin: configuredApiOrigin } : { siteKey: options.siteKey })
  };
  let origin;
  if (options.origin) {
    origin = new URL(options.origin);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new Error("Shugoi origin must be an HTTP(S) origin without credentials, path, query or fragment");
    }
  }
  enableDiskStore(true);
  const expectedOrigin = origin ? new URL(new import_server.NextRequest(origin).url).origin : void 0;
  const failure = (status = 503) => new import_server.NextResponse(BLOCK_PAGE, { status, headers: responseHeaders });
  return async function shugoiMiddleware(request) {
    const path = request.nextUrl.pathname;
    if (decodeInvisibleBootstrapPath(path.slice(1))) {
      return new import_server.NextResponse(INVISIBLE_LOADER, { status: 200, headers: { ...PRIVATE_HEADERS, "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate, no-transform" } });
    }
    if (path === "/__shugoi/bootstrap/http") {
      const bootstrap = readLatestBootstrap();
      return bootstrap ? new import_server.NextResponse(bootstrap, { status: 200, headers: { ...PRIVATE_HEADERS, "content-type": "application/javascript; charset=utf-8" } }) : new import_server.NextResponse("bootstrap_unavailable", { status: 404, headers: PRIVATE_HEADERS });
    }
    const cookie = request.headers.get("cookie") || "";
    const marker = request.headers.get(INTERNAL_HEADER);
    if (marker) {
      if (!expectedOrigin || new URL(request.url).origin !== expectedOrigin || !verifyInternalRequest(marker, secret, options.siteKey, request.url, cookie, request.method || "GET")) return failure(403);
      const headers = new Headers(request.headers);
      headers.delete(INTERNAL_HEADER);
      return import_server.NextResponse.next({ request: { headers }, headers: responseHeaders });
    }
    if (path.endsWith("/__shugoi/render")) {
      if (request.method !== "GET") return failure(405);
      try {
        const query = request.nextUrl.searchParams;
        const data = await renderResponseData2(query.get("token") || "", query.get("mid") || "", query.get("grant") || "", void 0, options.siteKey, secret, baseUrl);
        return import_server.NextResponse.json(data, { headers: responseHeaders });
      } catch {
        return failure();
      }
    }
    if (path.startsWith("/_next/static/") || path === "/_next/image" || path.startsWith("/api/")) return import_server.NextResponse.next();
    if (options.allowlist?.some((p) => path === p || path.startsWith(p + "/"))) return import_server.NextResponse.next();
    const ua = request.headers.get("user-agent") || "";
    if ((options.headlessPatterns ?? DEFAULT_HEADLESS).some((pattern) => pattern.test(ua))) return failure(403);
    if ((request.method || "GET") !== "GET" && request.method !== "HEAD") return failure(405);
    if (!(request.headers.get("accept") || "").includes("text/html")) return failure(406);
    if (!origin || !secret) return failure();
    try {
      const url = new URL(origin.origin);
      url.pathname = new URL(request.url).pathname;
      url.search = new URL(request.url).search;
      const fetchOptions = {
        headers: { accept: "text/html", "user-agent": "Shugoi", cookie, [INTERNAL_HEADER]: signInternalRequest(secret, options.siteKey, new import_server.NextRequest(url).url, cookie) },
        redirect: "error",
        cache: "no-store"
      };
      const internal = await fetch(url, { ...fetchOptions, signal: AbortSignal.timeout(5e3) });
      if (!internal.ok) return failure();
      const skeleton = await injectGuardScripts(
        await internal.text(),
        options.siteKey,
        baseUrl,
        options.whitelist,
        true,
        secret,
        void 0,
        void 0,
        void 0,
        void 0,
        void 0,
        `${request.nextUrl.basePath || ""}/__shugoi/render`
      );
      return new import_server.NextResponse(skeleton, { status: 200, headers: { ...responseHeaders, "content-type": "text/html; charset=utf-8" } });
    } catch {
      return failure();
    }
  };
}

// src/next/proxy.ts
function createShugoiProxy(options) {
  return createShugoiNextMiddleware({ ...options, origin: options.origin ?? options.target, allowlist: options.allowlist ?? ["/legal"] });
}

// src/next/guard-cache.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
var cache = /* @__PURE__ */ new Map();
function replaceAssets(code, assets) {
  return code.replaceAll("__SG_FAVICON__", assets.favicon ?? "__SG_FAVICON__").replaceAll("__SG_BRAND_IMG__", assets.brand ?? "__SG_BRAND_IMG__").replaceAll("__SG_TITLE_TOR__", assets.title_tor ?? "__SG_TITLE_TOR__").replaceAll("__SG_FONT_FACE__", assets.fontFace ?? "__SG_FONT_FACE__");
}
function loadLocalGuards(root, production = process.env.NODE_ENV === "production") {
  const cached = cache.get(root);
  if (cached && production) return cached;
  try {
    const assets = JSON.parse((0, import_node_fs.readFileSync)((0, import_node_path.join)(root, "lib", "guard-assets.json"), "utf8"));
    const guards = {
      detect: replaceAssets((0, import_node_fs.readFileSync)((0, import_node_path.join)(root, "scripts", "guard-detect.src.js"), "utf8"), assets),
      guard: replaceAssets((0, import_node_fs.readFileSync)((0, import_node_path.join)(root, "scripts", "guard.src.js"), "utf8"), assets)
    };
    cache.set(root, guards);
    return guards;
  } catch {
    return null;
  }
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SHUGOI_MATCHER,
  createShugoiNextMiddleware,
  createShugoiProxy,
  generateGuardHtml,
  withShugoi
});
