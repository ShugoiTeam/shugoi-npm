var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/locales.ts
function resolveLocale(explicit, acceptLanguage) {
  if (explicit) return explicit;
  if (acceptLanguage && /^fr\b|,\s*fr\b/i.test(acceptLanguage)) return "fr";
  return "en";
}
var MESSAGES;
var init_locales = __esm({
  "src/locales.ts"() {
    "use strict";
    MESSAGES = {
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
  }
});

// src/render.ts
var render_exports = {};
__export(render_exports, {
  __clearConfigCache: () => __clearConfigCache,
  enableDiskStore: () => enableDiskStore,
  ensureGuardsReady: () => ensureGuardsReady,
  fetchConfigForSiteKey: () => fetchConfigForSiteKey,
  fetchWhitelistForSiteKey: () => fetchWhitelistForSiteKey,
  generateSkeleton: () => generateSkeleton,
  getConfig: () => getConfig,
  handleRender: () => handleRender,
  injectGuardScripts: () => injectGuardScripts,
  injectReferrerPolicy: () => injectReferrerPolicy,
  renderResponseData: () => renderResponseData,
  signToken: () => signToken,
  storeHtml: () => storeHtml,
  verifyRenderGrant: () => verifyRenderGrant
});
import crypto, { createHash } from "crypto";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, chmodSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
function tokenFileName(token) {
  return createHash("sha256").update(token).digest("hex");
}
function startDiskCleanup() {
  setInterval(() => {
    try {
      for (const f of readdirSync(TOKEN_DIR)) {
        const p = join(TOKEN_DIR, f);
        try {
          if (Date.now() - statSync(p).mtimeMs > TOKEN_TTL) unlinkSync(p);
        } catch {
        }
      }
    } catch {
    }
  }, 3e4).unref();
}
function storeToDisk(token, html) {
  try {
    writeFileSync(join(TOKEN_DIR, tokenFileName(token)), html, { encoding: "utf-8", mode: 384 });
  } catch {
  }
}
function readFromDisk(token) {
  try {
    const p = join(TOKEN_DIR, tokenFileName(token));
    if (!existsSync(p)) return null;
    return readFileSync(p, "utf-8");
  } catch {
    return null;
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
function readFromMemory(token) {
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
  const exp = crypto.createHmac("sha256", gSecret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(exp, "hex"));
  } catch {
    return false;
  }
}
async function renderResponseData(token, locale, configUrl, mid, grant, ip, expectedSiteKey, _secret) {
  if (!token || token.length < 16 || token.length > 300) return { error: "not_found" };
  if (expectedSiteKey) {
    const tokSiteKey = token.split(":")[0];
    if (tokSiteKey !== expectedSiteKey) return { error: "not_found" };
  }
  const tokTs = parseInt(token.split(":")[1] || "", 10);
  if (!isNaN(tokTs) && Date.now() - tokTs > TOKEN_TTL) return { error: "not_found" };
  if (!verifyRenderGrant(mid, grant, token, ip, expectedSiteKey)) return { error: "not_found" };
  const contentReplaceOn = await fetchContentReplaceFlag(token, configUrl || "http://127.0.0.1:3098", _secret);
  const memHtml = readFromMemory(token);
  if (memHtml) {
    if (contentReplaceOn) {
      const entry = _memoryStore.get(token);
      if (entry && entry.reads > MAX_TOKEN_READS) {
        dropEntry(token);
        return { error: "not_found" };
      }
    }
    return { html: memHtml };
  }
  if (!contentReplaceOn) {
    const siteKey = token.split(":")[0];
    let siteHtml = _siteCache.get(siteKey);
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
async function fetchContentReplaceFlag(token, internalUrl, _secret, retries = 2) {
  try {
    const siteKey = token.split(":")[0];
    if (!siteKey) return false;
    const { flags } = await getConfig(siteKey, internalUrl, _secret);
    return flags?.enableContentReplacementCheck === true;
  } catch {
    if (retries > 0) return fetchContentReplaceFlag(token, internalUrl, _secret, retries - 1);
    return false;
  }
}
function verifyTokenAndRead(token, locale) {
  const parts = token.split(":");
  if (parts.length !== 4 || parts[3].length !== 64) {
    return { error: "not_found" };
  }
  const [siteKey, timestamp, nonce, sig] = parts;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return { error: "not_found" };
  }
  if (Date.now() - ts > TOKEN_TTL) {
    return { error: "not_found" };
  }
  const secret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (secret) {
    const payload = [siteKey, timestamp, nonce].join(":");
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return { error: "not_found" };
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
    return { error: "not_found" };
  }
  return { error: "not_found" };
}
function injectReferrerPolicy(html) {
  const meta = '<meta name="referrer" content="strict-origin-when-cross-origin">';
  if (html.includes("<head>")) return html.replace("<head>", "<head>" + meta);
  if (html.includes("<html")) {
    const m = html.match(/<html[^>]*>/);
    if (m) return html.replace(m[0], m[0] + meta);
  }
  return meta + html;
}
async function handleRender(token, res, configUrl, mid, grant, ip, expectedSiteKey, baseUrl, _secret) {
  const data = await renderResponseData(token, void 0, configUrl, mid, grant, ip, expectedSiteKey, _secret);
  if (data.html && mid) data.html = injectNoticeScript(data.html, mid, expectedSiteKey || token.split(":")[0], baseUrl);
  if (data.html) data.html = injectReferrerPolicy(data.html);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader("Content-Type", "application/json");
  if (res.setHeader) res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (res.setHeader) res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
  if (res.setHeader) res.setHeader("Pragma", "no-cache");
  if (data.html && res.setHeader) {
    const authSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
    if (authSecret) {
      const ts = Math.floor(Date.now() / 1e3);
      const val = ts + ":" + crypto.createHmac("sha256", authSecret).update("sg_authorized:" + ts).digest("hex");
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      res.setHeader("Set-Cookie", "__sg_authorized=" + val + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=120" + secure);
    }
  }
  if (res.send) res.send(json);
  else if (res.end) res.end(json);
}
function injectNoticeScript(html, mid, siteKey, baseUrl) {
  const baseVal = baseUrl || "";
  const inject = NOTICE_SCRIPT.replace("var mid=window.__sg_mid||'';", "var mid=" + JSON.stringify(mid) + "||'';").replace("var sk=window.__sg_siteKey||'';", "var sk=" + JSON.stringify(siteKey) + "||'';").replace("var base=window.__sg_baseUrl||'';", "var base=" + JSON.stringify(baseVal) + "||window.__sg_baseUrl||'';").replace("window.__sg_noticeEnabled", "window.__sg_noticeEnabled");
  if (html.includes("</body>")) return html.replace("</body>", inject + "</body>");
  return html + inject;
}
function signToken(siteKey, timestamp, secretOverride) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!secret) return { token: "" };
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { token: payload + ":" + sig };
}
function configKey(baseUrl, siteKey) {
  return baseUrl + "@" + siteKey;
}
function pruneCache(m) {
  if (m.size <= MAX_TENANTS) return;
  const sorted = [...m.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  for (let i = 0; i < sorted.length - MAX_TENANTS; i++) m.delete(sorted[i][0]);
}
async function refreshConfig(siteKey, baseUrl, entry, secret) {
  try {
    const cb = Date.now();
    const sig = secret ? crypto.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
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
async function fetchWhitelistForSiteKey(siteKey, baseUrl) {
  return (await getConfig(siteKey, baseUrl)).whitelist;
}
async function fetchConfigForSiteKey(siteKey, baseUrl, secret) {
  return (await getConfig(siteKey, baseUrl, secret)).flags;
}
function __clearConfigCache() {
  _configCache.clear();
}
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
    const sig = secret ? crypto.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
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
async function generateSkeleton(siteKey, token, baseUrl, restrictedAccess, whitelist, renderUrl, locale, flags, clockts, signingSecret) {
  await ensureGuardsReady(baseUrl, void 0, siteKey);
  const rurl = renderUrl || "./__shugoi/render";
  const cfg = flags ?? (await getConfig(siteKey, baseUrl, signingSecret)).flags;
  const loc = locale || "en";
  const msgs = MESSAGES[loc];
  const cache = getCacheEntry(baseUrl, siteKey);
  const fragments = [];
  fragments.push("window.__sg_siteKey=" + JSON.stringify(siteKey));
  fragments.push("window.__sg_baseUrl=" + JSON.stringify(baseUrl));
  fragments.push("window.__sg_config=" + JSON.stringify(cfg));
  fragments.push("window.__sg_diagEnabled=" + (process.env.NODE_ENV === "production" ? "false" : "true"));
  fragments.push("try{if((location.search||'').indexOf('sg_proof=')>=0){var _qs=location.search.replace(/[?&]sg_proof=[^&]*/,'');var _cu=location.pathname+(_qs?_qs:'')+location.hash;history.replaceState(null,'',_cu)}}catch(e){}");
  const _powTs = Math.floor(Date.now() / 1e3);
  const _powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || "";
  const _powNonce = typeof crypto.randomBytes === "function" ? crypto.randomBytes(8).toString("hex") : String(Math.floor(Math.random() * 4294967295)).padStart(8, "0") + String(Math.floor(Math.random() * 4294967295)).padStart(8, "0");
  const _powSalt = _powSecret ? crypto.createHmac("sha256", _powSecret).update(_powTs + ":" + _powNonce).digest("hex") : "";
  const _powDiff = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "14");
    return Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
  })();
  fragments.push("window.__sg_pow=" + JSON.stringify({ ts: _powTs, nonce: _powNonce, salt: _powSalt, difficulty: _powDiff }));
  const _ntpDrift = (typeof globalThis !== "undefined" ? globalThis.__sg_ntpDrift : 0) || 0;
  const _ntpTime = globalThis.__sg_ntpTime || Date.now() - _ntpDrift;
  const _clockts = clockts || _ntpTime;
  fragments.push("window.__sg_ntp=" + _ntpTime);
  fragments.push("window.__sg_serverTime=" + _clockts);
  fragments.push("window.__sg_clockts=" + _clockts);
  if (!restrictedAccess) fragments.push("window.__sg_disableRestrictedAccess=true");
  if (cache.detect) fragments.push("try{" + cache.detect + "}catch(e){window.__sg_blocked=true}");
  const jsStr = (s) => JSON.stringify(s).slice(1, -1).replace(/</g, "\\x3c");
  const devtoolsMsg = jsStr(msgs.devtoolsBody);
  const tamperTitle = jsStr(msgs.tamperTitle);
  const fbBadge = jsStr(msgs.blockedBadge);
  const fbTitle = jsStr(msgs.blockedTitle);
  fragments.push('window.__sg_showBlock=function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><style>@font-face{font-family:\\x27Alex Brush\\x27;src:url(https://shugoi.com/alex-brush.woff2?v=2) format(\\x27woff2\\x27);font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\\\\x27Segoe UI\\\\x27,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\\x27Alex Brush\\x27,Georgia,\\\\x27Times New Roman\\\\x27,serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}@media (prefers-color-scheme:dark){html,body{background:#16101c}#c{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}#c .bdg{background:rgba(233,137,159,.16);border-color:rgba(233,137,159,.5);color:#e9899f}#c h2{color:#e9899f}#c p.desc{color:#a795b4}#c p.ft{color:#e9899f}}</style></head><body><div id=c><img src=https://shugoi.com/favicon-block.png class=l><img src=https://shugoi.com/brand-block.png class=b><div class=bdg>"+(badge||"' + fbBadge + '")+"</div><h2>"+(title||"' + fbTitle + '")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
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
function enableDiskStore(multiProcess) {
  _diskEnabled = multiProcess;
  if (multiProcess) startDiskCleanup();
}
var TOKEN_DIR, TOKEN_TTL, MAX_ENTRIES, MAX_TOTAL_BYTES, MAX_TOKEN_READS, _memoryStore, _siteCache, _diskEnabled, _totalBytes, GRANT_TTL_MS, NOTICE_SCRIPT, CONFIG_CACHE_TTL, CONFIG_STALE_MAX, CONFIG_FETCH_TIMEOUT, MAX_TENANTS, _configCache, GUARD_CACHE_TTL, _guardCaches;
var init_render = __esm({
  "src/render.ts"() {
    "use strict";
    init_locales();
    TOKEN_DIR = join(tmpdir(), "shugoi-render-" + (process.getuid?.() ?? "x"));
    TOKEN_TTL = 12e4;
    MAX_ENTRIES = 5e3;
    MAX_TOTAL_BYTES = 64 * 1024 * 1024;
    MAX_TOKEN_READS = 1;
    _memoryStore = /* @__PURE__ */ new Map();
    _siteCache = /* @__PURE__ */ new Map();
    _diskEnabled = false;
    _totalBytes = 0;
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
    GRANT_TTL_MS = 6e4;
    NOTICE_SCRIPT = `
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
  // CRITIQUE anti-freeze : le flag _applying + mo.takeRecords() cassent la boucle MO \u2014
  // nos propres modifications (style/innerHTML re-appliqu\xE9s) ne re-d\xE9clenchent PAS le MO
  // (le navigateur normalise cssText/innerHTML, donc la comparaison \xE9choue toujours et
  // on r\xE9-appliquerait \xE0 l'infini). takeRecords() vide la file des mutations que NOS
  // changements ont g\xE9n\xE9r\xE9e \u2192 une seule passe par alt\xE9ration r\xE9elle, jamais de gel.
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
  // Mobile : bascule desktop/stack\xE9e sur redimensionnement (r\xE9-applique via enforce).
  try{window.addEventListener('resize',function(){var _m=_isMobile();if(_m!==_MOBILE){_MOBILE=_m;enforce();}},{passive:true})}catch(e){}
  function init(){if(document.body)show();else if(document.addEventListener)document.addEventListener('DOMContentLoaded',show);else setTimeout(init,50)}
  fetch(base+'/notice?machineId='+encodeURIComponent(mid)+'&siteKey='+encodeURIComponent(sk),{signal:AbortSignal.timeout(4000)}).then(function(r){return r.json()}).then(function(d){if(!d.acknowledged)init()}).catch(function(){init()});
})();
</script>`;
    CONFIG_CACHE_TTL = 3e4;
    CONFIG_STALE_MAX = 6e5;
    CONFIG_FETCH_TIMEOUT = 2e3;
    MAX_TENANTS = 500;
    _configCache = /* @__PURE__ */ new Map();
    GUARD_CACHE_TTL = 3e5;
    _guardCaches = /* @__PURE__ */ new Map();
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
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...api, "blob:"],
    "worker-src": ["'self'", "blob:", ...api],
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
function mergeCsp(existing, added) {
  if (!existing) return added;
  const parse = (s) => {
    const m = /* @__PURE__ */ new Map();
    for (const part of s.split(";")) {
      const [name, ...vals] = part.trim().split(/\s+/);
      if (!name) continue;
      const set = m.get(name) ?? /* @__PURE__ */ new Set();
      vals.forEach((v) => set.add(v));
      m.set(name, set);
    }
    return m;
  };
  const base = parse(existing);
  for (const [k, v] of parse(added)) {
    const set = base.get(k) ?? /* @__PURE__ */ new Set();
    v.forEach((x) => set.add(x));
    base.set(k, set);
  }
  for (const [, set] of base) {
    if (set.has("'none'") && set.size > 1) {
      set.clear();
      set.add("'none'");
    }
  }
  return [...base.entries()].map(([k, v]) => `${k} ${[...v].join(" ")}`).join("; ");
}

// src/core.ts
init_render();
init_locales();

// src/verify-bot.ts
import { promises as dns } from "dns";
var BOT_DOMAINS = [
  { pattern: /Googlebot|Google-InspectionTool|Storebot-Google/i, suffixes: [".googlebot.com", ".google.com"] },
  { pattern: /Bingbot|adidxbot|BingPreview/i, suffixes: [".search.msn.com"] },
  { pattern: /Slurp/i, suffixes: [".crawl.yahoo.net"] },
  { pattern: /DuckDuckBot/i, suffixes: [".duckduckgo.com"] },
  { pattern: /YandexBot/i, suffixes: [".yandex.ru", ".yandex.net", ".yandex.com"] },
  { pattern: /Applebot/i, suffixes: [".applebot.apple.com"] }
];
var VERIFY_TTL = 36e5;
var MAX_ENTRIES2 = 5e3;
var _cache = /* @__PURE__ */ new Map();
async function verifyBotIp(ua, ip) {
  const entry = BOT_DOMAINS.find((b) => b.pattern.test(ua));
  if (!entry) return null;
  if (!ip || ip === "unknown") return false;
  const key = ip + "|" + entry.suffixes[0];
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < VERIFY_TTL) return hit.ok;
  let ok = false;
  try {
    const names = await dns.reverse(ip);
    const name = names.find((n) => entry.suffixes.some((s) => n.toLowerCase().endsWith(s)));
    if (name) {
      const forward = await dns.resolve(name).catch(() => []);
      const forward6 = await dns.resolve6(name).catch(() => []);
      ok = forward.includes(ip) || forward6.includes(ip);
    }
  } catch {
    ok = false;
  }
  if (_cache.size >= MAX_ENTRIES2) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) _cache.delete(oldest[0]);
  }
  _cache.set(key, { ok, at: Date.now() });
  return ok;
}

// src/core.ts
import crypto2 from "crypto";
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
  "|  - web: https://shugoi.com -                |",
  "+---------------------------------------------+"
].join("\n") + "\n";
var DEFAULT_BOT_WHITELIST = [
  /Googlebot/i,
  /Bingbot/i,
  /Slurp/i,
  /DuckDuckBot/i,
  /YandexBot/i,
  /Applebot/i,
  /facebookexternalhit/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /Discordbot/i,
  /Slackbot/i,
  /WhatsApp/i,
  /TelegramBot/i
];
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function shieldPage(title, msg, badge, host, remainSecs, locale) {
  const msgs = MESSAGES[locale];
  const prefix = msg ? msg.replace(/Il reste \d+ seconde?s?.*$/, "").replace(/Retry in \d+s?.*$/, "").trim() : "";
  const countdownScript = remainSecs > 0 ? "<script>var s=" + remainSecs + ';var i=setInterval(function(){s--;var e=document.getElementById("cd");if(e){if(s<=0){e.innerHTML="0s";clearInterval(i);setTimeout(function(){location.reload()},500)}else{e.innerHTML=s+"s"}}},1000)</script>' : "";
  const desc = remainSecs > 0 ? prefix + " " + msgs.retryInSeconds(remainSecs) : msg || "";
  const htmlTitle = escapeHtml(title || msgs.blockedTitle);
  const htmlBadge = escapeHtml(badge || msgs.blockedBadge);
  const htmlHost = escapeHtml((host || "shugoi.com").slice(0, 120));
  const htmlDesc = escapeHtml(desc);
  const htmlLang = locale === "fr" ? "fr" : "en";
  return '<!DOCTYPE html><html lang="' + htmlLang + `"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:'Alex Brush';src:url(https://shugoi.com/alex-brush.woff2?v=2) format('woff2');font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:'Alex Brush',Georgia,"Times New Roman",serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon.png alt class=l><img src=https://shugoi.com/brand.png alt class=b><div class=bdg>` + htmlBadge + "</div><h2>" + htmlTitle + "</h2><p class=desc>" + htmlDesc + "</p><p class=ft>" + htmlHost + " \xB7 Shugoi</p></div>" + countdownScript + "</body></html>";
}
function createCore(options) {
  const allowlist = options.allowlist ?? ["/api", "/legal"];
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST;
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const debug = options.debug ?? false;
  const siteSecret = options.signingSecret || options.secret;
  const blockStatus = options.blockStatus ?? 403;
  const blockPage = options.blockPage ?? null;
  const cspEnabled = options.csp ?? true;
  const verifyBots = options.verifyBots !== false;
  let _validationValid = false;
  let _validationFailed = false;
  let _validationFailedReason = "";
  let _validationWarnedAt = 0;
  const VALIDATION_WARN_INTERVAL = 36e5;
  const csp = buildCsp({ siteKey: options.siteKey, extraDirectives: options.extraDirectives || {}, splitRender: options.splitRender ?? true, apiOrigin: originOf(baseUrl) ?? void 0 });
  function log(...args) {
    if (debug) console.log("[shugoi]", ...args);
  }
  const POW_DIFF = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "14");
    return Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
  })();
  const POW_OK_TTL_MS = 30 * 24 * 3600 * 1e3;
  const powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || "";
  const POW_TTL_MS = 6e4;
  const CHALLENGE_LIMIT = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_LIMIT || "60");
    return Number.isInteger(raw) && raw > 0 ? raw : 60;
  })();
  const CHALLENGE_WINDOW_MS = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_WINDOW || "60");
    return Number.isInteger(raw) && raw > 0 ? raw * 1e3 : 6e4;
  })();
  const CHALLENGE_MAX_BLOCK_MS = 15 * 60 * 1e3;
  const _challengeLimits = /* @__PURE__ */ new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of _challengeLimits) {
      if (now > e.blockedUntil && now - e.windowStart > CHALLENGE_WINDOW_MS * 2) _challengeLimits.delete(k);
    }
  }, CHALLENGE_WINDOW_MS).unref();
  function allowChallenge(ip) {
    if (!ip || ip === "unknown") return true;
    const now = Date.now();
    let e = _challengeLimits.get(ip);
    if (!e || now - e.windowStart >= CHALLENGE_WINDOW_MS) {
      _challengeLimits.set(ip, { count: 1, windowStart: now, blockedUntil: 0 });
      return true;
    }
    e.count++;
    if (e.blockedUntil > now) return false;
    if (e.count > CHALLENGE_LIMIT) {
      const backoffMs = Math.min(6e4 * Math.pow(2, Math.min(e.count - CHALLENGE_LIMIT, 10)), CHALLENGE_MAX_BLOCK_MS);
      e.blockedUntil = now + backoffMs;
      e.count = 0;
      return false;
    }
    return true;
  }
  const _usedProofs = /* @__PURE__ */ new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of _usedProofs) {
      if (now - t > POW_TTL_MS) _usedProofs.delete(k);
    }
  }, POW_TTL_MS).unref();
  function consumeProof(proof) {
    if (_usedProofs.has(proof)) return false;
    _usedProofs.set(proof, Date.now());
    return true;
  }
  function safeChallengePath(p) {
    if (!p) return "/";
    if (p.charAt(0) !== "/" || p.charAt(1) === "/" || p.indexOf("\\") >= 0) return "/";
    for (let i = 0; i < p.length; i++) {
      const c = p.charCodeAt(i);
      if (c < 32 || c === 127) return "/";
    }
    return p;
  }
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    return crypto2.timingSafeEqual(ba, bb);
  }
  function sgNonce() {
    return crypto2.randomBytes(8).toString("hex");
  }
  function ipBucket(ip) {
    if (!ip || ip === "unknown") return "0";
    if (ip.includes(".")) {
      const m = ip.match(/^(\d+\.\d+\.\d+)(?:\.\d+)?$/);
      if (m) return m[1];
      return "0";
    }
    if (ip.includes(":")) {
      const segs = ip.split(":").filter(Boolean);
      return segs.slice(0, 4).join(".") || "0";
    }
    return "0";
  }
  function uaFp(ua) {
    return crypto2.createHash("sha256").update(ua || "").digest("hex").slice(0, 16);
  }
  function isPowValid(proof) {
    if (!proof || !powSecret) return false;
    const parts = proof.split(":");
    if (parts.length !== 3) return false;
    const [tsStr, nonce, sol] = parts;
    if (!tsStr || !nonce || !sol) return false;
    if (!/^[0-9a-f]{16}$/.test(nonce)) return false;
    const ts = parseInt(tsStr, 10);
    if (isNaN(ts) || Math.abs(Date.now() - ts * 1e3) > POW_TTL_MS) return false;
    const salt = crypto2.createHmac("sha256", powSecret).update(tsStr + ":" + nonce).digest("hex");
    const digest = crypto2.createHash("sha256").update(salt + ":" + sol).digest("hex");
    let leading = 0;
    for (let i = 0; i < digest.length; i++) {
      const nib = parseInt(digest[i], 16);
      if (nib === 0) {
        leading += 4;
        continue;
      }
      leading += nib & 8 ? 0 : nib & 4 ? 1 : nib & 2 ? 2 : 3;
      break;
    }
    return leading >= POW_DIFF;
  }
  function sgOkCookieValue(ip, ua) {
    const ts = Math.floor(Date.now() / 1e3);
    const bucket = ipBucket(ip);
    const fp = uaFp(ua);
    const sig = crypto2.createHmac("sha256", powSecret).update("sg_ok:" + ts + ":" + bucket + ":" + fp).digest("hex");
    return ts + ":" + bucket + ":" + fp + ":" + sig;
  }
  function isSgOkValid(cookieVal, ip, ua) {
    if (!powSecret) return false;
    const parts = cookieVal.split(":");
    if (parts.length !== 4) return false;
    const [tsStr, bucket, fp, sig] = parts;
    if (!tsStr || !bucket || !fp || !sig) return false;
    const ts = parseInt(tsStr, 10);
    if (isNaN(ts) || Date.now() - ts * 1e3 > POW_OK_TTL_MS || ts * 1e3 > Date.now() + 6e4) return false;
    if (bucket !== ipBucket(ip) || fp !== uaFp(ua)) return false;
    const expected = crypto2.createHmac("sha256", powSecret).update("sg_ok:" + tsStr + ":" + bucket + ":" + fp).digest("hex");
    return safeEqual(sig, expected);
  }
  const SG_AUTHORIZED_TTL_MS = 12e4;
  function isSgAuthorizedValid(cookieVal) {
    if (!powSecret) return false;
    const sep = cookieVal.indexOf(":");
    if (sep <= 0) return false;
    const tsStr = cookieVal.slice(0, sep);
    const sig = cookieVal.slice(sep + 1);
    const ts = parseInt(tsStr, 10);
    if (isNaN(ts) || Date.now() - ts * 1e3 > SG_AUTHORIZED_TTL_MS || ts * 1e3 > Date.now() + 6e4) return false;
    const expected = crypto2.createHmac("sha256", powSecret).update("sg_authorized:" + tsStr).digest("hex");
    return safeEqual(sig, expected);
  }
  const validationPromise = (async () => {
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
            if (debug) console.log("[shugoi] key validation OK");
          } else {
            _validationFailed = true;
            _validationFailedReason = String(data.reason || "invalid");
          }
        } else {
          _validationFailed = true;
          _validationFailedReason = "HTTP " + res.status;
        }
      } catch (e) {
        _validationFailed = true;
        _validationFailedReason = "r\xE9seau: " + (e instanceof Error ? e.message : String(e));
      }
    } else if (debug) {
      console.log("[shugoi] no secret provided, skipping key validation");
    }
  })();
  ensureGuardsReady(baseUrl, siteSecret, options.siteKey).catch(() => {
  });
  async function ensureValidated() {
    if (!siteSecret) return;
    if (_validationValid || _validationFailed) return;
    await Promise.race([
      validationPromise,
      new Promise((r) => setTimeout(r, 500))
    ]);
  }
  function isAllowlisted(path) {
    return allowlist.some((p) => path === p || path.startsWith(p + "/"));
  }
  function isWhitelistedBot(ua) {
    return botWhitelist.some((p) => p.test(ua));
  }
  async function isTrustedBot(ua, ip) {
    if (!isWhitelistedBot(ua)) return false;
    if (!verifyBots) return true;
    const verified = await verifyBotIp(ua, ip);
    if (verified === null) return false;
    return verified;
  }
  async function evaluate(ctx) {
    await ensureValidated();
    if (siteSecret && _validationFailed && Date.now() - _validationWarnedAt > VALIDATION_WARN_INTERVAL) {
      _validationWarnedAt = Date.now();
      console.warn(
        "[shugoi] La validation de la cl\xE9 a \xE9chou\xE9 (" + (_validationFailedReason || "raison inconnue") + ").\n[shugoi] La protection reste active, mais cette installation n'est pas authentifi\xE9e.\n[shugoi] V\xE9rifiez `siteKey` et `secret` : https://shugoi.com/docs#validation"
      );
      fetch(baseUrl + "/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey: options.siteKey, reason: "validation_failed" }),
        signal: AbortSignal.timeout(2e3)
      }).catch(() => {
      });
    }
    if (/\/assets\/[^?#]+\.(js|css)(\?|$)/.test(ctx.path)) {
      const authOk = !!ctx.sgAuthorized && isSgAuthorizedValid(ctx.sgAuthorized);
      if (!authOk) {
        log("asset prot\xE9g\xE9 refus\xE9:", ctx.path.slice(0, 60));
        return { block: true, status: 403, contentType: "text/plain", body: BLOCK_PAGE, headers: {} };
      }
    }
    if (isAllowlisted(ctx.path)) return null;
    if (ctx.path === "/__sg_challenge") {
      if (!allowChallenge(ctx.ip)) {
        const loc = resolveLocale(void 0, ctx.acceptLanguage);
        const lmsgs = MESSAGES[loc];
        return { block: true, status: 429, contentType: "text/html", body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody("1 min"), lmsgs.rateLimitBadge, ctx.host || "", 60, loc) };
      }
      const js = `(function(){
var P=new URLSearchParams(location.search);
var salt=P.get('salt')||'', ts=P.get('ts')||'', nonce=P.get('nonce')||'', diff=parseInt(P.get('diff')||'14',10), path=P.get('path')||'/';
// Open redirect (audit #5) : un //evil.com (protocole-relatif) ou un backslash
// d\xE9tourneraient le location.replace ci-dessous vers un domaine externe. On n'accepte
// qu'un chemin relatif commen\xE7ant par UN SEUL '/', sans backslash ni contr\xF4le.
if(path.charAt(0)!=='/'||path.charAt(1)==='/'||path.indexOf('\\\\')>=0)path='/';
var enc=new TextEncoder();
// Audit 2026-08-03 : comptage de bits CORRIG\xC9 (z\xE9ros internes du premier nibble
// non-nul compt\xE9s) \u2014 DOIT rester synchrone avec isPowValid serveur + guard + whitelist.
function bits(d){var l=0;for(var i=0;i<d.length;i++){var b=parseInt(d[i],16);if(b===0){l+=4;continue}l+=(b&8)?0:(b&4)?1:(b&2)?2:3;break}return l}
var n=0;
function step(){
  crypto.subtle.digest('SHA-256',enc.encode(salt+':'+n.toString(16))).then(function(buf){
    var h=Array.from(new Uint8Array(buf)).map(function(v){return v.toString(16).padStart(2,'0')}).join('');
    if(bits(h)>=diff){var base=path;var q=(base.indexOf('?')>=0?'&':'?')+'sg_proof='+ts+':'+nonce+':'+n.toString(16);location.replace(base+q)}
    else{n++;if(n<300000)step()}
  }).catch(function(){location.reload()});
}
step();
})();`;
      const html = "<!--\n" + BLOCK_PAGE + "-->\n<script>" + js + "</script>";
      return { block: true, status: 200, contentType: "text/html", body: html };
    }
    const isPage = !ctx.path.includes("/__shugoi/") && !ctx.path.startsWith("/api/");
    if (isPage && powSecret && ctx.ua) {
      if (/Mozilla/i.test(ctx.ua) && !await isTrustedBot(ctx.ua, ctx.ip)) {
        const sfd = ctx.secFetchDest ?? "";
        const sfm = ctx.secFetchMode ?? "";
        const al = ctx.acceptLanguage ?? "";
        if (!al && !sfd && !sfm) {
          log("fake browser (Accept-Language + Sec-Fetch absents) \u2192 403 block page:", ctx.ua.slice(0, 40));
          const bloc = resolveLocale(void 0, ctx.acceptLanguage);
          const lmsgs = MESSAGES[bloc];
          return { block: true, status: 403, contentType: "text/html", body: shieldPage(lmsgs.fakeBrowserTitle, lmsgs.fakeBrowserBody, lmsgs.fakeBrowserBadge, ctx.host || "", 0, bloc) };
        }
      }
      const proof = ctx.sgProof || "";
      const validProof = !!proof && isPowValid(proof);
      const validCookie = !!ctx.sgOk && isSgOkValid(ctx.sgOk, ctx.ip, ctx.ua);
      const proofFresh = validProof ? consumeProof(proof) : false;
      const canProceed = validCookie || proofFresh;
      if (!canProceed && !isWhitelistedBot(ctx.ua)) {
        if (!allowChallenge(ctx.ip)) {
          const loc = resolveLocale(void 0, ctx.acceptLanguage);
          const lmsgs = MESSAGES[loc];
          log("challenge rate-limited:", ctx.ip.slice(0, 24), ctx.ua.slice(0, 40));
          return { block: true, status: 429, contentType: "text/html", body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody("1 min"), lmsgs.rateLimitBadge, ctx.host || "", 60, loc) };
        }
        const tsNow = Math.floor(Date.now() / 1e3);
        const nonce = sgNonce();
        const salt = crypto2.createHmac("sha256", powSecret).update(tsNow + ":" + nonce).digest("hex");
        const prefix = ctx.forwardedPrefix && ctx.forwardedPrefix !== "/" ? ctx.forwardedPrefix.replace(/\/$/, "") : "";
        const path = safeChallengePath(ctx.path.startsWith("/") ? ctx.path : "/" + ctx.path);
        const chalUrl = prefix + "/__sg_challenge?ts=" + tsNow + "&salt=" + salt + "&nonce=" + nonce + "&diff=" + POW_DIFF + "&path=" + encodeURIComponent(prefix + path);
        log("pow challenge (307):", ctx.ua.slice(0, 40));
        return { block: true, status: 307, contentType: "text/plain", body: BLOCK_PAGE, headers: { Location: chalUrl } };
      }
    }
    const flags = await fetchConfigForSiteKey(options.siteKey, baseUrl, options.signingSecret || options.secret);
    const headlessEnabled = flags.enableHeadlessCheck !== false;
    if (flags.enableRateLimit === true) {
      try {
        const rlRes = await fetch(baseUrl + "/rate-limit-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteKey: options.siteKey,
            scope: "edge_ip",
            ip: ctx.ip,
            metadata: { ip: ctx.ip, userAgent: ctx.ua || "", middleware: true }
          }),
          signal: AbortSignal.timeout(2e3)
        });
        if (rlRes.ok) {
          const rlData = await rlRes.json();
          if (rlData.allowed === false) {
            const remain = Math.max(0, Math.ceil((rlData.resetAt - Date.now()) / 1e3));
            const mins = Math.floor(remain / 60);
            const secs = remain % 60;
            const timeStr = mins > 0 ? mins + " min" + (mins > 1 ? "s" : "") + (secs > 0 ? " " + secs + " s" : "") : secs + " seconde" + (secs > 1 ? "s" : "");
            const loc = options.locale ?? resolveLocale(void 0, ctx.acceptLanguage);
            const msgs = MESSAGES[loc];
            if (blockPage) {
              return { block: true, status: 429, contentType: "text/html", body: blockPage({ reason: "rate_limit", title: msgs.rateLimitTitle, message: msgs.rateLimitBody(timeStr), badge: msgs.rateLimitBadge, host: ctx.host || "", remainingSeconds: remain, locale: loc }) };
            }
            return { block: true, status: 429, contentType: "text/html", body: shieldPage(msgs.rateLimitTitle, msgs.rateLimitBody(timeStr), msgs.rateLimitBadge, ctx.host || "", remain, loc) };
          }
        }
      } catch {
      }
    }
    if (headlessEnabled && ctx.ua && !await isTrustedBot(ctx.ua, ctx.ip) && headlessPatterns.some((p) => p.test(ctx.ua))) {
      log("headless block:", ctx.ua.slice(0, 40));
      fetch(baseUrl + "/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey: options.siteKey, reason: "headless" }), signal: AbortSignal.timeout(2e3) }).catch(() => {
      });
      return { block: true, status: blockStatus, contentType: "text/plain", body: BLOCK_PAGE };
    }
    return null;
  }
  return {
    csp,
    cspEnabled,
    ensureValidated,
    isAllowlisted,
    isWhitelistedBot,
    isTrustedBot,
    evaluate,
    log,
    isProofValid: isPowValid,
    sgOkCookie(proof, ip, ua) {
      if (!proof || !isPowValid(proof)) return null;
      return "__sg_ok=" + sgOkCookieValue(ip, ua) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + Math.floor(POW_OK_TTL_MS / 1e3) + (process.env.NODE_ENV === "production" ? "; Secure" : "");
    }
  };
}

