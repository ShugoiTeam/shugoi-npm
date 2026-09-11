"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
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

// src/availability.ts
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
function canServeDegradedPath(path, options, state) {
  return options.mode === "public-last-known" && (state === "degraded" || state === "expired") && (options.allowPaths ?? []).includes(path);
}
var import_node_crypto, DEFAULT_MAX_STALE_MS;
var init_availability = __esm({
  "src/availability.ts"() {
    "use strict";
    import_node_crypto = __toESM(require("crypto"), 1);
    DEFAULT_MAX_STALE_MS = 5 * 6e4;
  }
});

// src/security-utils.ts
function safeChallengePath(path) {
  if (!path) return "/";
  if (path.charAt(0) !== "/" || path.charAt(1) === "/" || path.includes("\\")) return "/";
  for (const character of path) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return "/";
  }
  return path;
}
function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  return import_node_crypto2.default.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
function ipBucket(ip) {
  if (!ip || ip === "unknown") return "0";
  if (ip.includes(".")) {
    const match = ip.match(/^(\d+\.\d+\.\d+)(?:\.\d+)?$/);
    return match?.[1] ?? "0";
  }
  if (ip.includes(":")) return ip.split(":").filter(Boolean).slice(0, 4).join(".") || "0";
  return "0";
}
function uaFingerprint(userAgent) {
  return import_node_crypto2.default.createHash("sha256").update(userAgent).digest("hex").slice(0, 16);
}
var import_node_crypto2;
var init_security_utils = __esm({
  "src/security-utils.ts"() {
    "use strict";
    import_node_crypto2 = __toESM(require("crypto"), 1);
  }
});

// src/cookie-security.ts
function createOkCookieValue(ip, userAgent, options) {
  const timestamp = Math.floor(Date.now() / 1e3);
  const bucket = ipBucket(ip);
  const fingerprint = uaFingerprint(userAgent);
  const signature = import_node_crypto3.default.createHmac("sha256", options.secret).update(`sg_ok:${timestamp}:${bucket}:${fingerprint}`).digest("hex");
  return `${timestamp}:${bucket}:${fingerprint}:${signature}`;
}
function isOkCookieValid(value, ip, userAgent, options) {
  if (!options.secret) return false;
  const [timestamp, bucket, fingerprint, signature] = value.split(":");
  if (!timestamp || !bucket || !fingerprint || !signature) return false;
  const parsedTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsedTimestamp) || Date.now() - parsedTimestamp * 1e3 > options.okTtlMs || parsedTimestamp * 1e3 > Date.now() + 6e4) return false;
  if (bucket !== ipBucket(ip) || fingerprint !== uaFingerprint(userAgent)) return false;
  const expected = import_node_crypto3.default.createHmac("sha256", options.secret).update(`sg_ok:${timestamp}:${bucket}:${fingerprint}`).digest("hex");
  return safeEqual(signature, expected);
}
function isAuthorizedCookieValid(value, options) {
  if (!options.secret) return false;
  const separator = value.indexOf(":");
  if (separator <= 0) return false;
  const timestamp = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const parsedTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsedTimestamp) || Date.now() - parsedTimestamp * 1e3 > options.authorizedTtlMs || parsedTimestamp * 1e3 > Date.now() + 6e4) return false;
  const expected = import_node_crypto3.default.createHmac("sha256", options.secret).update(`sg_authorized:${timestamp}`).digest("hex");
  return safeEqual(signature, expected);
}
function createMidAnchorValue(ip, userAgent, mid, options) {
  const timestamp = Math.floor(Date.now() / 1e3);
  const bucket = ipBucket(ip);
  const fingerprint = uaFingerprint(userAgent);
  const signature = import_node_crypto3.default.createHmac("sha256", options.secret).update(`sg_mid_anchor:${timestamp}:${bucket}:${fingerprint}:${mid}`).digest("hex");
  return `${timestamp}:${bucket}:${fingerprint}:${mid}:${signature}`;
}
function isMidAnchorValid(value, ip, userAgent, mid, options) {
  if (!options.secret) return false;
  const [timestamp, bucket, fingerprint, valueMid, signature] = value.split(":");
  if (!timestamp || !bucket || !fingerprint || !valueMid || !signature) return false;
  const parsedTimestamp = Number.parseInt(timestamp, 10);
  const ttlMs = options.anchorTtlMs ?? ANCHOR_TTL_MS_DEFAULT;
  if (!Number.isFinite(parsedTimestamp) || Date.now() - parsedTimestamp * 1e3 > ttlMs || parsedTimestamp * 1e3 > Date.now() + 6e4) return false;
  if (bucket !== ipBucket(ip) || fingerprint !== uaFingerprint(userAgent)) return false;
  if (valueMid !== mid) return false;
  const expected = import_node_crypto3.default.createHmac("sha256", options.secret).update(`sg_mid_anchor:${timestamp}:${bucket}:${fingerprint}:${valueMid}`).digest("hex");
  return safeEqual(signature, expected);
}
var import_node_crypto3, ANCHOR_TTL_MS_DEFAULT;
var init_cookie_security = __esm({
  "src/cookie-security.ts"() {
    "use strict";
    import_node_crypto3 = __toESM(require("crypto"), 1);
    init_security_utils();
    ANCHOR_TTL_MS_DEFAULT = 30 * 24 * 3600 * 1e3;
  }
});

