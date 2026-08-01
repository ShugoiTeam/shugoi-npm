import { NextRequest, NextResponse } from 'next/server.js';

/**
 * Options for the Next.js Shugoi plugin.
 */
interface WithShugoiOptions {
    /** Shugoi siteKey */
    siteKey: string;
    /**
     * Local whitelist of machine IDs.
     * Empty array `[]` allows all machines.
     */
    whitelist?: string[];
    /**
     * Additional paths for the proxy allowlist.
     * @default ["/legal"]
     */
    allowlist?: string[];
    /** API base URL */
    baseUrl?: string;
}
/**
 * Next.js config wrapper that adds Shugoi CSP headers.
 *
 * ```ts
 * // next.config.ts
 * import { withShugoi } from 'shugoi/next';
 * export default withShugoi({ siteKey: 'sg_sk_live_xxx' });
 * ```
 *
 * Add guard scripts in your layout:
 * ```tsx
 * // app/layout.tsx
 * import { scriptTags } from 'shugoi';
 * const { whitelistConfig, guardDetect, guard } = scriptTags({
 *   siteKey: 'sg_sk_live_xxx',
 *   whitelist: [],
 * });
 * // head: whitelistConfig + guardDetect
 * // body: guard
 * ```
 */
declare function withShugoi(opts: WithShugoiOptions, nextConfig?: Record<string, unknown>): Record<string, unknown>;

interface ShugoiProxyOptions {
    siteKey: string;
    allowlist?: string[];
    whitelist?: string[];
    headlessPatterns?: RegExp[];
    /** Internal URL to fetch page content (e.g. "http://127.0.0.1:3009") */
    target?: string;
}
declare function createShugoiProxy(options: ShugoiProxyOptions): (request: NextRequest) => Promise<NextResponse<unknown>>;

interface ShugoiNextOptions {
    siteKey: string;
    baseUrl?: string;
    allowlist?: string[];
    whitelist?: string[];
    signingSecret?: string;
}
declare function createShugoiNextMiddleware(options: ShugoiNextOptions): (request: NextRequest) => Promise<NextResponse<unknown>>;

interface ShugoiGuardProps {
    siteKey: string;
    enableWhitelist?: boolean;
    enableVmCheck?: boolean;
}
/** Generate the Shugoi guard script tag HTML (eval bootcode) */
declare function generateGuardHtml({ siteKey, enableWhitelist, enableVmCheck }: ShugoiGuardProps): Promise<string>;

declare const SHUGOI_MATCHER = "/((?!_next/static|_next/image|favicon.ico).*)";

export { SHUGOI_MATCHER, createShugoiNextMiddleware, createShugoiProxy, generateGuardHtml, withShugoi };
