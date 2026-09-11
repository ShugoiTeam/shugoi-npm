import { k as JsonValue } from '../types-CeZ7hqRi.js';
import * as next_server from 'next/server';
import { NextRequest, NextResponse } from 'next/server.js';

interface WithShugoiOptions {
    siteKey: string;
    whitelist?: string[];
    allowlist?: string[];
    baseUrl?: string;
}
interface NextHeader {
    key: string;
    value: string;
}
interface NextHeaderRule {
    source: string;
    headers: NextHeader[];
}
type NextHeaders = NextHeaderRule[] | (() => Promise<NextHeaderRule[]> | NextHeaderRule[]);
interface NextConfigShape {
    headers?: NextHeaders;
    [key: string]: JsonValue | NextHeaders | undefined;
}
declare function withShugoi(opts: WithShugoiOptions, nextConfig?: NextConfigShape): NextConfigShape;

interface ShugoiNextOptions {
    siteKey: string;
    baseUrl?: string;
    /** Trusted origin of the application, configured by its operator (never from Host). */
    origin?: string | undefined;
    allowlist?: string[];
    whitelist?: string[];
    signingSecret?: string;
    headlessPatterns?: RegExp[];
}
declare function createShugoiNextMiddleware(options: ShugoiNextOptions): (request: NextRequest) => Promise<NextResponse<unknown>>;

interface ShugoiProxyOptions extends ShugoiNextOptions {
    /** Trusted application origin; retained as an alias for origin. */
    target?: string;
}
declare function createShugoiProxy(options: ShugoiProxyOptions): (request: next_server.NextRequest) => Promise<next_server.NextResponse<unknown>>;

interface ShugoiGuardProps {
    siteKey: string;
    enableWhitelist?: boolean;
    enableVmCheck?: boolean;
}
declare function generateGuardHtml({ siteKey, enableWhitelist, enableVmCheck }: ShugoiGuardProps): Promise<string>;

declare const SHUGOI_MATCHER = "/((?!_next/static|_next/image|favicon.ico).*)";

export { SHUGOI_MATCHER, createShugoiNextMiddleware, createShugoiProxy, generateGuardHtml, withShugoi };
