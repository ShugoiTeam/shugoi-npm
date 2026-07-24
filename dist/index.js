var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/render.ts
var render_exports = {};
__export(render_exports, {
  ensureGuardsReady: () => ensureGuardsReady,
  fetchConfigForSiteKey: () => fetchConfigForSiteKey,
  fetchWhitelistForSiteKey: () => fetchWhitelistForSiteKey,
  generateSkeleton: () => generateSkeleton,
  handleRender: () => handleRender,
  injectGuardScripts: () => injectGuardScripts,
  renderResponseData: () => renderResponseData,
  signToken: () => signToken,
  storeHtml: () => storeHtml
});
import crypto from "crypto";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
function storeHtml(token, html) {
  try {
    writeFileSync(join(TOKEN_DIR, Date.now() + "_" + token.slice(-16)), html, "utf-8");
  } catch {
  }
}
function renderResponseData(token) {
  const suffix = token.slice(-16);
  try {
    for (const f of readdirSync(TOKEN_DIR)) {
      if (f.endsWith(suffix)) {
        const html = readFileSync(join(TOKEN_DIR, f), "utf-8");
        try {
          unlinkSync(join(TOKEN_DIR, f));
        } catch {
        }
        return { html };
      }
    }
  } catch {
  }
  const parts = token.split(":");
  if (parts.length === 4 && parts[3] && parts[3].length === 64) {
    return { blocked: true, reason: "manual_modification", message: "Nous avons remarqu\xE9 que vous avez tent\xE9 de modifier manuellement le rendu client c\xF4t\xE9 navigateur via les DevTools. Cette pratique est \xE9videmment bloqu\xE9e par nos services. Et oui, m\xEAme \xE7a on le voit !", title: "Remplacement de contenu client d\xE9tect\xE9" };
  }
  return { error: "not_found" };
}
function handleRender(token, res) {
  const data = renderResponseData(token);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader("Content-Type", "application/json");
  if (res.send) res.send(json);
  else if (res.end) res.end(json);
}
function signToken(siteKey, timestamp, secretOverride) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || "dev-secret-do-not-use-in-prod";
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { token: payload + ":" + sig };
}
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function stripComments(s) {
  return s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n{3,}/g, "\n\n");
}
function obfuscateGuards(code, seed) {
  let r = stripComments(code);
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
function applyObfuscation(code, seed) {
  let r = obfuscateGuards(code, seed);
  r = r.replace(/<\/(script|style)/gi, "<\\/$1");
  return r;
}
async function fetchWhitelistForSiteKey(siteKey, baseUrl) {
  try {
    const res = await fetch(baseUrl + "/whitelist?key=" + encodeURIComponent(siteKey) + "&_=" + Date.now());
    if (res.ok) {
      const data = await res.json();
      _lastConfig[baseUrl + "@" + siteKey] = data.detectionFlags || {};
      return data.whitelistedMachines || [];
    }
  } catch {
  }
  return [];
}
async function fetchConfigForSiteKey(siteKey, baseUrl) {
  await fetchWhitelistForSiteKey(siteKey, baseUrl);
  return _lastConfig[baseUrl + "@" + siteKey] || {};
}
async function fetchGuardScripts(baseUrl) {
  if (_guardCache.fetching) return new Promise((resolve) => {
    _guardCache.queue.push(resolve);
  });
  _guardCache.fetching = true;
  try {
    const cb = Date.now();
    const [dRes, gRes] = await Promise.all([
      fetch(baseUrl + "/guard-detect?key=cache&raw=1&cb=" + cb),
      fetch(baseUrl + "/guard?key=cache&raw=1&cb=" + cb)
    ]);
    const rawDetect = await dRes.text();
    const rawGuard = await gRes.text();
    const seed = cb.toString(36);
    _guardCache.detect = applyObfuscation(rawDetect, seed);
    _guardCache.guard = applyObfuscation(rawGuard, seed);
  } catch (e) {
    _guardCache.detect = _guardCache.detect || 'console.error("Shugoi guard-detect unavailable")';
    _guardCache.guard = _guardCache.guard || 'console.error("Shugoi guard unavailable")';
  }
  _guardCache.fetching = false;
  _guardCache.queue.forEach((r) => r());
  _guardCache.queue = [];
}
async function ensureGuardsReady(baseUrl) {
  if (_guardCache.detect && _guardCache.guard) return;
  await fetchGuardScripts(baseUrl);
}
async function generateSkeleton(siteKey, token, baseUrl, restrictedAccess, whitelist, renderUrl) {
  await ensureGuardsReady(baseUrl);
  const rurl = renderUrl || "./__shugoi/render";
  if (!whitelist) whitelist = await fetchWhitelistForSiteKey(siteKey, baseUrl);
  const cfg = await fetchConfigForSiteKey(siteKey, baseUrl);
  const fragments = [];
  fragments.push("window.__sg_siteKey=" + JSON.stringify(siteKey));
  fragments.push("window.__sg_config=" + JSON.stringify(cfg));
  if (cfg && cfg.enableWhitelist !== false && whitelist && Array.isArray(whitelist)) fragments.push("window.__sg_whitelist=" + JSON.stringify(whitelist));
  if (!restrictedAccess) fragments.push("window.__sg_disableRestrictedAccess=true");
  if (_guardCache.detect) fragments.push("try{" + _guardCache.detect + "}catch(e){window.__sg_blocked=true}");
  if (_guardCache.guard) fragments.push("try{" + _guardCache.guard + "}catch(e){window.__sg_blocked=true}");
  fragments.push('window.__sg_showBlock=function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><link href=https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap rel=stylesheet><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:Alex Brush,cursive;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=/favicon-block.png class=l><img src=/brand-block.png class=b><div class=bdg>"+(badge||"Blocage")+"</div><h2>"+(title||"Acces bloque")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push('var t="' + token + '"');
  fragments.push('var k="' + siteKey + '"');
  fragments.push('var b="' + baseUrl + '"');
  fragments.push('var r="' + rurl + '"');
  fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if((window.__sg_config||{}).enableContentReplacementCheck!==false)window.__sg_showBlock&&window.__sg_showBlock("L\\u0027utilisation des Devtools pour remplacer le contenu ou modifier les requ\\u00eates r\\u00e9seau a \\u00e9t\\u00e9 d\\u00e9tect\\u00e9e. L\\u0027int\\u00e9grit\\u00e9 de la page est prot\\u00e9g\\u00e9e et toute alt\\u00e9ration est imm\\u00e9diatement bloqu\\u00e9e. Eh oui ! On le d\\u00e9tecte aussi.","Remplacement de contenu client d\\u00e9tect\\u00e9");return}document.body.style.display="none";fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){document.body.style.display="";window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(!d.html&&!d.blocked){document.body.style.display="";setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){document.body.style.display="";setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('_gw(function(){rd(r+"?token="+t,0)})');
  const combinedCode = fragments.join(";");
  let encStr = "";
  for (let i = 0; i < combinedCode.length; i++) encStr += String.fromCodePoint(917504 + combinedCode.charCodeAt(i));
  const bootCode = "eval([...'" + encStr + "'].map(x=>String.fromCodePoint(x.codePointAt(0)-917504)).join(''))";
  return "<script>" + bootCode + "</script>";
}
async function injectGuardScripts(html, siteKey, baseUrl, whitelist, restrictedAccess, signingSecret, req, allowedOrigins = []) {
  await ensureGuardsReady(baseUrl);
  if (!whitelist) whitelist = await fetchWhitelistForSiteKey(siteKey, baseUrl);
  const cfg = await fetchConfigForSiteKey(siteKey, baseUrl);
  const ts = Date.now();
  const signed = signToken(siteKey, ts, signingSecret);
  const configVars = [];
  if (cfg && cfg.enableWhitelist !== false && whitelist) configVars.push("window.__sg_whitelist=" + JSON.stringify(whitelist));
  if (!restrictedAccess) configVars.push("window.__sg_disableRestrictedAccess=true");
  if (allowedOrigins && allowedOrigins.length > 0) configVars.push("window.__sg_allowedOrigins=" + JSON.stringify(allowedOrigins));
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
  const renderUrl = "./__shugoi/render";
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, whitelist, renderUrl);
}
var TOKEN_DIR, TOKEN_TTL, RENAMES, _lastConfig, _guardCache;
var init_render = __esm({
  "src/render.ts"() {
    "use strict";
    TOKEN_DIR = join(tmpdir(), "shugoi-render");
    TOKEN_TTL = 12e4;
    if (!existsSync(TOKEN_DIR)) try {
      mkdirSync(TOKEN_DIR, { recursive: true });
    } catch {
    }
    setInterval(() => {
      try {
        for (const f of readdirSync(TOKEN_DIR)) {
          const p = join(TOKEN_DIR, f);
          if (Date.now() - parseInt(f.split("_")[0] || "0") > TOKEN_TTL) try {
            unlinkSync(p);
          } catch {
          }
        }
      } catch {
      }
    }, 3e4).unref();
    RENAMES = { buildOverlay: "_wf", checkNotice: "_wg", hex: "_wh", stable: "_wi" };
    _lastConfig = {};
    _guardCache = { detect: null, guard: null, fetching: false, queue: [] };
  }
});

// src/errors.ts
var ShugoiError = class extends Error {
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = "ShugoiError";
  }
  code;
  cause;
};