// src/render.ts
var render_exports = {};
__export(render_exports, {
  __clearConfigCache: () => __clearConfigCache,
  __clearGuardCache: () => __clearGuardCache,
  decodeInvisibleBootstrapPath: () => decodeInvisibleBootstrapPath,
  enableDiskStore: () => enableDiskStore,
  encodeInvisibleBootstrapPath: () => encodeInvisibleBootstrapPath,
  ensureGuardsReady: () => ensureGuardsReady,
  fetchConfigForSiteKey: () => fetchConfigForSiteKey,
  fetchWhitelistForSiteKey: () => fetchWhitelistForSiteKey,
  generateSkeleton: () => generateSkeleton,
  getConfig: () => getConfig,
  getConfigAvailability: () => getConfigAvailability,
  handleRender: () => handleRender,
  injectGuardScripts: () => injectGuardScripts,
  injectReferrerPolicy: () => injectReferrerPolicy,
  isConfigAvailable: () => isConfigAvailable,
  readBootstrap: () => readBootstrap,
  readLatestBootstrap: () => readLatestBootstrap,
  renderResponseData: () => renderResponseData,
  signToken: () => signToken,
  storeBootstrap: () => storeBootstrap,
  storeHtml: () => storeHtml,
  verifyRenderGrant: () => verifyRenderGrant
});
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
function encodeInvisibleBootstrapPath(token) {
  return String.fromCodePoint(917601);
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
function injectReferrerPolicy(html) {
  const meta = '<meta name="referrer" content="strict-origin-when-cross-origin">';
  if (html.includes("<head>")) return html.replace("<head>", "<head>" + meta);
  if (html.includes("<html")) {
    const m = html.match(/<html[^>]*>/);
    if (m) return html.replace(m[0], m[0] + meta);
  }
  return meta + html;
}
async function handleRender(token, res, configUrl, mid, grant, ip, expectedSiteKey, baseUrl, _secret, ua, midAnchor) {
  const data = await renderResponseData(token, void 0, configUrl, mid, grant, ip, expectedSiteKey, _secret);
  if (data.html && mid) data.html = injectNoticeScript(data.html, mid, expectedSiteKey || token.split(":")[0] || "", baseUrl);
  if (data.html) data.html = injectReferrerPolicy(data.html);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader("Content-Type", "application/json");
  if (res.setHeader) res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (res.setHeader) res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
  if (res.setHeader) res.setHeader("Pragma", "no-cache");
  if (data.html && res.setHeader) {
    const authSecret = _secret;
    if (authSecret) {
      const cookies = [];
      const ts = Math.floor(Date.now() / 1e3);
      const val = ts + ":" + import_crypto.default.createHmac("sha256", authSecret).update("sg_authorized:" + ts).digest("hex");
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      cookies.push("__sg_authorized=" + val + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=120" + secure);
      if (mid) {
        const anchorOptions = { secret: authSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1e3 };
        const anchorOk = !!midAnchor && isMidAnchorValid(midAnchor, ip || "", ua || "", mid, anchorOptions);
        if (!anchorOk) {
          cookies.push("__sg_mid_anchor=" + createMidAnchorValue(ip || "", ua || "", mid, anchorOptions) + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000" + secure);
        }
      }
      const existing = res.getHeader ? res.getHeader("Set-Cookie") : void 0;
      if (existing !== void 0) {
        const current = (Array.isArray(existing) ? existing : [existing]).filter((value) => typeof value === "string");
        res.setHeader("Set-Cookie", [...current, ...cookies]);
      } else {
        res.setHeader("Set-Cookie", cookies);
      }
    }
  }
  if (res.send) res.send(json);
  else if (res.end) res.end(json);
}
function injectNoticeScript(html, mid, siteKey, baseUrl) {
  const baseVal = baseUrl || "";
  const sanitizedNotice = NOTICE_SCRIPT.replace(["Aucune donn\xE9e", "personnelle n'est", "collect\xE9e."].join(" "), "Des signaux techniques et des identifiants pseudonymis\xE9s peuvent \xEAtre trait\xE9s selon la politique du site.").replace(["No personal data", "is collected."].join(" "), "Technical signals and pseudonymous identifiers may be processed according to the website's policy.");
  const inject = sanitizedNotice.replace("var mid=window.__sg_mid||'';", "var mid=" + JSON.stringify(mid) + "||'';").replace("var sk=window.__sg_siteKey||'';", "var sk=" + JSON.stringify(siteKey) + "||'';").replace("var base=window.__sg_baseUrl||'';", "var base=" + JSON.stringify(baseVal) + "||window.__sg_baseUrl||'';").replace("window.__sg_noticeEnabled", "window.__sg_noticeEnabled");
  if (html.includes("</body>")) return html.replace("</body>", inject + "</body>");
  return html + inject;
}
function signToken(siteKey, timestamp, secretOverride) {
  const secret = secretOverride;
  if (!secret) return { token: "" };
  const nonce = import_crypto.default.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = import_crypto.default.createHmac("sha256", secret).update(payload).digest("hex");
  return { token: payload + ":" + sig };
}
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
function isConfigAvailable(siteKey, baseUrl) {
  return _configCache.get(configKey(baseUrl, siteKey))?.available === true;
}
function getConfigAvailability(siteKey, baseUrl, secret, maxStaleMs = CONFIG_STALE_MAX) {
  const entry = _configCache.get(configKey(baseUrl, siteKey));
  if (!entry?.snapshot || !secret) return "expired";
  return availabilityState(entry.snapshot, secret, Date.now(), maxStaleMs);
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
function __clearGuardCache(siteKey, baseUrl) {
  if (siteKey && baseUrl) _guardCaches.delete(cacheKey(baseUrl, siteKey));
  else if (siteKey) {
    for (const k of [..._guardCaches.keys()]) if (k.endsWith("::" + siteKey)) _guardCaches.delete(k);
  } else _guardCaches.clear();
}
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
  const cache = getCacheEntry(baseUrl, sk);
  if (cache.fetching) return new Promise((resolve) => {
    cache.queue.push(resolve);
  });
  cache.fetching = true;
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
      cache.detect = rawDetect;
      cache.guard = rawGuard;
      cache.fetchedAt = Date.now();
    }
  } catch {
  }
  cache.fetching = false;
  cache.queue.forEach((r) => r());
  cache.queue = [];
}
function startGuardPoller(baseUrl, secret, siteKey) {
  const key = cacheKey(baseUrl, siteKey || "cache");
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
  const cache = getCacheEntry(baseUrl, siteKey || "cache");
  if (!cache.detect || !cache.guard) {
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
  const cache = getCacheEntry(baseUrl, siteKey);
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
  if (cache.detect) fragments.push(webkitCompatibleGuard(cache.detect));
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
var import_crypto, import_fs, import_path, import_os, runtimeGlobal, TOKEN_DIR, TOKEN_TTL, MAX_ENTRIES, MAX_TOTAL_BYTES, _memoryStore, _bootstrapStore, _latestBootstrap, _diskEnabled, _totalBytes, _diskCleanupStarted, GRANT_TTL_MS, NOTICE_SCRIPT, CONFIG_CACHE_TTL, CONFIG_STALE_MAX, CONFIG_FETCH_TIMEOUT, MAX_TENANTS, _configCache, GUARD_POLL_MS, _guardCaches, _guardPollers;
var init_render = __esm({
  "src/render.ts"() {
    "use strict";
    import_crypto = __toESM(require("crypto"), 1);
    import_fs = require("fs");
    import_path = require("path");
    import_os = require("os");
    init_locales();
    init_availability();
    init_cookie_security();
    runtimeGlobal = globalThis;
    TOKEN_DIR = (0, import_path.join)((0, import_os.tmpdir)(), "shugoi-render-" + (process.getuid?.() ?? "x"));
    TOKEN_TTL = 12e4;
    MAX_ENTRIES = 5e3;
    MAX_TOTAL_BYTES = 64 * 1024 * 1024;
    _memoryStore = /* @__PURE__ */ new Map();
    _bootstrapStore = /* @__PURE__ */ new Map();
    _latestBootstrap = null;
    _diskEnabled = false;
    _totalBytes = 0;
    _diskCleanupStarted = false;
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
    GRANT_TTL_MS = 12e4;
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
  function _CH(){var h=_DARK?(_MOBILE?_CARD_HTML_MOB_DARK:_CARD_HTML_DESK_DARK):(_MOBILE?_CARD_HTML_MOB:_CARD_HTML_DESK);return h.replace(["Aucune donn\xE9e","personnelle n'est","collect\xE9e."].join(" "),"Des signaux techniques et des identifiants pseudonymis\xE9s peuvent \xEAtre trait\xE9s selon la politique du site.").replace(["No personal data","is collected."].join(" "),"Technical signals and pseudonymous identifiers may be processed according to the website's policy.")}
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
    CONFIG_CACHE_TTL = 3e4;
    CONFIG_STALE_MAX = 6e5;
    CONFIG_FETCH_TIMEOUT = 2e3;
    MAX_TENANTS = 500;
    _configCache = /* @__PURE__ */ new Map();
    GUARD_POLL_MS = (() => {
      const raw = Number(process.env.SHUGOKI_GUARD_POLL_MS || "");
      return Number.isFinite(raw) && raw >= 1e3 ? raw : 3e4;
    })();
    _guardCaches = /* @__PURE__ */ new Map();
    _guardPollers = /* @__PURE__ */ new Map();
  }
});

// src/index.ts
var src_exports = {};
__export(src_exports, {
  BLOCK_PAGE: () => BLOCK_PAGE,
  DEFAULT_BOT_WHITELIST: () => DEFAULT_BOT_WHITELIST,
  DEFAULT_HEADLESS_PATTERNS: () => DEFAULT_HEADLESS_PATTERNS,
  ShugoiError: () => ShugoiError,
  __clearConfigCache: () => __clearConfigCache,
  __clearGuardCache: () => __clearGuardCache,
  applyBootObfuscation: () => applyBootObfuscation,
  applyObfuscation: () => applyObfuscation,
  attachShugoiWebSocket: () => attachShugoiWebSocket,
  availabilityState: () => availabilityState,
  buildCsp: () => buildCsp,
  canServeDegradedPath: () => canServeDegradedPath,
  checkLicense: () => checkLicense,
  createShugoiMiddleware: () => createShugoiMiddleware,
  createShugoiPlugin: () => createShugoiPlugin,
  decodeInvisibleBootstrapPath: () => decodeInvisibleBootstrapPath,
  encodeInvisibleBootstrapPath: () => encodeInvisibleBootstrapPath,
  fetchWhitelistForSiteKey: () => fetchWhitelistForSiteKey,
  generateSkeleton: () => generateSkeleton,
  getConfigAvailability: () => getConfigAvailability,
  handleRender: () => handleRender,
  injectGuardScripts: () => injectGuardScripts,
  isValidJs: () => isValidJs,
  mergeCsp: () => mergeCsp,
  readBootstrap: () => readBootstrap,
  readLatestBootstrap: () => readLatestBootstrap,
  renderResponseData: () => renderResponseData,
  scriptTags: () => scriptTags,
  signAvailabilitySnapshot: () => signAvailabilitySnapshot,
  signToken: () => signToken,
  storeBootstrap: () => storeBootstrap,
  storeHtml: () => storeHtml,
  validateSiteKey: () => validateSiteKey,
  verifyAvailabilitySnapshot: () => verifyAvailabilitySnapshot,
  verifyRenderGrant: () => verifyRenderGrant
});
module.exports = __toCommonJS(src_exports);

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

// src/websocket.ts
var import_ws = require("ws");
init_render();
var MAX_QUERY_BYTES = 24 * 1024;
var nowSubMs = () => Date.now() + (typeof performance === "undefined" ? 0 : performance.now() % 1);
var originOK = (req) => {
  const origin = req.headers.origin, host = req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};
function headers(req) {
  const out = new Headers({ accept: "application/json", "x-shugoi-ws-relay": "1" });
  for (const n of ["origin", "user-agent", "sec-ch-ua", "sec-ch-ua-platform", "sec-ch-ua-mobile", "x-real-ip", "x-forwarded-for", "x-forwarded-proto", "cookie"]) {
    const v = req.headers[n];
    if (typeof v === "string" && v.length <= 4096) out.set(n, v);
  }
  return out;
}
function renderRequest(value, multiplexed = false) {
  try {
    const x = JSON.parse(value);
    const allowed = multiplexed ? ["cmd", "token", "mid", "grant"] : ["token", "mid", "grant"];
    if (!x || typeof x !== "object" || Array.isArray(x) || Object.keys(x).length !== allowed.length || Object.keys(x).some((k) => !allowed.includes(k)) || multiplexed && x.cmd !== "render" || typeof x.token !== "string" || x.token.length < 16 || x.token.length > 300 || typeof x.mid !== "string" || !/^[a-f0-9]{64}$/.test(x.mid) || typeof x.grant !== "string" || x.grant.length > 256) return null;
    return { token: x.token, mid: x.mid, grant: x.grant };
  } catch {
    return null;
  }
}
function queryRequest(value) {
  try {
    const x = JSON.parse(value);
    if (!x || typeof x !== "object" || Array.isArray(x) || Object.keys(x).some((k) => k !== "q" && k !== "s")) return null;
    const stream2 = typeof x.s === "string" && typeof x.q !== "string";
    const raw = x.q ?? x.s;
    if (typeof raw !== "string" || raw.length < 2 || raw.length > MAX_QUERY_BYTES || !raw.startsWith("?")) return null;
    const q = new URLSearchParams(raw.slice(1));
    if (!q.has("mid") || !q.has("raw") || !q.has("key")) return null;
    const streamQuery = typeof x.q === "string" && typeof x.s === "string" && x.s.startsWith("?") ? new URLSearchParams(x.s.slice(1)).toString() : void 0;
    return { query: q.toString(), stream: stream2, streamQuery };
  } catch {
    return null;
  }
}
async function stream(ws, req, base, query) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 65e3);
  timer.unref();
  ws.once("close", () => ctl.abort());
  try {
    const r = await fetch(`${base}/api/v1/whitelist-stream?${query}`, { headers: headers(req), signal: ctl.signal });
    if (!r.ok || !r.body) {
      if (ws.readyState === import_ws.WebSocket.OPEN) ws.send((await r.text()).slice(0, 16384), () => ws.close());
      return;
    }
    const reader = r.body.getReader(), decoder = new TextDecoder();
    let pending = "";
    while (ws.readyState === import_ws.WebSocket.OPEN) {
      const part = await reader.read();
      if (part.done) break;
      pending += decoder.decode(part.value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) if (line.startsWith("data: ") && line.length <= 16384 && ws.bufferedAmount < 65536) ws.send(line.slice(6), { binary: false, compress: false });
    }
  } catch {
  } finally {
    clearTimeout(timer);
  }
}
async function render(ws, msg, opts, multiplexed = false) {
  const r = renderRequest(JSON.stringify(msg), multiplexed);
  if (!r) {
    console.warn("[shugoi] ws_render_rejected", { reason: "invalid_request", multiplexed });
    return ws.terminate();
  }
  try {
    const tokenSiteKey = r.token.split(":", 1)[0];
    const renderSiteKey = tokenSiteKey === opts.siteKey ? opts.siteKey : tokenSiteKey;
    const renderSecret = renderSiteKey === opts.siteKey ? opts.secret : opts.resolveSecret ? await opts.resolveSecret(renderSiteKey) : null;
    if (!renderSecret) {
      console.warn("[shugoi] ws_render_rejected", { reason: "unknown_site", siteKey: renderSiteKey, mid: r.mid.slice(0, 8) });
      return ws.terminate();
    }
    const out = await renderResponseData(r.token, void 0, void 0, r.mid, r.grant, void 0, renderSiteKey, renderSecret);
    if (!out.html) {
      console.warn("[shugoi] ws_render_rejected", { reason: out.error || "empty_render", siteKey: opts.siteKey, mid: r.mid.slice(0, 8) });
      return ws.terminate();
    }
    if (out.html.length > 1024 * 1024 || ws.readyState !== import_ws.WebSocket.OPEN) {
      console.warn("[shugoi] ws_render_rejected", { reason: ws.readyState !== import_ws.WebSocket.OPEN ? "socket_not_open" : "render_too_large", siteKey: opts.siteKey, mid: r.mid.slice(0, 8) });
      return ws.terminate();
    }
    ws.send(out.html, { binary: false, compress: false }, (err) => {
      if (err) console.warn("[shugoi] ws_render_send_failed", { siteKey: opts.siteKey, mid: r.mid.slice(0, 8), error: String(err) });
      else ws.close(1e3, "render-delivered");
    });
  } catch (error) {
    console.warn("[shugoi] ws_render_error", { siteKey: opts.siteKey, mid: r.mid.slice(0, 8), error: String(error) });
    ws.terminate();
  }
}
function attachShugoiWebSocket(server, opts) {
  const wss = new import_ws.WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: MAX_QUERY_BYTES + 256 });
  const upgrades = /* @__PURE__ */ new Map();
  const onUpgrade = (req, socket, head) => {
    const path = new URL(req.url || "/", "http://localhost").pathname;
    if (!["/__shugoi/bootstrap/ws", "/__shugoi/render/ws", "/api/v1/ws-wlc", "/ws-clock"].includes(path)) return;
    const origin = req.headers.origin;
    const wlcOrigin = typeof origin === "string" && /^https?:\/\//.test(origin);
    if (path === "/api/v1/ws-wlc" ? !wlcOrigin : !(opts.sameOrigin || originOK)(req)) {
      socket.destroy();
      return;
    }
    const peer = req.socket.remoteAddress || "unknown", now = Date.now(), recent = (upgrades.get(peer) || []).filter((t) => now - t < 1e4);
    if (path === "/api/v1/ws-wlc" && recent.length >= 24) {
      socket.destroy();
      return;
    }
    recent.push(now);
    upgrades.set(peer, recent);
    wss.handleUpgrade(req, socket, head, (ws) => {
      const ttl = setTimeout(() => ws.terminate(), path === "/api/v1/ws-wlc" ? 7e4 : 1e4);
      ttl.unref();
      let tick;
      ws.on("close", () => {
        clearTimeout(ttl);
        clearInterval(tick);
      });
      ws.on("error", () => ws.terminate());
      if (path === "/__shugoi/bootstrap/ws") {
        const b = readLatestBootstrap();
        if (!b) return ws.terminate();
        return ws.send(b, { binary: false, compress: false }, () => ws.close(1e3, "bootstrap-delivered"));
      }
      let mode = null, pings = 0, drift = null;
      ws.on("message", async (raw, binary) => {
        if (binary) return ws.terminate();
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return ws.terminate();
        }
        if (!msg || typeof msg !== "object" || Array.isArray(msg)) return ws.terminate();
        const x = msg;
        if (path === "/__shugoi/render/ws") return void render(ws, x, opts);
        if (path === "/ws-clock") {
          if (x.cmd === "stop") {
            clearInterval(tick);
            return;
          }
          if (x.cmd === "stream") {
            const ms = Math.max(50, Math.min(1e3, Math.round(Number(x.ms ?? 250))));
            clearInterval(tick);
            tick = setInterval(() => ws.readyState === import_ws.WebSocket.OPEN && ws.send(JSON.stringify({ t: nowSubMs(), ms })), ms);
            return;
          }
          if (Object.keys(x).length !== 1 || typeof x.tSend !== "number") return ws.terminate();
          return void ws.send(JSON.stringify({ tSend: x.tSend, tRecv: nowSubMs(), tOut: nowSubMs() }));
        }
        if (x.cmd === "clock-ping" && mode !== "wlc" && typeof x.tSend === "number") {
          if (++pings > 8) return ws.terminate();
          mode = "clock";
          const tRecv = nowSubMs(), tOut = nowSubMs();
          drift = (tRecv + tOut) / 2 - x.tSend;
          return void ws.send(JSON.stringify({ cmd: "clock-pong", tSend: x.tSend, tRecv, tOut }));
        }
        if (mode === "clock" && x.cmd === "clock-stream") {
          const ms = Math.max(50, Math.min(1e3, Math.round(Number(x.ms ?? 250))));
          clearInterval(tick);
          tick = setInterval(() => ws.readyState === import_ws.WebSocket.OPEN && ws.send(JSON.stringify({ cmd: "clock-tick", t: nowSubMs(), ms })), ms);
          return;
        }
        if (mode === "clock" && x.cmd === "clock-stop") {
          clearInterval(tick);
          return;
        }
        if (x.cmd === "event" && typeof x.reason === "string" && typeof x.siteKey === "string" && Object.keys(x).every((k) => ["cmd", "reason", "machineId", "siteKey"].includes(k))) {
          const address2 = server.address();
          if (!address2 || typeof address2 === "string") return ws.terminate();
          try {
            await fetch(`http://127.0.0.1:${address2.port}/api/v1/event`, { method: "POST", headers: { ...Object.fromEntries(headers(req)), "content-type": "application/json" }, body: JSON.stringify({ siteKey: x.siteKey, reason: x.reason, machineId: typeof x.machineId === "string" ? x.machineId : "" }), signal: AbortSignal.timeout(4e3) });
          } catch {
          }
          return void ws.close(1e3, "event-delivered");
        }
        if (x.cmd === "render") return void render(ws, x, opts, true);
        const q = queryRequest(JSON.stringify(x)), address = server.address();
        if (!q || !address || typeof address === "string") return ws.terminate();
        if (drift !== null && Math.abs(Number(new URLSearchParams(q.query).get("drift")) - drift) > 1500) return ws.terminate();
        mode = "wlc";
        const base = `http://127.0.0.1:${address.port}`;
        if (q.stream) return void stream(ws, req, base, q.query);
        try {
          const r = await fetch(`${base}/api/v1/wlc?${q.query}`, { headers: headers(req), signal: AbortSignal.timeout(8e3) });
          const body = await r.text();
          if (body.length > 16384 || ws.readyState !== import_ws.WebSocket.OPEN) return ws.terminate();
          ws.send(body, { binary: false, compress: false }, () => {
            if (q.streamQuery) void stream(ws, req, base, q.streamQuery);
          });
        } catch {
          ws.terminate();
        }
      });
    });
  };
  server.on("upgrade", onUpgrade);
  return () => {
    server.off("upgrade", onUpgrade);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  };
}

