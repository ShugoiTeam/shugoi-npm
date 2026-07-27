import { NextResponse } from "next/server.js";
import type { NextRequest } from "next/server.js";
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

// ── Config ──
const TOKEN_DIR = join(tmpdir(), "shugoi-render");
const TOKEN_TTL = 120000;
if (!existsSync(TOKEN_DIR)) try { mkdirSync(TOKEN_DIR, { recursive: true }); } catch {}
setInterval(() => {
  try { for (const f of readdirSync(TOKEN_DIR)) {
    const p = join(TOKEN_DIR, f);
    if (Date.now() - parseInt(f.split("_")[0] || "0") > TOKEN_TTL) try { unlinkSync(p); } catch {}
  }} catch {}
}, 30000).unref();

export interface ShugoiNextOptions {
  siteKey: string;
  baseUrl?: string;
  allowlist?: string[];
  whitelist?: string[];
  signingSecret?: string;
}

const DEFAULT_HEADLESS = [
  /^curl/i, /^wget/i, /^python/i, /^Go-http-client/i,
  /^Java\//, /HTTPie/i, /^node-fetch/i, /axios/i,
  /^okhttp/i, /^scrapy/i, /PowerShell/i, /WinHttp/i,
];

const DEFAULT_BOT_WHITELIST = [
  /Googlebot/i, /Bingbot/i, /Slurp/i, /DuckDuckBot/i, /YandexBot/i,
  /FacebookExternalHit/i, /Twitterbot/i, /LinkedInBot/i, /Applebot/i,
  /AhrefsBot/i, /SemrushBot/i,
];

const BLOCK_PAGE = [
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
  "+---------------------------------------------+",
].join('\n') + '\n';

function signToken(siteKey: string, timestamp: number, secretOverride?: string) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!secret) return { token: '' };
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { token: payload + ":" + sig };
}

function loadAssets(root: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(join(root, "lib", "guard-assets.json"), "utf-8"));
  } catch { return {}; }
}

function loadGuardSource(root: string, name: string, assets: Record<string, string>): string {
  try {
    const p = join(root, "scripts", name);
    if (!existsSync(p)) return "";
    let code = readFileSync(p, "utf-8");
    if (assets.favicon) code = code.replaceAll("__SG_FAVICON__", assets.favicon);
    if (assets.brand) code = code.replaceAll("__SG_BRAND_IMG__", assets.brand);
    if (assets.title_tor) code = code.replaceAll("__SG_TITLE_TOR__", assets.title_tor);
    return code;
  } catch { return ""; }
}

let _httpGuardCache: { detect: string | null; guard: string | null; fetchedAt: number } = { detect: null, guard: null, fetchedAt: 0 };