// src/index.ts
init_render();

// src/middleware.ts
init_render();
var DEFAULT_HEADLESS_PATTERNS = [
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
function shieldPage(title, msg, badge, host) {
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Itim&display=swap" rel="stylesheet"><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:Itim,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:"Alex Brush",cursive;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon.png alt class=l><img src=https://shugoi.com/brand.png alt class=b><div class=bdg>' + (badge || "Blocage") + "</div><h2>" + (title || "Acc\xE8s bloqu\xE9") + "</h2><p class=desc>" + (msg || "") + "</p><p class=ft>" + (host || "shugoi.com") + " \xB7 Shugoi</p></div></body></html>";
}
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
function buildCsp(options) {
  const DEFAULT_DIRECTIVES2 = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://shugoi.com"],
    "connect-src": ["'self'", "https://shugoi.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
    "img-src": ["'self'", "https://shugoi.com", "data:"],
    "frame-src": ["'self'", "https://shugoi.com"]
  };
  const merged = { ...DEFAULT_DIRECTIVES2 };
  if (options.extraDirectives) {
    for (const [key, values] of Object.entries(options.extraDirectives)) {
      merged[key] = values;
    }
  }
  return Object.entries(merged).map(([key, values]) => `${key} ${values.join(" ")}`).join("; ");
}
var _cachedFlags = null;
var _flagsFetchedAt = 0;
function createShugoiMiddleware(options) {
  const allowlist = options.allowlist ?? ["/legal"];
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST;
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const debug = options.debug ?? false;
  const autoInject = options.autoInject ?? true;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret;
  const siteSecret = options.secret;
  let _validationValid = false;
  let _validationFailed = false;
  let _validationAllowedOrigins = [];
  (async () => {
    if (siteSecret && baseUrl) {
      try {
        const res = await fetch(baseUrl + "/validate-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteKey: options.siteKey, secret: siteSecret }),
          signal: AbortSignal.timeout(5e3)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.valid) {
            _validationValid = true;
            _validationAllowedOrigins = data.allowedOrigins || [];
            if (debug) console.log("[shugoi] key validation OK");
          } else {
            _validationFailed = true;
            console.warn("[shugoi] KEY VALIDATION FAILED:", data.reason || "unknown");
          }
        } else {
          _validationFailed = true;
          console.warn("[shugoi] KEY VALIDATION FAILED: HTTP", res.status);
        }
      } catch (e) {
        _validationFailed = true;
        console.warn("[shugoi] KEY VALIDATION FAILED: network error", e);
      }
    } else if (debug) {
      console.log("[shugoi] no secret provided, skipping key validation");
    }
  })();
  ensureGuardsReady(baseUrl).catch(() => {
  });
  const csp = buildCsp({ siteKey: options.siteKey, extraDirectives: {} });
  function log(...args) {
    if (debug) console.log("[shugoi]", ...args);
  }
  async function getFlags() {
    if (_cachedFlags && Date.now() - _flagsFetchedAt < 1e4) return _cachedFlags;
    try {
      const res = await fetch(baseUrl + "/whitelist?key=" + encodeURIComponent(options.siteKey));
      if (res.ok) {
        const d = await res.json();
        _cachedFlags = d.detectionFlags || {};
        _flagsFetchedAt = Date.now();
        return _cachedFlags;
      }
    } catch {
    }
    return _cachedFlags || {};
  }
  return async function shugoiMiddleware(req, res, next) {
    try {
      const path = (req.path ?? req.url ?? "/").split("?")[0];
      if (siteSecret && !_validationValid && !_validationFailed) {
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 50));
          if (_validationValid || _validationFailed) break;
        }
      }
      if (siteSecret && _validationFailed) {
        log("secret validation failed \u2014 skipping protection");
        return next();
      }
      if (path.endsWith("/__shugoi/render")) {
        const { handleRender: handleRender2 } = await Promise.resolve().then(() => (init_render(), render_exports));
        return handleRender2(req.query && req.query.token || "", res);
      }
      if (res.setHeader) res.setHeader("Content-Security-Policy", csp);
      const flags = await getFlags();
      if (allowlist.some((p) => path === p || path.startsWith(p + "/"))) return next();
      if (flags.enableRateLimit !== false) {
        try {
          const ip = req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
          const rlRes = await fetch(baseUrl + "/rate-limit-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteKey: options.siteKey, fingerprint: { browser: ip }, metadata: { ip, userAgent: req.headers?.["user-agent"] || "", middleware: true } }),
            signal: AbortSignal.timeout(2e3)
          });
          if (rlRes.ok) {
            const rlData = await rlRes.json();
            if (rlData.allowed === false) {
              if (res.status) res.status(429);
              const remain = Math.max(0, Math.ceil((rlData.resetAt - Date.now()) / 1e3));
              const mins = Math.floor(remain / 60);
              const secs = remain % 60;
              const timeStr = mins > 0 ? mins + " min" + (mins > 1 ? "s" : "") + (secs > 0 ? " " + secs + " s" : "") : secs + " seconde" + (secs > 1 ? "s" : "");
              if (res.send) res.send(shieldPage("Trop de requ\xEAtes", "Vous avez effectu\xE9 trop de requ\xEAtes en peu de temps. Il reste " + timeStr + " avant de pouvoir r\xE9essayer.", "Rate Limit", req.headers?.host));
              return;
            }
          }
        } catch (e) {
        }
      }
      const ua = req.headers?.["user-agent"] ?? "";
      if (flags.enableHeadlessCheck !== false && ua && !botWhitelist.some((p) => p.test(ua)) && headlessPatterns.some((p) => p.test(ua))) {
        log("headless block:", ua.slice(0, 40));
        fetch(baseUrl + "/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey: options.siteKey, reason: "headless" }), signal: AbortSignal.timeout(2e3) }).catch(() => {
        });
        if (res.status) res.status(200);
        if (res.type) res.type("txt");
        if (res.send) res.send(BLOCK_PAGE);
        else if (res.end) res.end(BLOCK_PAGE);
        return;
      }
      if (flags.enableHeadlessCheck !== false && /Mozilla/i.test(ua) && !botWhitelist.some((p) => p.test(ua))) {
        const sfd = req.headers?.["sec-fetch-dest"] ?? "";
        const sfm = req.headers?.["sec-fetch-mode"] ?? "";
        const al = req.headers?.["accept-language"] ?? "";
        if (!al || !sfd && !sfm) {
          log("fake browser block:", ua.slice(0, 40));
          fetch(baseUrl + "/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey: options.siteKey, reason: "headless" }), signal: AbortSignal.timeout(2e3) }).catch(() => {
          });
          if (res.status) res.status(200);
          if (res.type) res.type("txt");
          if (res.send) res.send(BLOCK_PAGE);
          else if (res.end) res.end(BLOCK_PAGE);
          return;
        }
      }
      if (autoInject) {
        let injected = false;
        const originalSend = res.send?.bind(res);
        const originalEnd = res.end?.bind(res);
        const doInject = async (body) => {
          if (injected) return body;
          if (typeof body === "string") {
            const ct = res.getHeader ? res.getHeader("content-type") : void 0;
            if (!ct || String(ct).includes("text/html")) {
              try {
                body = await injectGuardScripts(body, options.siteKey, baseUrl, void 0, restrictedAccess, signingSecret, req, _validationAllowedOrigins);
              } catch (e) {
                log("inject error:", e);
              }
              injected = true;
            }
          }
          return body;
        };
        if (originalSend) {
          res.send = function(body) {
            return doInject(body).then((b) => originalSend(b));
          };
        }
        if (originalEnd) {
          res.end = function(body) {
            return doInject(body).then((b) => originalEnd(b));
          };
        }
      }
      next();
    } catch (err) {
      log("Unhandled error:", err);
      next();
    }
  };
}
function createShugoiPlugin(options) {
  const allowlist = options.allowlist ?? ["/legal"];
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST;
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const debug = options.debug ?? false;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret;
  const siteSecret = options.secret;
  let _validationValid = false;
  let _validationFailed = false;
  let _validationAllowedOrigins = [];
  (async () => {
    if (siteSecret && baseUrl) {
      try {
        const res = await fetch(baseUrl + "/validate-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteKey: options.siteKey, secret: siteSecret }),
          signal: AbortSignal.timeout(5e3)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.valid) {
            _validationValid = true;
            _validationAllowedOrigins = data.allowedOrigins || [];
            if (debug) console.log("[shugoi] key validation OK");
          } else {
            _validationFailed = true;
            console.warn("[shugoi] KEY VALIDATION FAILED:", data.reason || "unknown");
          }
        } else {
          _validationFailed = true;
          console.warn("[shugoi] KEY VALIDATION FAILED: HTTP", res.status);
        }
      } catch (e) {
        _validationFailed = true;
        console.warn("[shugoi] KEY VALIDATION FAILED: network error", e);
      }
    } else if (debug) {
      console.log("[shugoi] no secret provided, skipping key validation");
    }
  })();
  ensureGuardsReady(baseUrl).catch(() => {
  });
  const csp = buildCsp({ siteKey: options.siteKey, extraDirectives: {} });
  function log(...args) {
    if (debug) console.log("[shugoi]", ...args);
  }
  async function getFlags() {
    if (_cachedFlags && Date.now() - _flagsFetchedAt < 1e4) return _cachedFlags;
    try {
      const res = await fetch(baseUrl + "/whitelist?key=" + encodeURIComponent(options.siteKey));
      if (res.ok) {
        const d = await res.json();
        _cachedFlags = d.detectionFlags || {};
        _flagsFetchedAt = Date.now();
        return _cachedFlags;
      }
    } catch {
    }
    return _cachedFlags || {};
  }
  return async function shugoiPlugin(fastify) {
    fastify.addHook("onRequest", async (request, reply) => {
      reply.header("Content-Security-Policy", csp);
    });
    fastify.get("/__shugoi/render", async (request, reply) => {
      const { renderResponseData: renderResponseData2 } = await Promise.resolve().then(() => (init_render(), render_exports));
      const data = renderResponseData2(request.query.token || "");
      reply.send(data);
    });
    fastify.head("/__shugoi/healthcheck", async (request, reply) => reply.send(""));
    fastify.addHook("preHandler", async (request, reply) => {
      try {
        const path = request.url.split("?")[0];
        if (path.endsWith("/__shugoi/render") || path.endsWith("/__shugoi/healthcheck")) return;
        if (allowlist.some((p) => path === p || path.startsWith(p + "/"))) return;
        if (siteSecret && !_validationValid && !_validationFailed) {
          for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 50));
            if (_validationValid || _validationFailed) break;
          }
        }
        if (siteSecret && _validationFailed) {
          log("secret validation failed \u2014 skipping protection");
          return;
        }
        await ensureGuardsReady(baseUrl).catch(() => {
        });
        const flags = await getFlags();
        if (flags.enableRateLimit !== false) {
          try {
            const ip = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.ip || "unknown";
            const rlRes = await fetch(baseUrl + "/rate-limit-check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ siteKey: options.siteKey, fingerprint: { browser: ip }, metadata: { ip, userAgent: request.headers["user-agent"] || "", middleware: true } }),
              signal: AbortSignal.timeout(2e3)
            });
            if (rlRes.ok) {
              const rlData = await rlRes.json();
              if (rlData.allowed === false) {
                const remain = Math.max(0, Math.ceil((rlData.resetAt - Date.now()) / 1e3));
                const mins = Math.floor(remain / 60);
                const secs = remain % 60;
                const timeStr = mins > 0 ? mins + " min" + (mins > 1 ? "s" : "") + (secs > 0 ? " " + secs + " s" : "") : secs + " seconde" + (secs > 1 ? "s" : "");
                reply.code(429).type("text/html").send(shieldPage("Trop de requ\xEAtes", "Vous avez effectu\xE9 trop de requ\xEAtes en peu de temps. Il reste " + timeStr + " avant de pouvoir r\xE9essayer.", "Rate Limit", request.headers?.host));
                return;
              }
            }
          } catch (e) {
          }
        }
        const ua = request.headers["user-agent"] ?? "";
        if (flags.enableHeadlessCheck !== false && ua && !botWhitelist.some((p) => p.test(ua)) && headlessPatterns.some((p) => p.test(ua))) {
          fetch(baseUrl + "/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey: options.siteKey, reason: "headless" }), signal: AbortSignal.timeout(2e3) }).catch(() => {
          });
          reply.code(200).type("text/plain").send(BLOCK_PAGE);
          return;
        }
        if (flags.enableHeadlessCheck !== false && /Mozilla/i.test(ua) && !botWhitelist.some((p) => p.test(ua))) {
          const sfd = request.headers["sec-fetch-dest"] ?? "";
          const sfm = request.headers["sec-fetch-mode"] ?? "";
          const al = request.headers["accept-language"] ?? "";
          if (!al || !sfd && !sfm) {
            fetch(baseUrl + "/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey: options.siteKey, reason: "headless" }), signal: AbortSignal.timeout(2e3) }).catch(() => {
            });
            reply.code(200).type("text/plain").send(BLOCK_PAGE);
            return;
          }
        }
      } catch (err) {
        log("preHandler error:", err);
      }
    });
    fastify.addHook("onSend", async (request, reply, payload) => {
      if (typeof payload !== "string") return payload;
      const path = request.url.split("?")[0];
      if (path.endsWith("/__shugoi/render") || path.endsWith("/__shugoi/healthcheck")) return payload;
      if (reply.statusCode !== 200) return payload;
      const ct = reply.getHeader("content-type");
      if (!ct || String(ct).includes("text/html")) {
        return await injectGuardScripts(payload, options.siteKey, baseUrl, void 0, restrictedAccess, signingSecret, { url: path }, _validationAllowedOrigins);
      }
      return payload;
    });
  };
}