// src/middleware.ts
init_locales();
function createShugoiMiddleware(options) {
  const core = createCore(options);
  const autoInject = options.autoInject ?? true;
  const splitRender = options.splitRender ?? true;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const internalUrl = options.internalUrl || baseUrl;
  if (options.multiProcess) enableDiskStore(true);
  return async function shugoiMiddleware(req, res, next) {
    try {
      const path = (req.path ?? req.url ?? "/").split("?")[0];
      if (path.endsWith("/__shugoi/render")) {
        const m = String(req.method || "GET").toUpperCase();
        if (m !== "GET" && m !== "HEAD") {
          if (res.status) res.status(405);
          if (res.type) res.type("application/json");
          const body = JSON.stringify({ error: "method_not_allowed" });
          if (res.send) res.send(body);
          else if (res.end) res.end(body);
          return;
        }
        const { handleRender: handleRender2 } = await Promise.resolve().then(() => (init_render(), render_exports));
        const q = req.query && req.query || {};
        const ip2 = (typeof req.headers?.["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0]?.trim() : void 0) || (typeof req.ip === "string" ? req.ip : "unknown");
        return handleRender2(q.token || "", res, internalUrl, q.mid || "", q.grant || "", ip2, options.siteKey, baseUrl, signingSecret);
      }
      if (path === "/__sg_challenge") {
        const m = String(req.method || "GET").toUpperCase();
        if (m !== "GET" && m !== "HEAD") {
          if (res.status) res.status(405);
          if (res.type) res.type("application/json");
          const body = JSON.stringify({ error: "method_not_allowed" });
          if (res.send) res.send(body);
          else if (res.end) res.end(body);
          return;
        }
      }
      if (core.cspEnabled && res.setHeader) {
        if (res.getHeader) {
          const existing = res.getHeader("Content-Security-Policy");
          res.setHeader("Content-Security-Policy", mergeCsp(
            typeof existing === "string" ? existing : void 0,
            core.csp
          ));
        } else {
          res.setHeader("Content-Security-Policy", core.csp);
        }
      }
      const ua = (typeof req.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : "") || "";
      const ip = (typeof req.headers?.["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0]?.trim() : void 0) || (typeof req.ip === "string" ? req.ip : "unknown");
      const reqLocale = resolveLocale(options.locale, typeof req.headers?.["accept-language"] === "string" ? req.headers?.["accept-language"] : void 0);
      if (autoInject && options.siteKey) {
        try {
          const { skipPaths } = await getConfig(options.siteKey, internalUrl, signingSecret);
          if (skipPaths?.some((p) => path === p)) {
            try {
              const { renderPage } = await import("../../../server/lib/ssr.js");
              const html = await renderPage(path);
              if (res.setHeader) res.setHeader("Content-Type", "text/html; charset=utf-8");
              if (res.send) res.send(html);
              else if (res.end) res.end(html);
              return;
            } catch (ssrErr) {
              return next();
            }
          }
        } catch {
        }
      }
      const decision = await core.evaluate({
        path,
        ua,
        ip,
        host: typeof req.headers?.["host"] === "string" ? req.headers.host : void 0,
        acceptLanguage: typeof req.headers?.["accept-language"] === "string" ? req.headers["accept-language"] : void 0,
        secFetchDest: typeof req.headers?.["sec-fetch-dest"] === "string" ? req.headers["sec-fetch-dest"] : void 0,
        secFetchMode: typeof req.headers?.["sec-fetch-mode"] === "string" ? req.headers["sec-fetch-mode"] : void 0,
        sgProof: req.query && typeof req.query.sg_proof === "string" ? req.query.sg_proof : void 0,
        sgOk: typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] : void 0,
        sgAuthorized: typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_authorized=([^;]+)/)?.[1] : void 0,
        forwardedPrefix: typeof req.headers?.["x-forwarded-prefix"] === "string" ? req.headers["x-forwarded-prefix"] : void 0
      });
      if (decision) {
        if (decision.headers) {
          for (const [k, v] of Object.entries(decision.headers)) {
            if (res.setHeader) res.setHeader(k, v);
          }
        }
        if (res.status) res.status(decision.status);
        if (decision.headers && decision.headers["Content-Type"]) {
          if (res.setHeader) res.setHeader("Content-Type", decision.headers["Content-Type"]);
        } else if (res.type) {
          res.type(decision.contentType.split("/")[1]);
        }
        if (decision.body) {
          if (res.send) res.send(decision.body);
          else if (res.end) res.end(decision.body);
        } else if (res.end) {
          res.end();
        }
        return;
      }
      const sgProofQ = req.query && typeof req.query.sg_proof === "string" ? req.query.sg_proof : void 0;
      if (sgProofQ && res.setHeader) {
        const okCookie = core.sgOkCookie(sgProofQ, ip, ua);
        if (okCookie) res.setHeader("Set-Cookie", okCookie);
      }
      const isBot = await core.isTrustedBot(ua, ip) || core.isWhitelistedBot(ua);
      if (autoInject && splitRender && !isBot && !core.isAllowlisted(path)) {
        let injected = false;
        const originalSend = res.send?.bind(res);
        const originalEnd = res.end?.bind(res);
        const doInject = async (body) => {
          if (injected) return body;
          if (typeof body === "string") {
            const ct = res.getHeader ? res.getHeader("content-type") : void 0;
            if (!ct || String(ct).includes("text/html")) {
              try {
                body = await injectGuardScripts(body, options.siteKey, baseUrl, void 0, restrictedAccess, signingSecret, req, void 0, reqLocale);
              } catch (e) {
                core.log("inject error:", e);
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
          res.end = function(chunk, encoding, cb) {
            doInject(chunk).then((b) => {
              if (cb) originalEnd(b, encoding, cb);
              else originalEnd(b, encoding);
            });
            return this;
          };
        }
      }
      next();
    } catch (err) {
      core.log("Unhandled error:", err);
      next();
    }
  };
}
function createShugoiPlugin(options) {
  const core = createCore(options);
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  if (options.multiProcess) enableDiskStore(true);
  return async function shugoiPlugin(fastify) {
    fastify.addHook("onRequest", async (request, reply) => {
      if (core.cspEnabled && reply.getHeader) {
        const existing = reply.getHeader("Content-Security-Policy");
        reply.header("Content-Security-Policy", mergeCsp(
          typeof existing === "string" ? existing : void 0,
          core.csp
        ));
      } else if (core.cspEnabled) {
        reply.header("Content-Security-Policy", core.csp);
      }
    });
    fastify.get("/__shugoi/render", async (request, reply) => {
      const { renderResponseData: renderResponseData3, injectReferrerPolicy: injectReferrerPolicy2 } = await Promise.resolve().then(() => (init_render(), render_exports));
      const ip = (typeof request.headers?.["x-forwarded-for"] === "string" ? request.headers["x-forwarded-for"].split(",")[0]?.trim() : void 0) || (typeof request.ip === "string" ? request.ip : "unknown");
      const data = await renderResponseData3(request.query.token || "", void 0, options.baseUrl, request.query.mid || "", request.query.grant || "", ip, options.siteKey);
      if (data.html) data.html = injectReferrerPolicy2(data.html);
      reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
      reply.header("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
      reply.header("Pragma", "no-cache");
      reply.send(data);
    });
    fastify.head("/__shugoi/healthcheck", async (request, reply) => reply.send(""));
    fastify.addHook("preHandler", async (request, reply) => {
      try {
        const path = request.url.split("?")[0];
        if (path.endsWith("/__shugoi/render") || path.endsWith("/__shugoi/healthcheck")) return;
        if (core.isAllowlisted(path)) return;
        const ua = request.headers["user-agent"] ?? "";
        const ip = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.ip || "unknown";
        const decision = await core.evaluate({
          path,
          ua,
          ip,
          host: request.headers?.host,
          acceptLanguage: request.headers["accept-language"],
          secFetchDest: request.headers["sec-fetch-dest"],
          secFetchMode: request.headers["sec-fetch-mode"],
          sgProof: request.query && typeof request.query?.sg_proof === "string" ? request.query.sg_proof : void 0,
          sgOk: typeof request.headers.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] : void 0,
          sgAuthorized: typeof request.headers.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_authorized=([^;]+)/)?.[1] : void 0,
          forwardedPrefix: typeof request.headers["x-forwarded-prefix"] === "string" ? request.headers["x-forwarded-prefix"] : void 0
        });
        if (decision) {
          if (decision.headers) {
            for (const [k, v] of Object.entries(decision.headers)) reply.header(k, v);
          }
          reply.code(decision.status).type(decision.contentType === "text/html" ? "text/html" : "text/plain").send(decision.body);
          return;
        }
        if (typeof request.query?.sg_proof === "string") {
          const okCookie = core.sgOkCookie(request.query.sg_proof, ip, ua);
          if (okCookie) reply.header("Set-Cookie", okCookie);
        }
      } catch (err) {
        core.log("preHandler error:", err);
      }
    });
    fastify.addHook("onSend", async (request, reply, payload) => {
      if (typeof payload !== "string") return payload;
      const path = request.url.split("?")[0];
      if (path.endsWith("/__shugoi/render") || path.endsWith("/__shugoi/healthcheck")) return payload;
      if (reply.statusCode !== 200) return payload;
      const ua = typeof request.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : "";
      if (core.isWhitelistedBot(ua)) return payload;
      const ct = reply.getHeader("content-type");
      if (!ct || String(ct).includes("text/html")) {
        const pluginLocale = resolveLocale(options.locale, typeof request.headers?.["accept-language"] === "string" ? request.headers?.["accept-language"] : void 0);
        return await injectGuardScripts(payload, options.siteKey, baseUrl, void 0, restrictedAccess, signingSecret, { url: path }, void 0, pluginLocale);
      }
      return payload;
    });
  };
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
async function scriptTags(options) {
  const base = options.baseUrl ?? "https://shugoi.com/api/v1";
  const key = options.siteKey;
  const ts = Date.now();
  const signed = signToken(key, ts, options.signingSecret);
  const skel = await generateSkeleton(key, signed.token, base, options.restrictedAccess ?? false, options.whitelist, void 0, void 0, void 0, void 0, options.signingSecret);
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
  __clearConfigCache,
  buildCsp,
  checkLicense,
  createShugoiMiddleware,
  createShugoiPlugin,
  fetchWhitelistForSiteKey,
  generateSkeleton,
  handleRender,
  injectGuardScripts,
  mergeCsp,
  renderResponseData,
  scriptTags,
  signToken,
  storeHtml,
  validateSiteKey,
  verifyRenderGrant
};
//# sourceMappingURL=index.js.map