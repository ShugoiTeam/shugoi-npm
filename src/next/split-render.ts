import {
  ensureGuardsFetched,
  injectAndStore,
  renderResponseData,
} from "../render";

// Minimal interfaces for Next.js compatibility (different next versions)
interface Req {
  url: string;
  nextUrl: { pathname: string; searchParams: URLSearchParams };
  headers: Headers;
  cookies: { get: (n: string) => { value: string } | undefined };
}
interface Res {
  json: (d: unknown, init?: { status?: number }) => unknown;
  next: () => unknown;
}
type NextResponseType = Res & ((body?: BodyInit | null, init?: ResponseInit) => unknown);

export interface NextSplitRenderOptions {
  /** Shugoi siteKey */
  siteKey: string;
  /** API base URL */
  baseUrl?: string;
  /** Paths to bypass (ex: /legal, /docs) */
  allowlist?: string[];
  /** Whitelisted machine IDs */
  whitelist?: string[];
  /** Secret for HMAC token signing */
  signingSecret?: string;
  /** Disable restricted access block */
  restrictedAccess?: boolean;
}

const DEFAULT_BASE = "https://shugoi.com/api/v1";

let _guardsInitialized = false;

/**
 * Creates Next.js middleware + render handler for split-render protection.
 *
 * Usage in `proxy.ts`:
 * ```ts
 * import { createNextSplitRender } from "shugoi/next";
 * const shugoi = createNextSplitRender({ siteKey: "sg_sk_live_xxx" });
 * export const proxy = shugoi.middleware;
 * export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
 * ```
 *
 * And in `app/__shugoi/render/route.ts`:
 * ```ts
 * import { shugoi } from "@/proxy";
 * export const GET = shugoi.handleRender;
 * ```
 */
export function createNextSplitRender(options: NextSplitRenderOptions) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE;
  const allowlist = options.allowlist ?? ["/legal"];

  async function ensureReady(): Promise<void> {
    if (_guardsInitialized) return;
    await ensureGuardsFetched(baseUrl, options.siteKey);
    _guardsInitialized = true;
  }

  const INTERNAL_HEADER = "x-shugoi-internal";

  function jsonResponse(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  async function middleware(request: Req): Promise<Response | null> {
    const pathname = request.nextUrl.pathname;

    if (request.headers.get(INTERNAL_HEADER) === "1") {
      return null;
    }

    // Render endpoint
    if (pathname === "/__shugoi/render") {
      const token = request.nextUrl.searchParams.get("token") || "";
      const data = renderResponseData(token);
      const status = data.error === "not_found" ? 410 : data.blocked ? 403 : 200;
      return jsonResponse(data, status);
    }

    // Skip non-page paths
    if (
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/api/") ||
      pathname === "/favicon.ico" ||
      pathname === "/favicon.png" ||
      allowlist.some((p) => pathname === p || pathname.startsWith(p + "/"))
    ) {
      return null;
    }

    const accept = request.headers.get("accept") || "";
    if (!accept.includes("text/html")) {
      return null;
    }

    await ensureReady();

    try {
      const pageUrl = new URL((request as any).url as string);
      const cookie = request.headers.get("cookie") || "";
      const pageRes = await fetch(pageUrl.toString(), {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": request.headers.get("user-agent") || "Shugoi",
          cookie,
          [INTERNAL_HEADER]: "1",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!pageRes.ok) return null;

      const html = await pageRes.text();
      const skeleton = injectAndStore(
        html,
        options.siteKey,
        baseUrl,
        options.whitelist,
        options.restrictedAccess ?? false,
        options.signingSecret,
        "./__shugoi/render",
      );

      return new Response(skeleton, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
          "x-shugoi-split": "1",
        },
      });
    } catch {
      return null;
    }
  }

  async function handleRender(request: Req): Promise<Response> {
    const token = request.nextUrl.searchParams.get("token") || "";
    const data = renderResponseData(token);
    const status = data.error === "not_found" ? 410 : data.blocked ? 403 : 200;
    return jsonResponse(data, status);
  }

  return { middleware, handleRender };
}