// src/request-ip.ts
function requestIp(request) {
  return request.ip || request.socket?.remoteAddress || request.raw?.socket?.remoteAddress || "unknown";
}

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
var import_dns = require("dns");
var BOT_DOMAINS = [
  { pattern: /Googlebot|Google-InspectionTool|Storebot-Google/i, suffixes: [".googlebot.com", ".google.com"] },
  { pattern: /Bingbot|adidxbot|BingPreview/i, suffixes: [".search.msn.com"] },
  { pattern: /Slurp/i, suffixes: [".crawl.yahoo.net"] },
  { pattern: /DuckDuckBot/i, suffixes: [".duckduckgo.com"] },
  { pattern: /YandexBot/i, suffixes: [".yandex.ru", ".yandex.net", ".yandex.com"] },
  { pattern: /Applebot/i, suffixes: [".applebot.apple.com"] },
  { pattern: /Discordbot/i, suffixes: [".discord.gg", ".discord.com", ".discordapp.com"] }
];
var VERIFIABLE_BOTS = BOT_DOMAINS.map((b) => b.pattern);
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
    const names = await import_dns.promises.reverse(ip);
    const name = names.find((n) => entry.suffixes.some((s) => n.toLowerCase().endsWith(s)));
    if (name) {
      const forward = await import_dns.promises.resolve(name).catch(() => []);
      const forward6 = await import_dns.promises.resolve6(name).catch(() => []);
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

// src/core.ts
init_security_utils();

// src/pow-utils.ts
var import_node_crypto4 = __toESM(require("crypto"), 1);
function createPowNonce() {
  return import_node_crypto4.default.randomBytes(8).toString("hex");
}
function verifyPow(proof, options) {
  if (!proof || !options.secret) return false;
  const [timestamp, nonce, solution] = proof.split(":");
  if (!timestamp || !nonce || !solution || !/^[0-9a-f]{16}$/.test(nonce)) return false;
  const parsedTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp * 1e3) > options.ttlMs) return false;
  const salt = import_node_crypto4.default.createHmac("sha256", options.secret).update(`${timestamp}:${nonce}`).digest("hex");
  const digest = import_node_crypto4.default.createHash("sha256").update(`${salt}:${solution}`).digest("hex");
  let leadingBits = 0;
  for (const nibble of digest) {
    const value = Number.parseInt(nibble, 16);
    if (value === 0) {
      leadingBits += 4;
      continue;
    }
    leadingBits += value & 8 ? 0 : value & 4 ? 1 : value & 2 ? 2 : 3;
    break;
  }
  return leadingBits >= options.difficulty;
}

// src/challenge-limiter.ts
var ChallengeLimiter = class {
  constructor(options) {
    this.options = options;
    this.timer = setInterval(() => this.cleanup(), options.windowMs);
    this.timer.unref();
  }
  options;
  entries = /* @__PURE__ */ new Map();
  timer;
  allow(ip) {
    if (!ip || ip === "unknown") return true;
    const now = Date.now();
    let entry = this.entries.get(ip);
    if (!entry || now - entry.windowStart >= this.options.windowMs) {
      this.entries.set(ip, { count: 1, windowStart: now, blockedUntil: 0 });
      return true;
    }
    entry.count += 1;
    if (entry.blockedUntil > now) return false;
    if (entry.count > this.options.limit) {
      const backoff = Math.min(6e4 * 2 ** Math.min(entry.count - this.options.limit, 10), this.options.maxBlockMs);
      entry.blockedUntil = now + backoff;
      entry.count = 0;
      return false;
    }
    return true;
  }
  close() {
    clearInterval(this.timer);
    this.entries.clear();
  }
  cleanup() {
    const now = Date.now();
    for (const [ip, entry] of this.entries) {
      if (now > entry.blockedUntil && now - entry.windowStart > this.options.windowMs * 2) this.entries.delete(ip);
    }
  }
};

// src/core.ts
init_cookie_security();

// src/proof-replay-store.ts
var ProofReplayStore = class {
  constructor(options) {
    this.options = options;
    this.timer = setInterval(() => this.cleanup(), options.ttlMs);
    this.timer.unref();
  }
  options;
  entries = /* @__PURE__ */ new Map();
  timer;
  consume(proof) {
    this.cleanup();
    if (this.entries.has(proof)) return false;
    this.entries.set(proof, Date.now());
    return true;
  }
  close() {
    clearInterval(this.timer);
    this.entries.clear();
  }
  cleanup() {
    const now = Date.now();
    for (const [proof, timestamp] of this.entries) {
      if (now - timestamp > this.options.ttlMs) this.entries.delete(proof);
    }
  }
};

