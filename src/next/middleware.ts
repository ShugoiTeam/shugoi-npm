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

function signToken(siteKey: string, timestamp: number, secretOverride?: string) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || "dev-secret-do-not-use-in-prod";
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
        try { unlinkSync(join(TOKEN_DIR, f)); } catch {}
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

  return async function shugoiMiddleware(request: NextRequest) {
    // Prevent recursion on internal sub-requests
    if (request.headers.get("x-shugoi-internal") === "1")
      return NextResponse.next();

    const path = request.nextUrl.pathname;
    const accept = request.headers.get("accept") || "";

    // Render endpoint
    if (path.endsWith("/__shugoi/render")) {
      const token = request.nextUrl.searchParams.get("token") || "";
      return NextResponse.json(renderResponseData(token));
    }

    // Skip API and static paths
    if (path.startsWith("/_next/") || path.startsWith("/api/")) return NextResponse.next();
    if (allowlist?.some((p) => path === p || path.startsWith(p + "/"))) return NextResponse.next();

    // Headless UA block
    const ua = request.headers.get("user-agent") || "";
    if (headless.some((p) => p.test(ua))) {
      const block = [
        '╔═══════════════════════════════════════════╗',
        '║           BLOCKED BY SHUGOI               ║',
        '╠═══════════════════════════════════════════╣',
        '║  Bots, scrapers and headless clients      ║',
        '║  are blocked by Shugoi protection.        ║',
        '║                                           ║',
        '║  Use a standard browser to access         ║',
        '║  this site.                               ║',
        '║                                           ║',
        '║  ─ contact: support@shugoi.com ─          ║',
        '╚═══════════════════════════════════════════╝',
      ].join("\n") + "\n";
      return new NextResponse(block, { status: 200 });
    }

    // Only process HTML pages
    if (!accept.includes("text/html")) return NextResponse.next();

    try {
      // Read guard scripts from disk (no HTTP fetch = no deadlock)
      const assets = loadAssets(root);
      const detectCode = loadGuardSource(root, "guard-detect.src.js", assets);
      const guardCode = loadGuardSource(root, "guard.src.js", assets);

      if (!detectCode) return NextResponse.next(); // guards not found, skip

      const ts = Date.now();
      const signed = signToken(siteKey, ts, signingSecret);
      const cfg = JSON.stringify({
        enableWhitelist: true, enableVmCheck: true, enableTorCheck: true,
        enableHeadlessCheck: true, enableAntiDetectCheck: true,
        enableContentReplacementCheck: false,
      });

      // Store original HTML for render endpoint
      const internalFetch = await fetch(request.url, {
        headers: { accept: "text/html", "user-agent": "Shugoi", "x-shugoi-internal": "1", cookie: request.headers.get("cookie") || "" },
        signal: AbortSignal.timeout(10000),
      });

      if (internalFetch.ok) {
        const originalHtml = await internalFetch.text();
        writeFileSync(join(TOKEN_DIR, ts + "_" + signed.token.slice(-16)), originalHtml, "utf-8");
      }

      // Generate and return skeleton with eval bootcode
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