// src/csp.ts
var DEFAULT_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://shugoi.com"],
  "connect-src": ["'self'", "https://shugoi.com"],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
  "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
  "img-src": ["'self'", "https://shugoi.com", "data:"],
  "frame-src": ["'self'", "https://shugoi.com"]
};
function buildCsp2(options) {
  const merged = { ...DEFAULT_DIRECTIVES };
  if (options.extraDirectives) {
    for (const [key, values] of Object.entries(options.extraDirectives)) {
      merged[key] = values;
    }
  }
  return Object.entries(merged).map(([key, values]) => `${key} ${values.join(" ")}`).join("; ");
}

// src/check-license.ts
async function checkLicense(options) {
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const timeout = options.timeout ?? 5e3;
  const serverUa = options.serverUa ?? "ShugoiNode/0.1.0";
  const body = {
    siteKey: options.siteKey,
    action: options.action,
    fingerprint: {
      machineId: options.machineId
    },
    signals: options.signals ?? {},
    captchaToken: options.captchaToken,
    passToken: options.passToken,
    metadata: options.metadata
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(`${baseUrl}/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": serverUa
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.error === "invalid_site_key") {
      throw new ShugoiError("invalid_site_key", `Invalid siteKey: ${options.siteKey}`);
    }
    if (!res.ok) {
      throw new ShugoiError(
        "unexpected_api_response",
        `API returned status ${res.status}: ${JSON.stringify(data)}`
      );
    }
    return data;
  } catch (err) {
    if (err instanceof ShugoiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ShugoiError("api_timeout", "Shugoi API request timed out", err);
    }
    throw new ShugoiError("api_unreachable", "Shugoi API unreachable", err);
  }
}

// src/scripts.ts
init_render();
function scriptTags(options) {
  const base = options.baseUrl ?? "https://shugoi.com/api/v1";
  const key = options.siteKey;
  const ts = Date.now();
  const signed = signToken(key, ts, options.signingSecret);
  const skel = generateSkeleton(key, signed.token, base, options.restrictedAccess ?? false, options.whitelist);
  return { guardDetect: skel, guard: "", whitelistConfig: "", token: signed.token };
}

// src/validate-site-key.ts
async function validateSiteKey(options) {
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const timeout = options.timeout ?? 5e3;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(`${baseUrl}/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ShugoiNode/0.1.0"
      },
      body: JSON.stringify({
        siteKey: options.siteKey,
        action: "validate",
        fingerprint: {},
        signals: {}
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.error === "invalid_site_key") {
      return { valid: false, error: "invalid_site_key" };
    }
    const mode = options.siteKey.startsWith("sg_sk_test_") ? "test" : "live";
    return { valid: true, mode };
  } catch (err) {
    if (err instanceof ShugoiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ShugoiError("api_timeout", "API request timed out", err);
    }
    throw new ShugoiError("api_unreachable", "Shugoi API unreachable", err);
  }
}
export {
  BLOCK_PAGE,
  DEFAULT_BOT_WHITELIST,
  DEFAULT_HEADLESS_PATTERNS,
  ShugoiError,
  buildCsp2 as buildCsp,
  checkLicense,
  createShugoiMiddleware,
  createShugoiPlugin,
  fetchWhitelistForSiteKey,
  generateSkeleton,
  handleRender,
  injectGuardScripts,
  renderResponseData,
  scriptTags,
  signToken,
  storeHtml,
  validateSiteKey
};
//# sourceMappingURL=index.js.map