// src/core.ts
var import_node_crypto5 = __toESM(require("crypto"), 1);
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
  return '<!DOCTYPE html><html lang="' + htmlLang + `"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:'Reggae One';src:url(https://shugoi.com/reggae-one.woff2) format('woff2');font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5;color:#555}@media(prefers-color-scheme:dark){html,body{background:#16101c;color:#f1e8f5}#c{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}#c h2{color:#e9899f}#c p.desc{color:#a795b4}#c p.ft{color:#e9899f}}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:'Reggae One',Georgia,"Times New Roman",serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon.png alt class=l><img src=https://shugoi.com/brand.png alt class=b><div class=bdg>` + htmlBadge + "</div><h2>" + htmlTitle + "</h2><p class=desc>" + htmlDesc + "</p><p class=ft>" + htmlHost + " \xB7 Shugoi</p></div>" + countdownScript + "</body></html>";
}
function createCore(options) {
  const allowlist = options.allowlist ?? ["/api", "/legal"];
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST;
  const baseUrl = options.baseUrl ?? "https://api.shugoi.com/api/v1";
  const internalUrl = options.internalUrl || baseUrl;
  const debug = options.debug ?? false;
  const siteSecret = options.signingSecret || options.secret;
  if (!siteSecret) throw new Error("Shugoi requires an explicit site secret");
  const blockStatus = options.blockStatus ?? 403;
  const blockPage = options.blockPage ?? null;
  const cspEnabled = options.csp ?? true;
  const verifyBots = options.verifyBots !== false;
  let _validationValid = false;
  let _validationFailed = false;
  let _validationFailedReason = "";
  let _validationWarnedAt = 0;
  const VALIDATION_WARN_INTERVAL = 36e5;
  const apiOrigin = originOf(baseUrl);
  const csp = buildCsp({
    siteKey: options.siteKey,
    extraDirectives: options.extraDirectives || {},
    splitRender: options.splitRender ?? true,
    ...apiOrigin === null ? {} : { apiOrigin }
  });
  function log(...args) {
    if (debug) console.log("[shugoi]", ...args);
  }
  const POW_DIFF = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "12");
    return Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
  })();
  const POW_OK_TTL_MS = 24 * 3600 * 1e3;
  const powSecret = siteSecret;
  const POW_TTL_MS = 12e4;
  const CHALLENGE_LIMIT = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_LIMIT || "60");
    return Number.isInteger(raw) && raw > 0 ? raw : 60;
  })();
  const CHALLENGE_WINDOW_MS = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_WINDOW || "60");
    return Number.isInteger(raw) && raw > 0 ? raw * 1e3 : 6e4;
  })();
  const CHALLENGE_MAX_BLOCK_MS = 15 * 60 * 1e3;
  const challengeLimiter = new ChallengeLimiter({ limit: CHALLENGE_LIMIT, windowMs: CHALLENGE_WINDOW_MS, maxBlockMs: CHALLENGE_MAX_BLOCK_MS });
  const proofReplayStore = new ProofReplayStore({ ttlMs: POW_TTL_MS });
  const isPowValid = (proof) => verifyPow(proof, { secret: powSecret, difficulty: POW_DIFF, ttlMs: POW_TTL_MS });
  const cookieSecurity = { secret: powSecret, okTtlMs: POW_OK_TTL_MS, authorizedTtlMs: 12e4 };
  const sgOkCookieValue = (ip, ua) => createOkCookieValue(ip, ua, cookieSecurity);
  const isSgOkValid = (value, ip, ua) => isOkCookieValid(value, ip, ua, cookieSecurity);
  const isSgAuthorizedValid = (value) => isAuthorizedCookieValid(value, cookieSecurity);
  const isSgMidAnchorValid = (value, ip, ua, mid) => isMidAnchorValid(value, ip, ua, mid, cookieSecurity);
  const validationPromise = (async () => {
    if (siteSecret && internalUrl) {
      try {
        const res = await fetch(internalUrl + "/validate-key", {
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
    }
  })();
  ensureGuardsReady(internalUrl, siteSecret, options.siteKey).catch(() => {
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
  const botIpList = new Set((process.env.SHUGOKI_BOT_IPS || "").split(",").map((s) => s.trim()).filter(Boolean));
  const LENIENT_WINDOW_MS = 6e4;
  const LENIENT_MAX_PER_WINDOW = 20;
  const LENIENT_MAX_IPS = 5e3;
  const _lenientHits = /* @__PURE__ */ new Map();
  function lenientBotAllow(ip) {
    const now = Date.now();
    if (_lenientHits.size > LENIENT_MAX_IPS && !_lenientHits.has(ip)) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [k, v] of _lenientHits) {
        const at = v[0] ?? 0;
        if (at < oldestAt) {
          oldestAt = at;
          oldestKey = k;
        }
      }
      if (oldestKey) _lenientHits.delete(oldestKey);
    }
    let hits = _lenientHits.get(ip);
    if (!hits) {
      hits = [];
      _lenientHits.set(ip, hits);
    }
    while (hits.length) {
      const first = hits[0];
      if (first === void 0 || now - first > LENIENT_WINDOW_MS) hits.shift();
      else break;
    }
    if (hits.length >= LENIENT_MAX_PER_WINDOW) return false;
    hits.push(now);
    return true;
  }
  async function botBypass(ua, ip) {
    if (!isWhitelistedBot(ua)) return false;
    if (options.logBotIps !== false) {
      console.log("[shugoi] bot_ua ip=" + ip + " ua=" + String(ua).slice(0, 50));
    }
    if (VERIFIABLE_BOTS.some((p) => p.test(ua))) return await isTrustedBot(ua, ip);
    return lenientBotAllow(ip);
  }
  async function isTrustedBot(ua, ip) {
    if (!isWhitelistedBot(ua)) return false;
    if (!verifyBots) return true;
    if (botIpList.has(ip)) return true;
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
      fetch(internalUrl + "/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey: options.siteKey, reason: "validation_failed" }),
        signal: AbortSignal.timeout(2e3)
      }).catch(() => {
      });
    }
    if (ctx.sgMidAnchor && ctx.mid && !isSgMidAnchorValid(ctx.sgMidAnchor, ctx.ip, ctx.ua, ctx.mid)) {
      log("anchor_mismatch:", ctx.ip.slice(0, 24), ctx.mid.slice(0, 8));
      return { block: true, status: 403, contentType: "text/plain", body: BLOCK_PAGE, headers: {} };
    }
    if (isAllowlisted(ctx.path)) return null;
    if (ctx.path === "/__sg_challenge") {
      if (!challengeLimiter.allow(ctx.ip)) {
        const loc = resolveLocale(void 0, ctx.acceptLanguage);
        const lmsgs = MESSAGES[loc];
        return { block: true, status: 429, contentType: "text/html", body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody("1 min"), lmsgs.rateLimitBadge, ctx.host || "", 60, loc) };
      }
      const js = `(function(){
var P=new URLSearchParams(location.search);
var salt=P.get('salt')||'', ts=P.get('ts')||'', nonce=P.get('nonce')||'', diff=parseInt(P.get('diff')||'12',10), path=P.get('path')||'/';
if(path.charAt(0)!=='/'||path.charAt(1)==='/'||path.indexOf('\\\\')>=0)path='/';
try{history.replaceState(null,'',path)}catch(e){}
var msg=document.createElement('div');msg.id='__sg_cmsg';msg.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:sans-serif;text-align:center;color:#333;pointer-events:none';msg.innerHTML='<div style="width:36px;height:36px;border:3px solid rgba(0,0,0,.12);border-top-color:#e87090;border-radius:50%;animation:sgspin .9s linear infinite"></div>';try{var _st=document.createElement('style');_st.textContent='html,body{background:#faf9f7;margin:0}@keyframes sgspin{to{transform:rotate(360deg)}}@media(prefers-color-scheme:dark){html,body{background:#16101c}}';document.head.appendChild(_st);document.documentElement.appendChild(msg)}catch(e){}
var enc=(typeof TextEncoder!=='undefined'?new TextEncoder():{encode:function(s){var a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a}});
function bits(d){var l=0;for(var i=0;i<d.length;i++){var b=parseInt(d[i],16);if(b===0){l+=4;continue}l+=(b&8)?0:(b&4)?1:(b&2)?2:3;break}return l}
function sha256hex(s){var K=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];var H=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];var W=new Array(64);function rotr(n,x){return (x>>>n)|(x<<(32-n));}var m=s;var ml=m.length;var len=ml*8;var pad=new Uint8Array(((ml+9+63)>>6<<6));for(var i=0;i<ml;i++)pad[i]=m.charCodeAt(i);pad[ml]=128;var dv=new DataView(pad.buffer);dv.setUint32(pad.length-8,Math.floor(len/0x100000000),false);dv.setUint32(pad.length-4,len,false);for(var i2=0;i2<pad.length;i2+=64){for(var j=0;j<16;j++)W[j]=dv.getUint32(i2+j*4,false);for(var jj=16;jj<64;jj++){var s0=rotr(7,W[jj-15])^rotr(18,W[jj-15])^(W[jj-15]>>>3);var s1=rotr(17,W[jj-2])^rotr(19,W[jj-2])^(W[jj-2]>>>10);W[jj]=(W[jj-16]+s0+W[jj-7]+s1)|0;}var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];for(var j3=0;j3<64;j3++){var S1=rotr(6,e)^rotr(11,e)^rotr(25,e);var ch=(e&f)^(~e&g);var temp1=(h+S1+ch+K[j3]+W[j3])|0;var S0=rotr(2,a)^rotr(13,a)^rotr(22,a);var maj=(a&b)^(a&c)^(b&c);var temp2=(S0+maj)|0;h=g;g=f;f=e;e=(d+temp1)|0;d=c;c=b;b=a;a=(temp1+temp2)|0;}for(var j4=0;j4<8;j4++)H[j4]=(H[j4]+[a,b,c,d,e,f,g,h][j4])|0;}var out="";for(var k=0;k<8;k++)out+=(H[k]>>>0).toString(16).padStart(8,"0");return out;}
var n=0;
function done(h){if(bits(h)>=diff){var base=path;var q=(base.indexOf('?')>=0?'&':'?')+'sg_proof='+ts+':'+nonce+':'+n.toString(16);location.replace(base+q);return true}return false}
if(typeof sha256hex==='function'){
  // Pur-JS batch\xE9 en PRIORIT\xC9 : ~200 hachages/tick sans IPC crypto.subtle
  // (subtle 1-hachage-par-appel \u2248 500/s sur mobile \u2192 plusieurs secondes pour diff 12).
  function stepSync(){
    for(var batch=0;batch<1000;batch++){
      if(n>=300000){location.reload();return}
      try{var h2=sha256hex(salt+':'+n.toString(16));if(done(h2))return}catch(e){location.reload();return}
      n++;
    }
    setTimeout(stepSync,0);
  }
  stepSync();
} else if(typeof crypto!=='undefined'&&crypto.subtle&&crypto.subtle.digest){
  function stepSubtle(){
    if(n>=300000){location.reload();return}
    crypto.subtle.digest('SHA-256',enc.encode(salt+':'+n.toString(16))).then(function(buf){
      var h=Array.from(new Uint8Array(buf)).map(function(v){return v.toString(16).padStart(2,'0')}).join('');
      if(!done(h)){n++;setTimeout(stepSubtle,0)}
    }).catch(function(){location.reload()});
  }
  stepSubtle();
} else {
  location.reload();
}
})();`;
      const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>' + js + "</script></body></html>";
      return { block: true, status: 200, contentType: "text/html", body: html };
    }
    const flags = await fetchConfigForSiteKey(options.siteKey, internalUrl, options.signingSecret || options.secret);
    if (options.failOpenOnUnavailable && !isConfigAvailable(options.siteKey, internalUrl)) {
      log("Shugoi indisponible; passage en mode fail-open");
      return null;
    }
    const headlessEnabled = flags.enableHeadlessCheck !== false;
    const isPage = !ctx.path.includes("/__shugoi/") && !ctx.path.startsWith("/api/");
    if (isPage && powSecret && ctx.ua && headlessEnabled) {
      if (/Mozilla/i.test(ctx.ua) && !await botBypass(ctx.ua, ctx.ip)) {
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
      const proofFresh = validProof ? proofReplayStore.consume(proof) : false;
      const canProceed = validCookie || proofFresh;
      if (!canProceed && !await botBypass(ctx.ua, ctx.ip)) {
        if (!challengeLimiter.allow(ctx.ip)) {
          const loc = resolveLocale(void 0, ctx.acceptLanguage);
          const lmsgs = MESSAGES[loc];
          log("challenge rate-limited:", ctx.ip.slice(0, 24), ctx.ua.slice(0, 40));
          return { block: true, status: 429, contentType: "text/html", body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody("1 min"), lmsgs.rateLimitBadge, ctx.host || "", 60, loc) };
        }
        const tsNow = Math.floor(Date.now() / 1e3);
        const nonce = createPowNonce();
        const salt = import_node_crypto5.default.createHmac("sha256", powSecret).update(tsNow + ":" + nonce).digest("hex");
        const prefix = ctx.forwardedPrefix && ctx.forwardedPrefix !== "/" ? ctx.forwardedPrefix.replace(/\/$/, "") : "";
        const path = safeChallengePath(ctx.path.startsWith("/") ? ctx.path : "/" + ctx.path);
        const chalUrl = prefix + "/__sg_challenge?ts=" + tsNow + "&salt=" + salt + "&nonce=" + nonce + "&diff=" + POW_DIFF + "&path=" + encodeURIComponent(prefix + path);
        log("pow challenge (307):", ctx.ua.slice(0, 40));
        return { block: true, status: 307, contentType: "text/plain", body: BLOCK_PAGE, headers: { Location: chalUrl } };
      }
    }
    if (flags.enableRateLimit === true) {
      try {
        const rlRes = await fetch(internalUrl + "/rate-limit-check", {
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
    if (headlessEnabled && ctx.ua && !await botBypass(ctx.ua, ctx.ip) && headlessPatterns.some((p) => p.test(ctx.ua))) {
      log("headless block:", ctx.ua.slice(0, 40));
      fetch(internalUrl + "/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey: options.siteKey, reason: "headless" }), signal: AbortSignal.timeout(2e3) }).catch(() => {
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
    close() {
      challengeLimiter.close();
      proofReplayStore.close();
    },
    isProofValid: isPowValid,
    isOkCookieValid: (value, ip, ua) => isSgOkValid(value, ip, ua),
    sgOkCookie(proof, ip, ua) {
      if (!proof || !isPowValid(proof)) return null;
      return "__sg_ok=" + sgOkCookieValue(ip, ua) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + Math.floor(POW_OK_TTL_MS / 1e3) + (process.env.NODE_ENV === "production" ? "; Secure" : "");
    }
  };
}

// src/evaluate-context.ts
function createEvaluateContext(path, ua, ip, values) {
  const context = { path, ua, ip };
  if (values.mid !== null) context.mid = values.mid;
  if (values.host !== null) context.host = values.host;
  if (values.acceptLanguage !== null) context.acceptLanguage = values.acceptLanguage;
  if (values.secFetchDest !== null) context.secFetchDest = values.secFetchDest;
  if (values.secFetchMode !== null) context.secFetchMode = values.secFetchMode;
  if (values.sgProof !== null) context.sgProof = values.sgProof;
  if (values.sgOk !== null) context.sgOk = values.sgOk;
  if (values.sgAuthorized !== null) context.sgAuthorized = values.sgAuthorized;
  if (values.sgMidAnchor !== null) context.sgMidAnchor = values.sgMidAnchor;
  if (values.forwardedPrefix !== null) context.forwardedPrefix = values.forwardedPrefix;
  return context;
}

// src/middleware.ts
init_locales();
init_cookie_security();
init_availability();
var runtimeGlobal2 = globalThis;
function createShugoiMiddleware(options) {
  const core = createCore(options);
  const autoInject = options.autoInject ?? true;
  const splitRender = options.splitRender ?? true;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? "https://api.shugoi.com/api/v1";
  const internalUrl = options.internalUrl || baseUrl;
  const renderTransport = "websocket";
  let siteFlags = null;
  let previousAvailability = null;
  if (options.multiProcess) enableDiskStore(true);
  const middleware = async function shugoiMiddleware(req, res, next) {
    try {
      const path = (req.path ?? req.url ?? "/").split("?")[0] ?? "/";
      if (path === "/__shugoi/availability" && options.availabilityDiagnostics === true) {
        const state = getConfigAvailability(options.siteKey, internalUrl, signingSecret, options.degradedAvailability?.maxStaleMs);
        if (res.setHeader) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Content-Type-Options", "nosniff");
        }
        const body = JSON.stringify({ state, checkedAt: Math.floor(Date.now() / 1e3) * 1e3 });
        if (res.status) res.status(200);
        if (res.send) res.send(body);
        else if (res.end) res.end(body);
        return;
      }
      if (/\/assets\/[^/]+\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|ico)$/i.test(path)) {
        return next();
      }
      if (path.startsWith("/") && decodeInvisibleBootstrapPath(path.slice(1))) {
        if (res.setHeader) {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
          res.setHeader("X-Content-Type-Options", "nosniff");
        }
        const loader = "(function(){var done=false;function deliver(t){if(done||!t)return;done=true;document.write(t);try{document.close()}catch(e){}}function fallback(){if(done)return;fetch('/__shugoi/bootstrap/http',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.text():''}).then(deliver).catch(function(){})}try{var ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/__shugoi/bootstrap/ws');var timer=setTimeout(function(){try{ws.close()}catch(e){}fallback()},2500);ws.onmessage=function(e){clearTimeout(timer);deliver(e.data);try{ws.close()}catch(x){}};ws.onerror=function(){clearTimeout(timer);fallback()}}catch(e){fallback()}})()";
        if (res.end) res.end(loader);
        else if (res.send) res.send(loader);
        return;
      }
      if (path === "/__shugoi/bootstrap/http") {
        const bootstrap = readLatestBootstrap();
        if (!bootstrap) {
          if (res.status) res.status(404);
          if (res.end) res.end("bootstrap_unavailable");
          return;
        }
        if (res.setHeader) {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
        }
        if (res.end) res.end(bootstrap);
        else if (res.send) res.send(bootstrap);
        return;
      }
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
        const ip2 = requestIp(req);
        const ua2 = (typeof req.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : "") || "";
        const midAnchor2 = typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
        return handleRender2(q.token || "", res, internalUrl, q.mid || "", q.grant || "", ip2, options.siteKey, baseUrl, signingSecret, ua2, midAnchor2 || void 0);
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
      const ip = requestIp(req);
      const reqLocale = resolveLocale(options.locale, typeof req.headers?.["accept-language"] === "string" ? req.headers?.["accept-language"] : void 0);
      const midAnchor = typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
      const anchorSecret = signingSecret;
      let midAnchorOk;
      if (anchorSecret) {
        const anchorMid = midAnchor?.split(":")[3] ?? "";
        midAnchorOk = midAnchor && /^[a-f0-9]{64}$/.test(anchorMid) ? isMidAnchorValid(midAnchor, ip, ua, anchorMid, { secret: anchorSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1e3 }) : false;
      }
      if (autoInject && options.siteKey) {
        runtimeGlobal2.__sg_trustedClient = false;
        try {
          if (options.degradedAvailability?.mode === "public-last-known" && (options.degradedAvailability.allowPaths ?? []).includes(path) && core.isAllowlisted(path)) return next();
          siteFlags = await getConfig(options.siteKey, internalUrl, signingSecret);
          const degraded = options.degradedAvailability;
          const availability = getConfigAvailability(options.siteKey, internalUrl, signingSecret, degraded?.maxStaleMs);
          if (degraded?.onStateChange && availability !== previousAvailability) {
            if (previousAvailability === "degraded" || previousAvailability === "expired" || previousAvailability === "rejected") {
              degraded.onStateChange(availability === "fresh" ? "recovered" : availability === "expired" ? "expired" : "degraded");
            } else if (availability !== "fresh") {
              degraded.onStateChange(availability === "expired" ? "expired" : "degraded");
            }
          }
          previousAvailability = availability === "recovered" ? "fresh" : availability;
          const allowDegraded = canServeDegradedPath(path, degraded ?? {}, availability);
          if (allowDegraded) {
            if (res.setHeader) res.setHeader("X-Shugoi-Availability", "degraded");
            return next();
          }
          if (availability !== "fresh") {
            if (res.setHeader) {
              res.setHeader("X-Shugoi-Availability", availability);
              res.setHeader("Cache-Control", "no-store");
              res.setHeader("Retry-After", "30");
            }
            if (res.status) res.status(503);
            if (res.type) res.type("text/plain");
            const unavailable = "Shugoi configuration is temporarily unavailable.";
            if (res.end) res.end(unavailable);
            else if (res.send) res.send(unavailable);
            return;
          }
          const configuredFlags = siteFlags.flags ?? {};
          const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
          if (configuredFlags.enableHeadlessCheck === true && ua && headlessPatterns.some((pattern) => pattern.test(ua))) {
            if (res.status) res.status(options.blockStatus ?? 403);
            if (res.type) res.type("text/plain");
            if (res.end) res.end(BLOCK_PAGE);
            else if (res.send) res.send(BLOCK_PAGE);
            return;
          }
          const skipPaths = siteFlags.skipPaths;
          if (skipPaths?.some((p) => path === p)) {
            try {
              if (!options.renderSkipPath) return next();
              const html = await options.renderSkipPath(path);
              if (res.setHeader) res.setHeader("Content-Type", "text/html; charset=utf-8");
              if (res.send) res.send(html);
              else if (res.end) res.end(html);
              return;
            } catch (ssrErr) {
              return next();
            }
          }
        } catch {
          const degraded = options.degradedAvailability;
          const availability = getConfigAvailability(options.siteKey, internalUrl, signingSecret, degraded?.maxStaleMs);
          if (canServeDegradedPath(path, degraded ?? {}, availability)) {
            if (res.setHeader) res.setHeader("X-Shugoi-Availability", "degraded");
            return next();
          }
          if (res.setHeader) {
            res.setHeader("X-Shugoi-Availability", availability);
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Retry-After", "30");
          }
          if (res.status) res.status(503);
          if (res.type) res.type("text/plain");
          const unavailable = "Shugoi configuration is temporarily unavailable.";
          if (res.end) res.end(unavailable);
          else if (res.send) res.send(unavailable);
          return;
        }
      }
      const decision = await core.evaluate(createEvaluateContext(path, ua, ip, {
        mid: null,
        host: typeof req.headers?.["host"] === "string" ? req.headers.host : null,
        acceptLanguage: typeof req.headers?.["accept-language"] === "string" ? req.headers["accept-language"] : null,
        secFetchDest: typeof req.headers?.["sec-fetch-dest"] === "string" ? req.headers["sec-fetch-dest"] : null,
        secFetchMode: typeof req.headers?.["sec-fetch-mode"] === "string" ? req.headers["sec-fetch-mode"] : null,
        sgProof: typeof req.query?.sg_proof === "string" ? req.query.sg_proof : null,
        sgOk: typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] ?? null : null,
        sgAuthorized: typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_authorized=([^;]+)/)?.[1] ?? null : null,
        sgMidAnchor: midAnchor,
        forwardedPrefix: typeof req.headers?.["x-forwarded-prefix"] === "string" ? req.headers["x-forwarded-prefix"] : null
      }));
      if (decision) {
        if (decision.headers) {
          for (const [k, v] of Object.entries(decision.headers)) {
            if (res.setHeader) res.setHeader(k, v);
          }
        }
        if (res.status) res.status(decision.status);
        if (decision.headers && decision.headers["Content-Type"]) {
          if (res.setHeader) res.setHeader("Content-Type", decision.headers["Content-Type"]);
        } else if (res.setHeader) {
          res.setHeader("Content-Type", decision.contentType);
        } else if (res.type) {
          res.type(decision.contentType);
        }
        if (decision.body) {
          if (typeof decision.body === "string" && decision.body.includes("__sg_wlcRequest") && res.setHeader) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
          }
          if (res.send) res.send(decision.body);
          else if (res.end) res.end(decision.body);
        } else if (res.end) {
          res.end();
        }
        return;
      }
      const sgProofQ = typeof req.query?.sg_proof === "string" ? req.query.sg_proof : void 0;
      if (sgProofQ && res.setHeader) {
        const okCookie2 = core.sgOkCookie(sgProofQ, ip, ua);
        if (okCookie2) res.setHeader("Set-Cookie", okCookie2);
      }
      const isBot = await core.isTrustedBot(ua, ip) || core.isWhitelistedBot(ua);
      const okCookie = typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] ?? null : null;
      if (okCookie && core.isOkCookieValid(okCookie, ip, ua)) {
        runtimeGlobal2.__sg_trustedClient = true;
      }
      const crawlerReadable = siteFlags?.flags?.enableHeadlessCheck === false;
      if (autoInject && splitRender && !crawlerReadable && !isBot && !core.isAllowlisted(path)) {
        let injected = false;
        const originalSend = res.send?.bind(res);
        const originalEnd = res.end?.bind(res);
        const doInject = async (body) => {
          if (injected) return body ?? "";
          if (typeof body === "string") {
            const ct = res.getHeader ? res.getHeader("content-type") : void 0;
            if (!ct || String(ct).includes("text/html")) {
              try {
                body = await injectGuardScripts(body, options.siteKey, baseUrl, void 0, restrictedAccess, signingSecret, req, void 0, reqLocale, void 0, midAnchorOk, "./__shugoi/render", renderTransport);
              } catch (e) {
                core.log("inject error:", String(e));
              }
              injected = true;
            }
          }
          return body ?? "";
        };
        if (originalSend) {
          res.send = function(body) {
            return doInject(body).then((b) => originalSend?.(b) ?? res);
          };
        }
        if (originalEnd) {
          res.end = function(chunk, encoding, cb) {
            doInject(chunk).then((b) => {
              if (cb) originalEnd?.(b, encoding, cb);
              else originalEnd?.(b, encoding);
            });
            return this;
          };
        }
      }
      next();
    } catch (err) {
      core.log("Unhandled error:", String(err));
      next();
    }
  };
  return async (req, res, next) => middleware(req, res, next);
}
function createShugoiPlugin(options) {
  const core = createCore(options);
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? "https://api.shugoi.com/api/v1";
  if (options.multiProcess) enableDiskStore(true);
  const plugin = async function shugoiPlugin(instance) {
    const fastify = instance;
    if (!fastify || typeof fastify.addHook !== "function" || typeof fastify.get !== "function" || typeof fastify.head !== "function") {
      throw new TypeError("Shugoi requires a Fastify instance");
    }
    fastify.addHook("onRequest", async (...args) => {
      const reply = args[1];
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
    if (options.availabilityDiagnostics === true) {
      fastify.get("/__shugoi/availability", async (_request, reply) => {
        const state = getConfigAvailability(options.siteKey, options.internalUrl || baseUrl, signingSecret, options.degradedAvailability?.maxStaleMs);
        reply.header("cache-control", "no-store").header("x-content-type-options", "nosniff").type("application/json; charset=utf-8").send({ state, checkedAt: Math.floor(Date.now() / 1e3) * 1e3 });
      });
    }
    fastify.get("/__shugoi/render", async (request, reply) => {
      const { renderResponseData: renderResponseData2, injectReferrerPolicy: injectReferrerPolicy2 } = await Promise.resolve().then(() => (init_render(), render_exports));
      const ip = requestIp(request);
      const data = await renderResponseData2(request.query.token || "", void 0, options.internalUrl || baseUrl, request.query.mid || "", request.query.grant || "", ip, options.siteKey, signingSecret);
      if (data.html) data.html = injectReferrerPolicy2(data.html);
      reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
      reply.header("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
      reply.header("Pragma", "no-cache");
      reply.send(data);
    });
    fastify.head("/__shugoi/healthcheck", async (_request, reply) => reply.send(""));
    fastify.addHook("preHandler", async (...args) => {
      const request = args[0];
      const reply = args[1];
      try {
        const path = request.url.split("?")[0] ?? "/";
        if (path.endsWith("/__shugoi/render") || path.endsWith("/__shugoi/healthcheck") || path === "/__shugoi/availability") return;
        if (options.degradedAvailability?.mode === "public-last-known" && (options.degradedAvailability.allowPaths ?? []).includes(path) && core.isAllowlisted(path)) return;
        await getConfig(options.siteKey, options.internalUrl || baseUrl, signingSecret);
        const availability = getConfigAvailability(options.siteKey, options.internalUrl || baseUrl, signingSecret, options.degradedAvailability?.maxStaleMs);
        const canContinueDegraded = canServeDegradedPath(path, options.degradedAvailability ?? {}, availability);
        if (availability !== "fresh" && !canContinueDegraded) {
          return reply.code(503).header("cache-control", "no-store").header("retry-after", "30").header("x-shugoi-availability", availability).type("text/plain").send("Shugoi configuration is temporarily unavailable.");
        }
        if (canContinueDegraded) {
          return reply.header("x-shugoi-availability", "degraded");
        }
        const ua = request.headers["user-agent"] ?? "";
        const ip = requestIp(request);
        const decision = await core.evaluate(createEvaluateContext(path, ua, ip, {
          mid: null,
          host: request.headers?.host ?? null,
          acceptLanguage: request.headers["accept-language"] ?? null,
          secFetchDest: request.headers["sec-fetch-dest"] ?? null,
          secFetchMode: request.headers["sec-fetch-mode"] ?? null,
          sgProof: request.query && typeof request.query?.sg_proof === "string" ? request.query.sg_proof : null,
          sgOk: typeof request.headers.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] ?? null : null,
          sgAuthorized: typeof request.headers.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_authorized=([^;]+)/)?.[1] ?? null : null,
          sgMidAnchor: typeof request.headers.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null,
          forwardedPrefix: typeof request.headers["x-forwarded-prefix"] === "string" ? request.headers["x-forwarded-prefix"] : null
        }));
        if (decision) {
          if (decision.headers) {
            for (const [k, v] of Object.entries(decision.headers)) reply.header(k, v);
          }
          return reply.code(decision.status).type(decision.contentType === "text/html" ? "text/html" : "text/plain").send(decision.body);
        }
        if (typeof request.query?.sg_proof === "string") {
          const okCookie = core.sgOkCookie(request.query.sg_proof, ip, ua);
          if (okCookie) reply.header("Set-Cookie", okCookie);
        }
      } catch (err) {
        core.log("preHandler error:", String(err));
        return reply.code(503).type("application/json").send({ error: "protection_unavailable" });
      }
    });
    fastify.addHook("onSend", async (...args) => {
      const request = args[0];
      const reply = args[1];
      const payload = args[2] ?? "";
      if (typeof payload !== "string") return payload;
      const path = request.url.split("?")[0] ?? "/";
      if (path === "/__sg_challenge" || path.endsWith("/__shugoi/render") || path.endsWith("/__shugoi/healthcheck")) return payload;
      if (reply.statusCode !== 200) return payload;
      const ua = typeof request.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : "";
      if (core.isWhitelistedBot(ua)) return payload;
      const ct = reply.getHeader?.("content-type");
      if (!ct || String(ct).includes("text/html")) {
        const pluginLocale = resolveLocale(options.locale, typeof request.headers?.["accept-language"] === "string" ? request.headers?.["accept-language"] : void 0);
        const pluginIp = requestIp(request);
        const pluginAnchor = typeof request.headers?.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
        const pluginAnchorSecret = signingSecret;
        let pluginMidAnchorOk;
        if (pluginAnchorSecret) {
          const pluginAnchorMid = pluginAnchor?.split(":")[3] ?? "";
          pluginMidAnchorOk = pluginAnchor && /^[a-f0-9]{64}$/.test(pluginAnchorMid) ? isMidAnchorValid(pluginAnchor, pluginIp, ua, pluginAnchorMid, { secret: pluginAnchorSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1e3 }) : false;
        }
        return await injectGuardScripts(payload, options.siteKey, baseUrl, void 0, restrictedAccess, signingSecret, { url: path }, void 0, pluginLocale, void 0, pluginMidAnchorOk);
      }
      return payload;
    });
  };
  Object.defineProperty(plugin, /* @__PURE__ */ Symbol.for("skip-override"), { value: true });
  Object.defineProperty(plugin, /* @__PURE__ */ Symbol.for("fastify.display-name"), { value: "shugoi" });
  return plugin;
}

// src/check-license.ts
async function checkLicense(options) {
  const baseUrl = options.baseUrl ?? "https://api.shugoi.com/api/v1";
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
    throw new ShugoiError("api_unreachable", "Shugoi API unreachable", String(err));
  }
}