async function fetchGuardsHttp(baseUrl: string, siteKey: string, signingSecret?: string): Promise<{ detect: string; guard: string } | null> {
  const GUARD_CACHE_TTL = 300_000;
  if (_httpGuardCache.detect && _httpGuardCache.guard && Date.now() - _httpGuardCache.fetchedAt < GUARD_CACHE_TTL) {
    return { detect: _httpGuardCache.detect, guard: _httpGuardCache.guard };
  }
  try {
    const cb = Date.now();
    const sk = siteKey || 'cache';
    const secret = signingSecret || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
    const sig = secret ? crypto.createHmac('sha256', secret).update(cb.toString()).digest('hex') : '';
    const [dRes, gRes] = await Promise.all([
      fetch(baseUrl + '/guard-detect?key=' + sk + '&raw=1&cb=' + cb + (sig ? '&sig=' + sig : ''), { signal: AbortSignal.timeout(5000) }),
      fetch(baseUrl + '/guard?key=' + sk + '&raw=1&cb=' + cb + (sig ? '&sig=' + sig : ''), { signal: AbortSignal.timeout(5000) }),
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

function generateBootcode(siteKey: string, config: string, detectCode: string, guardCode: string): string {
  const combined = 'window.__sg_siteKey=' + JSON.stringify(siteKey) +
    ';window.__sg_config=' + config +
    ';try{' + detectCode + '}catch(e){window.__sg_blocked=true}' +
    ';try{' + guardCode + '}catch(e){window.__sg_blocked=true}';
  let enc = "";
  for (let i = 0; i < combined.length; i++) {
    enc += String.fromCodePoint(917504 + combined.charCodeAt(i));
  }
  return '<script>eval([...\'' + enc + '\'].map(function(x){return String.fromCodePoint(x.codePointAt(0)-917504)}).join(\'\'))</script>';
}

function renderResponseData(token: string): { html?: string; blocked?: boolean; error?: string } {
  if (!token || token.length < 16 || token.length > 300) return { error: "not_found" };
  const suffix = token.slice(-16);
  try {
    for (const f of readdirSync(TOKEN_DIR)) {
      if (f.endsWith(suffix)) {
        const html = readFileSync(join(TOKEN_DIR, f), "utf-8");
        return { html };
      }
    }
  } catch {}
  return { blocked: true };
}

export function createShugoiNextMiddleware(options: ShugoiNextOptions) {
  const { siteKey, baseUrl, allowlist, signingSecret } = options;
  const headless = DEFAULT_HEADLESS;
  const root = process.cwd();
  const BASE_URL = baseUrl ?? 'https://shugoi.com/api/v1';

  return async function shugoiMiddleware(request: NextRequest) {
    if (request.headers.get("x-shugoi-internal") === "1")
      return NextResponse.next();

    const path = request.nextUrl.pathname;
    const accept = request.headers.get("accept") || "";

    if (path.endsWith("/__shugoi/render")) {
      const token = request.nextUrl.searchParams.get("token") || "";
      return NextResponse.json(renderResponseData(token));
    }

    if (path.startsWith("/_next/") || path.startsWith("/api/")) return NextResponse.next();
    if (allowlist?.some((p) => path === p || path.startsWith(p + "/"))) return NextResponse.next();

    const ua = request.headers.get("user-agent") || "";

    if (headless.some((p) => p.test(ua))) {
      return new NextResponse(BLOCK_PAGE, { status: 403 });
    }

    if (!accept.includes("text/html")) return NextResponse.next();

    const isBot = DEFAULT_BOT_WHITELIST.some(p => p.test(ua));
    if (isBot) return NextResponse.next();

    try {
      let detectCode = "";
      let guardCode = "";

      // 1. Try disk first
      const assets = loadAssets(root);
      detectCode = loadGuardSource(root, "guard-detect.src.js", assets);
      guardCode = loadGuardSource(root, "guard.src.js", assets);

      // 2. Fallback: HTTP
      if (!detectCode || !guardCode) {
        const httpGuards = await fetchGuardsHttp(BASE_URL, siteKey, signingSecret);
        if (httpGuards) {
          detectCode = httpGuards.detect;
          guardCode = httpGuards.guard;
        }
      }

      if (!detectCode) {
        console.error("[shugoi] WARNING: unable to load guard scripts — protection inactive");
        return NextResponse.next();
      }

      const ts = Date.now();
      const signed = signToken(siteKey, ts, signingSecret);
      const cfg = JSON.stringify({
        enableWhitelist: true, enableVmCheck: true, enableTorCheck: true,
        enableHeadlessCheck: true, enableAntiDetectCheck: true,
        enableContentReplacementCheck: false,
      });

      const internalFetch = await fetch(request.url, {
        headers: { accept: "text/html", "user-agent": "Shugoi", "x-shugoi-internal": "1", cookie: request.headers.get("cookie") || "" },
        signal: AbortSignal.timeout(5000),
      });

      if (internalFetch.ok) {
        const originalHtml = await internalFetch.text();
        writeFileSync(join(TOKEN_DIR, ts + "_" + signed.token.slice(-16)), originalHtml, "utf-8");
      }

      const skeleton = generateBootcode(siteKey, cfg, detectCode, guardCode);
      const fullPage = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
        skeleton +
        '</head><body><div id="__sg_root"></div></body></html>';

      return new NextResponse(fullPage, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch {
      return NextResponse.next();
    }
  };
}
