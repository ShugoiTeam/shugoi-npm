import { NextResponse } from "next/server.js";
import type { NextRequest } from "next/server.js";
import { injectGuardScripts } from "../render";
import { BLOCK_PAGE } from "../block-page";

export interface ShugoiProxyOptions {
  siteKey: string;
  allowlist?: string[];
  whitelist?: string[];
  headlessPatterns?: RegExp[];
  target?: string;
}

const DEFAULT_HEADLESS = [
  /^curl/i, /^wget/i, /^python/i, /^Go-http-client/i,
  /^Java\//, /HTTPie/i, /^node-fetch/i, /axios/i,
  /^okhttp/i, /^scrapy/i, /PowerShell/i, /WinHttp/i,
];
const BASE_URL = "https://shugoi.com/api/v1";

export function createShugoiProxy(options: ShugoiProxyOptions) {
  const { siteKey, target } = options;
  const allowlist = options.allowlist ?? ["/legal"];
  const headless = options.headlessPatterns ?? DEFAULT_HEADLESS;

  return async function proxy(request: NextRequest) {
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
          "x-shugoi-internal": "1",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!pageRes.ok) return NextResponse.next();

      const html = await pageRes.text();

      const skeleton = await injectGuardScripts(
        html, siteKey, BASE_URL, undefined, false, undefined,
        { url: path }
      );

      return new NextResponse(skeleton, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
        },
      });
    } catch {
      return NextResponse.next();
    }
  };
}
