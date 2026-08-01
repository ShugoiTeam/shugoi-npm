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
var SHUGOI_ORIGIN = "https://shugoi.com";
function baseDirectives(apiOrigin) {
  const api = [...new Set([SHUGOI_ORIGIN, apiOrigin].filter(Boolean))];
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...api],
    "connect-src": ["'self'", ...api],
    "style-src": ["'self'", "'unsafe-inline'", ...api],
    "font-src": ["'self'", ...api, "data:"],
    "img-src": ["'self'", ...api, "data:", "blob:"],
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
  if (options.splitRender === false && merged["script-src"]) {
    merged["script-src"] = merged["script-src"].filter((v) => v !== "'unsafe-eval'");
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
    retryInSeconds: (s) => `Retry in ${s}s.`
  }
};

// src/render.ts
var TOKEN_DIR = (0, import_path.join)((0, import_os.tmpdir)(), "shugoi-render-" + (process.getuid?.() ?? "x"));
var TOKEN_TTL = 12e4;
var MAX_ENTRIES = 5e3;
var MAX_TOTAL_BYTES = 64 * 1024 * 1024;
var _memoryStore = /* @__PURE__ */ new Map();
var _diskEnabled = false;
var _totalBytes = 0;
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
function storeToDisk(token, html) {
  try {
    (0, import_fs.writeFileSync)((0, import_path.join)(TOKEN_DIR, tokenFileName(token)), html, { encoding: "utf-8", mode: 384 });
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
  const size = Buffer.byteLength(html, "utf-8");
  while ((_memoryStore.size >= MAX_ENTRIES || _totalBytes + size > MAX_TOTAL_BYTES) && _memoryStore.size > 0) {
    evictOldest();
  }
  _memoryStore.set(token, { html, expiresAt: Date.now() + TOKEN_TTL, reads: 0, contentReplaceOn });
  _totalBytes += size;
}
var GRANT_TTL_MS = 12e4;
function verifyRenderGrant(mid, grant, token, ip, expectedSiteKey) {
  const gSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!gSecret) return true;
  if (!grant || !mid || !/^[a-f0-9]{64}$/.test(mid)) return false;
  const sep = grant.indexOf(":");
  if (sep < 0) return false;
  const ts = grant.slice(0, sep);
  const sig = grant.slice(sep + 1);
  const tsSec = parseInt(ts, 36);
  if (isNaN(tsSec) || Date.now() - tsSec * 1e3 > GRANT_TTL_MS) return false;
  if (!expectedSiteKey) return false;
  const payload = "render-grant:" + [expectedSiteKey, mid, token || "", ip || "", ts].join(":");
  const exp = import_crypto.default.createHmac("sha256", gSecret).update(payload).digest("hex");
  try {
    return import_crypto.default.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(exp, "hex"));
  } catch {
    return false;
  }
}
function signToken(siteKey, timestamp, secretOverride) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
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
  for (let i = 0; i < sorted.length - MAX_TENANTS; i++) m.delete(sorted[i][0]);
}
async function refreshConfig(siteKey, baseUrl, entry) {
  try {
    const res = await fetch(baseUrl + "/whitelist?key=" + encodeURIComponent(siteKey), {
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
async function getConfig(siteKey, baseUrl) {
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
      entry.inflight = refreshConfig(siteKey, baseUrl, entry).finally(() => {
        entry.inflight = null;
      });
    }
    await entry.inflight;
    return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths };
  }
  if (age > CONFIG_CACHE_TTL && !entry.inflight) {
    entry.inflight = refreshConfig(siteKey, baseUrl, entry).finally(() => {
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
  }
  return _guardCaches.get(key);
}
async function fetchGuardScripts(baseUrl, secret, siteKey) {
  const sk = siteKey || "cache";
  const cache = getCacheEntry(baseUrl, sk);
  if (cache.fetching) return new Promise((resolve) => {
    cache.queue.push(resolve);
  });
  cache.fetching = true;
  try {
    const cb = Date.now();
    const sig = secret ? import_crypto.default.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
    const [dRes, gRes] = await Promise.all([
      fetch(baseUrl + "/guard-detect?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) }),
      fetch(baseUrl + "/guard?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) })
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
async function ensureGuardsReady(baseUrl, secret, siteKey) {
  const cache = getCacheEntry(baseUrl, siteKey || "cache");
  if (cache.detect && cache.guard && Date.now() - cache.fetchedAt < GUARD_CACHE_TTL) return;
  await fetchGuardScripts(baseUrl, secret, siteKey);
}
async function generateSkeleton(siteKey, token, baseUrl, restrictedAccess, whitelist, renderUrl, locale, flags, clockts) {
  await ensureGuardsReady(baseUrl, void 0, siteKey);
  const rurl = renderUrl || "./__shugoi/render";
  const cfg = flags ?? (await getConfig(siteKey, baseUrl)).flags;
  const loc = locale || "en";
  const msgs = MESSAGES[loc];
  const cache = getCacheEntry(baseUrl, siteKey);
  const fragments = [];
  fragments.push("window.__sg_siteKey=" + JSON.stringify(siteKey));
  fragments.push("window.__sg_baseUrl=" + JSON.stringify(baseUrl));
  fragments.push("window.__sg_config=" + JSON.stringify(cfg));
  const _ntpDrift = (typeof globalThis !== "undefined" ? globalThis.__sg_ntpDrift : 0) || 0;
  const _ntpTime = globalThis.__sg_ntpTime || Date.now() - _ntpDrift;
  const _clockts = clockts || _ntpTime;
  fragments.push("window.__sg_ntp=" + _ntpTime);
  fragments.push("window.__sg_serverTime=" + _clockts);
  fragments.push("window.__sg_clockts=" + _clockts);
  if (!restrictedAccess) fragments.push("window.__sg_disableRestrictedAccess=true");
  if (cache.detect) fragments.push("try{" + cache.detect + "}catch(e){window.__sg_blocked=true}");
  if (cache.guard) fragments.push("try{" + cache.guard + "}catch(e){window.__sg_blocked=true}");
  const jsStr = (s) => JSON.stringify(s).slice(1, -1).replace(/</g, "\\x3c");
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
  fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");return}var _g=(window.__sg_grant||"");if(_g){p=p+("&grant="+encodeURIComponent(_g))}var _m=(window.__sg_detectMid||window.__sg_mid||"");if(_m){p=p+("&mid="+encodeURIComponent(_m))}fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(d.error){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '")}else if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('function _sgCl(){try{for(var _i in window){if(_i.indexOf("__sg")===0){window[_i]=null;delete window[_i]}}window._sgLogCP=function(){};window.midHex=function(){};window.rd=function(){};window._gw=function(){};window.applyDecision=function(){};window._D=function(){};window.z=function(f){return f()}}catch(_e){}}_gw(function(){rd(r+"?token="+t,0);setTimeout(_sgCl,1500)})');
  const combinedCode = fragments.join(";");
  let encStr = "";
  for (let i = 0; i < combinedCode.length; i++) encStr += String.fromCodePoint(917504 + combinedCode.charCodeAt(i));
  const decodedCall = "[...'" + encStr + "'].map(x=>String.fromCodePoint(x.codePointAt(0)-917504)).join('')";
  const bootCode = "eval(" + decodedCall + ")";
  return "<script>" + bootCode + "</script>";
}
async function injectGuardScripts(html, siteKey, baseUrl, whitelist, restrictedAccess, signingSecret, req, _allowedOrigins, locale, clockts) {
  await ensureGuardsReady(baseUrl, signingSecret, siteKey);
  const cfgData = await getConfig(siteKey, baseUrl);
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
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, wl, renderUrl, locale, cfgData.flags, clockts);
}

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
      return import_server.NextResponse.next();
    if (path.startsWith("/_next/") || path.startsWith("/api/"))
      return import_server.NextResponse.next();
    if (allowlist.some((p) => path === p || path.startsWith(p + "/")))
      return import_server.NextResponse.next();
    const ua = request.headers.get("user-agent") || "";
    if (headless.some((p) => p.test(ua))) {
      const block = [
        "+---------------------------------------------+",
        "|           BLOCKED BY SHUGOI                 |",
        "+---------------------------------------------+",
        "|  Bots, scrapers and headless clients        |",
        "|  are blocked by Shugoi protection.          |",
        "|                                             |",
        "|  Use a standard browser to access           |",
        "|  this site.                                 |",
        "|                                             |",
        "|  - contact: support@shugoi.com -            |",
        "+---------------------------------------------+"
      ].join("\n") + "\n";
      return new import_server.NextResponse(block, { status: 403 });
    }
    if (!accept.includes("text/html")) return import_server.NextResponse.next();
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
      if (!pageRes.ok) return import_server.NextResponse.next();
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
      return new import_server.NextResponse(skeleton, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate"
        }
      });
    } catch {
      return import_server.NextResponse.next();
    }
  };
}

// src/next/middleware.ts
var import_server2 = require("next/server.js");
var import_node_fs = require("fs");
var import_node_path = require("path");
var import_node_os = require("os");
var import_node_crypto = __toESM(require("crypto"), 1);
var TOKEN_DIR2 = (0, import_node_path.join)((0, import_node_os.tmpdir)(), "shugoi-render");
var TOKEN_TTL2 = 12e4;
if (!(0, import_node_fs.existsSync)(TOKEN_DIR2)) try {
  (0, import_node_fs.mkdirSync)(TOKEN_DIR2, { recursive: true });
} catch {
}
setInterval(() => {
  try {
    for (const f of (0, import_node_fs.readdirSync)(TOKEN_DIR2)) {
      const p = (0, import_node_path.join)(TOKEN_DIR2, f);
      if (Date.now() - parseInt(f.split("_")[0] || "0") > TOKEN_TTL2) try {
        (0, import_node_fs.unlinkSync)(p);
      } catch {
      }
    }
  } catch {
  }
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
  "|  - contact: support@shugoi.com -            |",
  "+---------------------------------------------+"
].join("\n") + "\n";
function signToken2(siteKey, timestamp, secretOverride) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!secret) return { token: "" };
  const nonce = import_node_crypto.default.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = import_node_crypto.default.createHmac("sha256", secret).update(payload).digest("hex");
  return { token: payload + ":" + sig };
}
function loadAssets(root) {
  try {
    return JSON.parse((0, import_node_fs.readFileSync)((0, import_node_path.join)(root, "lib", "guard-assets.json"), "utf-8"));
  } catch {
    return {};
  }
}
function loadGuardSource(root, name, assets) {
  try {
    const p = (0, import_node_path.join)(root, "scripts", name);
    if (!(0, import_node_fs.existsSync)(p)) return "";
    let code = (0, import_node_fs.readFileSync)(p, "utf-8");
    if (assets.favicon) code = code.replaceAll("__SG_FAVICON__", assets.favicon);
    if (assets.brand) code = code.replaceAll("__SG_BRAND_IMG__", assets.brand);
    if (assets.title_tor) code = code.replaceAll("__SG_TITLE_TOR__", assets.title_tor);
    return code;
  } catch {
    return "";
  }
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
    const sig = secret ? import_node_crypto.default.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
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
  let enc = "";
  for (let i = 0; i < combined.length; i++) {
    enc += String.fromCodePoint(917504 + combined.charCodeAt(i));
  }
  return "<script>eval([...'" + enc + "'].map(function(x){return String.fromCodePoint(x.codePointAt(0)-917504)}).join(''))</script>";
}
function renderResponseData(token, mid, grant, ip, expectedSiteKey) {
  if (!token || token.length < 16 || token.length > 300) return { error: "not_found" };
  if (expectedSiteKey && token.split(":")[0] !== expectedSiteKey) return { error: "not_found" };
  if (!verifyRenderGrant(mid, grant, token, ip, expectedSiteKey)) return { error: "not_found" };
  const suffix = token.slice(-16);
  try {
    for (const f of (0, import_node_fs.readdirSync)(TOKEN_DIR2)) {
      if (f.endsWith(suffix)) {
        const html = (0, import_node_fs.readFileSync)((0, import_node_path.join)(TOKEN_DIR2, f), "utf-8");
        return { html };
      }
    }
  } catch {
  }
  return { blocked: true };
}
function createShugoiNextMiddleware(options) {
  const { siteKey, baseUrl, allowlist, signingSecret } = options;
  const headless = DEFAULT_HEADLESS2;
  const root = process.cwd();
  const BASE_URL2 = baseUrl ?? "https://shugoi.com/api/v1";
  return async function shugoiMiddleware(request) {
    if (request.headers.get("x-shugoi-internal") === "1")
      return import_server2.NextResponse.next();
    const path = request.nextUrl.pathname;
    const accept = request.headers.get("accept") || "";
    if (path.endsWith("/__shugoi/render")) {
      const token = request.nextUrl.searchParams.get("token") || "";
      const mid = request.nextUrl.searchParams.get("mid") || "";
      const grant = request.nextUrl.searchParams.get("grant") || "";
      const xff = request.headers.get("x-forwarded-for") || "";
      const ip = xff.split(",")[0]?.trim() || "unknown";
      return import_server2.NextResponse.json(renderResponseData(token, mid, grant, ip, options.siteKey));
    }
    if (path.startsWith("/_next/") || path.startsWith("/api/")) return import_server2.NextResponse.next();
    if (allowlist?.some((p) => path === p || path.startsWith(p + "/"))) return import_server2.NextResponse.next();
    const ua = request.headers.get("user-agent") || "";
    if (headless.some((p) => p.test(ua))) {
      return new import_server2.NextResponse(BLOCK_PAGE, { status: 403 });
    }
    if (!accept.includes("text/html")) return import_server2.NextResponse.next();
    const isBot = DEFAULT_BOT_WHITELIST.some((p) => p.test(ua));
    if (isBot) return import_server2.NextResponse.next();
    try {
      let detectCode = "";
      let guardCode = "";
      const assets = loadAssets(root);
      detectCode = loadGuardSource(root, "guard-detect.src.js", assets);
      guardCode = loadGuardSource(root, "guard.src.js", assets);
      if (!detectCode || !guardCode) {
        const httpGuards = await fetchGuardsHttp(BASE_URL2, siteKey, signingSecret);
        if (httpGuards) {
          detectCode = httpGuards.detect;
          guardCode = httpGuards.guard;
        }
      }
      if (!detectCode) {
        console.error("[shugoi] WARNING: unable to load guard scripts \u2014 protection inactive");
        return import_server2.NextResponse.next();
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
        (0, import_node_fs.writeFileSync)((0, import_node_path.join)(TOKEN_DIR2, ts + "_" + signed.token.slice(-16)), originalHtml, "utf-8");
      }
      const skeleton = generateBootcode(siteKey, cfg, detectCode, guardCode);
      const fullPage = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' + skeleton + '</head><body><div id="__sg_root"></div></body></html>';
      return new import_server2.NextResponse(fullPage, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    } catch {
      return import_server2.NextResponse.next();
    }
  };
}

// src/next/guard-component.ts
var import_node_fs2 = require("fs");
var import_node_path2 = require("path");
async function generateGuardHtml({ siteKey, enableWhitelist = true, enableVmCheck = true }) {
  try {
    const root = process.cwd();
    const assets = {};
    try {
      const a = JSON.parse((0, import_node_fs2.readFileSync)((0, import_node_path2.join)(root, "lib", "guard-assets.json"), "utf-8"));
      if (a.favicon) assets.favicon = a.favicon;
      if (a.brand) assets.brand = a.brand;
      if (a.title_tor) assets.title_tor = a.title_tor;
    } catch {
    }
    const detectPath = (0, import_node_path2.join)(root, "scripts", "guard-detect.src.js");
    const guardPath = (0, import_node_path2.join)(root, "scripts", "guard.src.js");
    if (!(0, import_node_fs2.existsSync)(detectPath)) return '<script>console.warn("Shugoi guards not found")</script>';
    let detect = (0, import_node_fs2.readFileSync)(detectPath, "utf-8");
    let guard = (0, import_node_fs2.readFileSync)(guardPath, "utf-8");
    if (assets.favicon) {
      detect = detect.replaceAll("__SG_FAVICON__", assets.favicon);
      guard = guard.replaceAll("__SG_FAVICON__", assets.favicon);
    }
    if (assets.brand) {
      detect = detect.replaceAll("__SG_BRAND_IMG__", assets.brand);
      guard = guard.replaceAll("__SG_BRAND_IMG__", assets.brand);
    }
    if (assets.title_tor) detect = detect.replaceAll("__SG_TITLE_TOR__", assets.title_tor);
    const cfg = JSON.stringify({ enableWhitelist, enableVmCheck, enableTorCheck: true, enableHeadlessCheck: true, enableAntiDetectCheck: true, enableContentReplacementCheck: false });
    const combined = "window.__sg_siteKey=" + JSON.stringify(siteKey) + ";window.__sg_config=" + cfg + ";try{" + detect + "}catch(e){window.__sg_blocked=true};try{" + guard + "}catch(e){window.__sg_blocked=true}";
    let enc = "";
    for (let i = 0; i < combined.length; i++) {
      enc += String.fromCodePoint(917504 + combined.charCodeAt(i));
    }
    return "<script>eval([...'" + enc + "'].map(function(x){return String.fromCodePoint(x.codePointAt(0)-917504)}).join(''))</script>";
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
//# sourceMappingURL=index.cjs.map