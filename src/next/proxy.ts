// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Options for {@link createShugoiProxy}.
 */
export interface ShugoiProxyOptions {
  /** Paths that bypass the anti-headless block. @default ["/legal"] */
  allowlist?: string[];
  /**
   * Local whitelist of machine IDs.
   * Empty array `[]` allows all machines.
   */
  whitelist?: string[];
  /** Headless User-Agent patterns. @default curl, wget, python... */
  headlessPatterns?: RegExp[];
}

const DEFAULT_HEADLESS = [
  /^curl/i, /^wget/i, /^python/i, /^Go-http-client/i,
  /^Java\//, /HTTPie/i, /^node-fetch/i, /axios/i,
  /^okhttp/i, /^scrapy/i, /PowerShell/i, /WinHttp/i,
];

/**
 * Creates a Next.js proxy function for Shugoi anti-bot protection.
 *
 * Use in `src/proxy.ts` (Next.js 16+):
 *
 * ```ts
 * import { createShugoiProxy } from "shugoi/next";
 * export const proxy = createShugoiProxy();
 * export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
 * ```
 *
 * @param options - Proxy configuration
 * @returns Next.js proxy function
 */
export function createShugoiProxy(options: ShugoiProxyOptions = {}) {
  const allowlist = options.allowlist ?? ["/legal"];
  const headless = options.headlessPatterns ?? DEFAULT_HEADLESS;

  return function proxy(request: NextRequest) {
    const path = request.nextUrl.pathname;
    if (path.startsWith("/_next/") || path.startsWith("/api/"))
      return NextResponse.next();
    if (allowlist.some((p) => path === p || path.startsWith(p + "/")))
      return NextResponse.next();
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
      ].join('\n') + '\n';
      return new NextResponse(block, { status: 200 });
    }
    return NextResponse.next();
  };
}