// src/scripts.ts
init_render();
async function scriptTags(options) {
  if (!options.signingSecret) throw new Error("Shugoi requires an explicit site signing secret");
  const base = options.baseUrl ?? "https://api.shugoi.com/api/v1";
  const key = options.siteKey;
  const ts = Date.now();
  const signed = signToken(key, ts, options.signingSecret);
  const skel = await generateSkeleton(key, signed.token, base, options.restrictedAccess ?? false, options.whitelist, void 0, void 0, void 0, void 0, options.signingSecret);
  return { guardDetect: skel, guard: "", whitelistConfig: "", token: signed.token };
}

// src/validate-site-key.ts
async function validateSiteKey(options) {
  const baseUrl = options.baseUrl ?? "https://api.shugoi.com/api/v1";
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
    throw new ShugoiError("api_unreachable", "Shugoi API unreachable", String(err));
  }
}

// src/index.ts
init_availability();

// src/obfuscate.ts
var import_crypto2 = __toESM(require("crypto"), 1);
var RENAMES = {
  buildOverlay: "_wf",
  checkNotice: "_wg",
  hex: "_wh",
  stable: "_wi"
};
var KEYWORDS = /* @__PURE__ */ new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "await",
  "async",
  "of",
  "undefined"
]);
var GLOBALS = /* @__PURE__ */ new Set([
  "arguments",
  "window",
  "document",
  "navigator",
  "screen",
  "location",
  "history",
  "performance",
  "console",
  "crypto",
  "Date",
  "Math",
  "JSON",
  "Array",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "Uint8Array",
  "Int8Array",
  "Uint16Array",
  "Int16Array",
  "Uint32Array",
  "Int32Array",
  "Float32Array",
  "Float64Array",
  "ArrayBuffer",
  "Blob",
  "Worker",
  "URL",
  "Image",
  "XMLHttpRequest",
  "RTCPeerConnection",
  "EventSource",
  "MutationObserver",
  "OffscreenCanvas",
  "AudioContext",
  "webkitAudioContext",
  "FontFace",
  "TextEncoder",
  "TextDecoder",
  "Screen",
  "Navigator",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "setImmediate",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
  "escape",
  "unescape",
  "btoa",
  "atob",
  "fetch",
  "AbortSignal",
  "Promise",
  "Error",
  "RegExp",
  "globalThis",
  "self",
  "top",
  "parent",
  "opener",
  "frames",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "matchMedia",
  "getComputedStyle",
  "localStorage",
  "sessionStorage",
  "Intl",
  "DOMException",
  "Event",
  "CustomEvent",
  "encodeURIComponent",
  "Function",
  "Proxy",
  "Reflect"
]);
var RESERVED_PREFIXES = ["__sg", "sg_", "SG_"];
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
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
    enc += cc.toString(16).padStart(4, "0");
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
function isRegexStart(code, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j] ?? "")) j--;
  if (j < 0) return true;
  const c = code[j] ?? "";
  if ("([{=,:;!&|?+-*%<>^~".includes(c)) return true;
  if (/[a-zA-Z0-9_$)]/.test(c)) {
    let k = j;
    while (k >= 0 && /[a-zA-Z0-9_$]/.test(code[k] ?? "")) k--;
    const word = code.slice(k + 1, j + 1);
    return ["return", "typeof", "instanceof", "in", "of", "case", "delete", "void", "new", "do", "else", "yield", "await"].includes(word);
  }
  return false;
}
function templateValue(seg) {
  return seg.replace(/\\(['"\\bfnrtv0`$])/g, (_, c) => ({ "'": "'", '"': '"', "\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "	", "v": "\v", "0": "\0", "`": "`", "$": "$" })[c] ?? c).replace(/\\(u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/g, (_, __, ubrace, u4, x2) => {
    const code = ubrace ? parseInt(ubrace, 16) : u4 ? parseInt(u4, 16) : parseInt(x2, 16);
    return String.fromCodePoint(code);
  });
}
function encryptTemplate(code, start, key, dec) {
  let i = start + 1;
  const parts = [];
  let seg = "";
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === "\\") {
      seg += ch + (code[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch === "`") {
      i++;
      break;
    }
    if (ch === "$" && code[i + 1] === "{") {
      if (seg) {
        parts.push({ t: "str", v: seg });
        seg = "";
      }
      let depth = 1;
      let expr = "";
      i += 2;
      while (i < n && depth > 0) {
        const c = code[i];
        if (c === "\\") {
          expr += c + (code[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (c === "'" || c === '"' || c === "`") {
          const q = c;
          expr += c;
          i++;
          while (i < n && code[i] !== q) {
            if (code[i] === "\\") {
              expr += code[i] + (code[i + 1] ?? "");
              i += 2;
              continue;
            }
            expr += code[i];
            i++;
          }
          if (i < n) {
            expr += q;
            i++;
          }
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        expr += c;
        i++;
      }
      parts.push({ t: "expr", v: expr });
      continue;
    }
    seg += ch;
    i++;
  }
  if (seg) parts.push({ t: "str", v: seg });
  if (parts.length === 0) return { text: "(" + dec + '(""))', next: i };
  let text = "";
  for (let p = 0; p < parts.length; p++) {
    if (p > 0) text += "+";
    if (parts[p].t === "str") {
      text += "(" + dec + '("' + xorEncrypt(templateValue(parts[p].v), key) + '"))';
    } else {
      text += "(" + parts[p].v + ")";
    }
  }
  return { text, next: i };
}
function encryptStrings(code, key, dec = "_D") {
  let r = "", i = 0;
  while (i < code.length) {
    if (code[i] === "`") {
      const out = encryptTemplate(code, i, key, dec);
      r += out.text;
      i = out.next;
    } else if (code[i] === "/" && isRegexStart(code, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < code.length) {
        const ch = code[i];
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) {
          i++;
          break;
        } else if (ch === "\n") break;
        i++;
      }
      const slashEnd = i;
      let flagsEnd = slashEnd;
      while (flagsEnd < code.length && /[dgimsuvy]/.test(code[flagsEnd] ?? "")) flagsEnd++;
      const pattern = code.slice(start + 1, slashEnd - 1);
      const flags = code.slice(slashEnd, flagsEnd);
      r += "(new RegExp((" + dec + '("' + xorEncrypt(pattern, key) + '"))' + (flags ? ",(" + dec + '("' + xorEncrypt(flags, key) + '"))' : "") + "))";
      i = flagsEnd;
    } else if (code[i] === "'" || code[i] === '"') {
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
        const enc = "(" + dec + '("' + xorEncrypt(val, key) + '"))';
        let k = i - 1;
        while (k >= 0 && /\s/.test(code[k] ?? "")) k--;
        let f = j + 1;
        while (f < code.length && /\s/.test(code[f] ?? "")) f++;
        const keyPos = (code[k] === "{" || code[k] === ",") && code[f] === ":";
        if (keyPos) {
          r += "[" + enc + "]:";
          i = f + 1;
        } else {
          r += enc;
          i = j + 1;
        }
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
  let r = "";
  let i = 0;
  const n = s.length;
  while (i < n) {
    const ch = s[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const q = ch;
      const start = i;
      i++;
      while (i < n) {
        if (s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i] === q) {
          i++;
          break;
        }
        i++;
      }
      r += s.slice(start, i);
      continue;
    }
    if (ch === "/" && s[i + 1] === "/") {
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "/" && isRegexStart(s, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < n) {
        const c = s[i];
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          i++;
          break;
        } else if (c === "\n") break;
        i++;
      }
      r += s.slice(start, i);
      continue;
    }
    r += ch;
    i++;
  }
  return r.replace(/\n{3,}/g, "\n\n");
}
function escapeClosingTags(code) {
  return code.replace(/<\/(script|style)/gi, "<\\/$1");
}
function fixComputedProperties(code, dec = "_D") {
  const decEsc = dec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return code.replace(new RegExp("([{,])(\\s*)\\(" + decEsc + '\\("([^"]*)"\\)\\)(\\s*):', "g"), "$1$2[" + dec + '("$3")]$4:');
}
function deriveKey(seed) {
  return import_crypto2.default.createHash("sha256").update(seed + "sg_val_v1").digest("hex").slice(0, 32);
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
function injectDecoder(hexKey, dec = "_D", cacheName = "_Dx") {
  return buildDecoderStmt(hexKey, dec, cacheName);
}
function buildDecoderStmt(hexKey, dec, cacheName) {
  const kb = hexToBytes(hexKey);
  const ks = kb.map((b) => "\\x" + b.toString(16).padStart(2, "0")).join("");
  return "var " + cacheName + "=Object.create(null)," + dec + "=function(h){var c=" + cacheName + '[h];if(c!==void 0)return c;var k="' + ks + '",r="";for(var i=0;i<h.length;i+=4){r+=String.fromCharCode(parseInt(h.substr(i,4),16)^k.charCodeAt((i/4)%' + kb.length + "))}return " + cacheName + "[h]=r};";
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
function createRng(seed) {
  let s = seed >>> 0 || 1;
  return function next() {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var NAME_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
function shortName(rng, minLen) {
  let n = "";
  const len = minLen + Math.floor(rng() * 4);
  for (let i = 0; i < len; i++) {
    n += NAME_ALPHABET[Math.floor(rng() * NAME_ALPHABET.length)];
  }
  return n;
}
function findIdentifiers(code) {
  const spans = [];
  let i = 0;
  const n = code.length;
  let prevSig = "";
  while (i < n) {
    const ch = code[i];
    if (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      i++;
      while (i < n) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === q) {
          i++;
          break;
        }
        i++;
      }
      prevSig = "str";
      continue;
    }
    if (ch === "`") {
      i++;
      while (i < n) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === "`") {
          i++;
          break;
        }
        if (code[i] === "$" && code[i + 1] === "{") {
          prevSig = "$";
          i++;
          continue;
        }
        i++;
      }
      prevSig = "str";
      continue;
    }
    if (ch === "/") {
      const exprStart = prevSig === "" || "=([{,;:?!&|+-*%^~<>".indexOf(prevSig) >= 0 || prevSig === "return" || prevSig === "typeof" || prevSig === "new" || prevSig === "case" || prevSig === "delete" || prevSig === "void" || prevSig === "in" || prevSig === "of" || prevSig === "instanceof" || prevSig === "throw";
      if (exprStart) {
        i++;
        let inClass = false;
        while (i < n) {
          if (code[i] === "\\") {
            i += 2;
            continue;
          }
          if (code[i] === "[") inClass = true;
          else if (code[i] === "]") inClass = false;
          if (code[i] === "/" && !inClass) {
            i++;
            break;
          }
          i++;
        }
        while (i < n && /[a-z]/i.test(code[i])) i++;
        prevSig = "str";
        continue;
      }
      prevSig = "/";
      i++;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(code[i])) i++;
      const value = code.slice(start, i);
      let hasUnicodeEscape = false;
      while (code[i] === "\\" && code[i + 1] === "u") {
        hasUnicodeEscape = true;
        if (code[i + 2] === "{") {
          let k = i + 3;
          while (k < n && code[k] !== "}") k++;
          i = k + 1;
        } else {
          i += 6;
        }
      }
      const isProp = prevSig === ".";
      const isKey = code[i] === ":" && (prevSig === "{" || prevSig === ",");
      const isKeyword = KEYWORDS.has(value);
      const isGlobal = GLOBALS.has(value);
      const isReserved = RESERVED_PREFIXES.some((p) => value.startsWith(p));
      if (!isProp && !isKeyword && !isGlobal && !isReserved && !isKey && !hasUnicodeEscape) {
        spans.push({ start, end: i, value });
      }
      prevSig = KEYWORDS.has(value) ? value : "id";
      continue;
    }
    if (/[0-9]/.test(ch)) {
      while (i < n && /[0-9a-zA-Z.]/.test(code[i])) i++;
      prevSig = "num";
      continue;
    }
    if (ch === ".") {
      prevSig = ".";
      i++;
      continue;
    }
    prevSig = ch;
    i++;
  }
  return spans;
}
function rotateIdentifiers(code, seed) {
  const spans = findIdentifiers(code);
  const rng = createRng(hashStr(seed));
  const map = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  function nextName(orig) {
    const minLen = 2 + hashStr(orig) % 5;
    let name;
    let guard = 0;
    do {
      name = "_" + shortName(rng, minLen);
      guard++;
    } while (used.has(name) && guard < 500);
    used.add(name);
    return name;
  }
  let out = "";
  let last = 0;
  for (const s of spans) {
    out += code.slice(last, s.start);
    let name = map.get(s.value);
    if (!name) {
      name = nextName(s.value);
      map.set(s.value, name);
    }
    out += name;
    last = s.end;
  }
  out += code.slice(last);
  return out;
}
function isValidJavaScript(code) {
  try {
    new Function(code);
    return true;
  } catch {
    return false;
  }
}
function splitTopLevelStatements(code) {
  const stmts = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === "/" && code[i + 1] === "/") {
      while (i < n && code[i] !== "\n") {
        cur += code[i];
        i++;
      }
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      cur += "/*";
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) {
        cur += code[i];
        i++;
      }
      cur += "*/";
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      const q = ch;
      cur += ch;
      i++;
      while (i < n) {
        cur += code[i];
        if (code[i] === "\\") {
          i++;
          cur += code[i] ?? "";
          i++;
          continue;
        }
        if (code[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
      cur += ch;
      i++;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      cur += ch;
      i++;
      if (ch === "}" && depth === 0) {
        let j = i;
        while (j < n && (code[j] === " " || code[j] === "	" || code[j] === "\n" || code[j] === "\r")) j++;
        const nxt = code[j];
        const cont = /^(catch|else|finally|while)\b/.test(code.slice(j, j + 9));
        if (nxt !== void 0 && nxt !== ";" && nxt !== "}" && !cont && /[A-Za-z_$(]/.test(nxt)) {
          const trimmed2 = cur.trim();
          if (trimmed2) stmts.push(trimmed2);
          cur = "";
        }
      }
      continue;
    }
    if (ch === ";" && depth === 0) {
      const trimmed2 = cur.trim();
      if (trimmed2) stmts.push(trimmed2);
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  const trimmed = cur.trim();
  if (trimmed) stmts.push(trimmed);
  return stmts;
}
function isDeclarationStatement(stmt) {
  return /^(var|let|const|function)\b/.test(stmt.trim());
}
function deferExecution(code, seed, qName = "_q", iName = "_i") {
  const stmts = splitTopLevelStatements(code);
  if (stmts.length < 2) return code;
  const decls = [];
  const execs = [];
  for (const s of stmts) {
    if (isDeclarationStatement(s)) decls.push(s);
    else execs.push(s);
  }
  const rng = seededRng(seed);
  for (let i = decls.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = decls[i];
    decls[i] = decls[j] ?? "";
    decls[j] = t ?? "";
  }
  const order = execs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i];
    order[i] = order[j] ?? 0;
    order[j] = t ?? 0;
  }
  const lines = ["var " + qName + "=[];"];
  for (const d of decls) lines.push(d + ";");
  for (const o of order) {
    lines.push(qName + "[" + o + "]=function(){" + (execs[o] ?? "") + "};");
  }
  lines.push("for(var " + iName + "=0;" + iName + "<" + qName + ".length;" + iName + "++){if(" + qName + "[" + iName + "]){try{" + qName + "[" + iName + "]()}catch(_sg_e){window.__sg_deferError=String(_sg_e&&_sg_e.message||_sg_e)}}}");
  return lines.join("");
}
function hashAllProperties(code, dec, key) {
  let r = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === "`") {
      const start = i;
      i++;
      while (i < n) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === "`") {
          i++;
          break;
        }
        i++;
      }
      r += code.slice(start, i);
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      const start = i;
      i++;
      while (i < n) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === q) {
          i++;
          break;
        }
        i++;
      }
      r += code.slice(start, i);
      continue;
    }
    if (ch === "/" && isRegexStart(code, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < n) {
        const c = code[i];
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          i++;
          break;
        } else if (c === "\n") break;
        i++;
      }
      r += code.slice(start, i);
      continue;
    }
    if (ch === "." && i + 1 < n && /[A-Za-z_$]/.test(code[i + 1])) {
      const prev = code[i - 1] ?? "";
      if (/[0-9]/.test(prev) || prev === ".") {
        r += ch;
        i++;
        continue;
      }
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const prop = code.slice(i + 1, j);
      if (prop) {
        r += "[" + dec + '("' + xorEncrypt(prop, key) + '")]';
        i = j;
        continue;
      }
      r += ch;
      i++;
      continue;
    }
    r += ch;
    i++;
  }
  return r;
}
function navify(code, seed, dec = "_D", cacheName = "_Dx", navName = "nav") {
  const key = deriveKey(seed);
  const globalsToHide = [
    "fetch",
    "document",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "location",
    "history",
    "JSON",
    "Object",
    "String",
    "Number",
    "Math",
    "Date",
    "encodeURIComponent",
    "decodeURIComponent",
    "TextEncoder",
    "Uint8Array",
    "navigator",
    "screen",
    "crypto",
    "performance",
    "console",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "Image",
    "FontFace",
    "Blob",
    "URL",
    "Worker",
    "XMLHttpRequest",
    "RTCPeerConnection",
    "EventSource",
    "MutationObserver",
    "OffscreenCanvas",
    "AudioContext",
    "webkitAudioContext",
    "btoa",
    "atob",
    "escape",
    "unescape",
    "parseInt",
    "parseFloat",
    "AbortSignal",
    "Promise",
    "Error",
    "RegExp",
    "window"
  ];
  let r = code;
  const nativeCalls = [
    "fetch",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "btoa",
    "atob",
    "escape",
    "unescape",
    "encodeURIComponent",
    "decodeURIComponent",
    "parseInt",
    "parseFloat"
  ];
  for (const g of nativeCalls) {
    const callRe = new RegExp("(?<![.$\\w])" + g + "(?=\\s*\\()", "g");
    r = r.replace(callRe, "(0," + navName + "[" + dec + '("' + xorEncrypt(g, key) + '")])');
  }
  for (const g of globalsToHide) {
    const re = new RegExp("(?<![.$\\w])" + g + "(?![\\w$])", "g");
    r = r.replace(re, navName + "[" + dec + '("' + xorEncrypt(g, key) + '")]');
  }
  r = hashAllProperties(r, dec, key);
  const seeds = globalsToHide.map((g) => "try{" + navName + "[" + dec + '("' + xorEncrypt(g, key) + '")]=' + g + "}catch(_nav_e){}").join("");
  const preamble = buildDecoderStmt(key, dec, cacheName) + "var " + navName + "={window:window};try{var _nav_i;for(_nav_i in window)" + navName + "[_nav_i]=window[_nav_i]}catch(_nav_e){};" + seeds + ";";
  const decoys = 1 + hashStr(seed + "decoy") % 3;
  const decoyLines = [];
  for (let d = 0; d < decoys; d++) {
    const v = "_" + shortName(createRng(hashStr(seed + "dv" + d)), 2);
    const n = 1 + hashStr(seed + "dn" + d) % 3;
    decoyLines.push("var " + v + "=" + n + ";");
  }
  const block = decoyLines.join("") + preamble;
  const stmts = splitTopLevelStatements(r);
  stmts.unshift(block);
  return stmts.join(";") + ";";
}
function _sgExtractBalancedBody(out, braceStart) {
  let depth = 0, inStr = null;
  for (let j = braceStart; j < out.length; j++) {
    const ch = out[j];
    if (inStr) {
      if (ch === "\\") {
        j++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}
function _sgExtractWorkers(code) {
  const map = [];
  const re = /["'`]\(["'`]\s*\+\s*([A-Za-z_$][\w$]*)\s*\+\s*["'`]\)\(\)["'`]/g;
  const uses = [];
  let mm;
  while (mm = re.exec(code)) {
    const name = mm[1];
    if (name) uses.push({ name, pos: mm.index });
  }
  let out = code, shift = 0;
  for (const u of uses) {
    const name = u.name, usagePos = u.pos + shift;
    const region = out.slice(0, usagePos);
    const cands = [];
    const reDef = new RegExp("(?:\\bfunction\\s+" + name + "\\s*\\(|[=,;([{\\s]" + name + "\\s*=\\s*function\\b)", "g");
    let dm;
    while (dm = reDef.exec(region)) cands.push(dm.index + dm[0].length);
    for (let c = cands.length - 1; c >= 0; c--) {
      const braceStart = out.indexOf("{", cands[c]);
      if (braceStart < 0 || braceStart >= usagePos) continue;
      const end = _sgExtractBalancedBody(out, braceStart);
      if (end < 0) continue;
      const body = out.slice(braceStart, end + 1);
      if (body.indexOf("self.") < 0 && body.indexOf("postMessage") < 0 && body.indexOf("onmessage") < 0) continue;
      const marker = 91827364e4 + map.length;
      map.push(body);
      const repl = "{return " + marker + "}";
      out = out.slice(0, braceStart) + repl + out.slice(end + 1);
      shift += repl.length - body.length;
      break;
    }
  }
  return { code: out, map };
}
function _sgRestoreWorkers(code, map) {
  for (let i = 0; i < map.length; i++) {
    const marker = 91827364e4 + i;
    const body = map[i];
    if (body !== void 0) {
      code = code.replace(new RegExp("\\{\\s*return\\s+" + marker + "\\s*;?\\s*\\}"), () => body);
    }
  }
  return code;
}
function applyBootObfuscation(code, seed) {
  let r = stripComments(code);
  const _wk = _sgExtractWorkers(r);
  r = _wk.code;
  r = stripTrace(r);
  r = rotateIdentifiers(r, seed);
  r = deferExecution(r, seed);
  const encKey = deriveKey(seed);
  const decName = "_" + shortName(createRng(hashStr(seed + "dec")), 2);
  const cacheName = "_" + shortName(createRng(hashStr(seed + "cache")), 2);
  const navName = "_" + shortName(createRng(hashStr(seed + "nav")), 2);
  r = encryptStrings(r, encKey, decName);
  r = navify(r, seed, decName, cacheName, navName);
  r = _sgRestoreWorkers(r, _wk.map);
  r = escapeClosingTags(r);
  r = fixComputedProperties(r, decName);
  if (!isValidJavaScript(r)) return code;
  return r;
}
function applyObfuscation(code, seed) {
  let r = stripComments(code);
  r = stripTrace(r);
  r = renameFunctions(r, seed);
  r = shuffleCode(r, seed);
  const encKey = deriveKey(seed);
  r = encryptStrings(r, encKey);
  r = injectDecoder(encKey) + r;
  r = escapeClosingTags(r);
  r = fixComputedProperties(r);
  return r;
}
function isValidJs(code) {
  return isValidJavaScript(code);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BLOCK_PAGE,
  DEFAULT_BOT_WHITELIST,
  DEFAULT_HEADLESS_PATTERNS,
  ShugoiError,
  __clearConfigCache,
  __clearGuardCache,
  applyBootObfuscation,
  applyObfuscation,
  attachShugoiWebSocket,
  availabilityState,
  buildCsp,
  canServeDegradedPath,
  checkLicense,
  createShugoiMiddleware,
  createShugoiPlugin,
  decodeInvisibleBootstrapPath,
  encodeInvisibleBootstrapPath,
  fetchWhitelistForSiteKey,
  generateSkeleton,
  getConfigAvailability,
  handleRender,
  injectGuardScripts,
  isValidJs,
  mergeCsp,
  readBootstrap,
  readLatestBootstrap,
  renderResponseData,
  scriptTags,
  signAvailabilitySnapshot,
  signToken,
  storeBootstrap,
  storeHtml,
  validateSiteKey,
  verifyAvailabilitySnapshot,
  verifyRenderGrant
});
