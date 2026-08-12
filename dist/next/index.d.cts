import { a as JsonValue } from '../types-B7HEI2Ab.cjs';
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
    [key: string]: JsonValue | NextHeaders;
}
declare function withShugoi(opts: WithShugoiOptions, nextConfig?: NextConfigShape): NextConfigShape;

interface ShugoiProxyOptions {
    siteKey: string;
    allowlist?: string[];
    whitelist?: string[];
    headlessPatterns?: RegExp[];
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
declare function generateGuardHtml({ siteKey, enableWhitelist, enableVmCheck }: ShugoiGuardProps): Promise<string>;

declare const SHUGOI_MATCHER = "/((?!_next/static|_next/image|favicon.ico).*)";

export { SHUGOI_MATCHER, createShugoiNextMiddleware, createShugoiProxy, generateGuardHtml, withShugoi };
