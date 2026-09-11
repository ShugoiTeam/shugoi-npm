import { IncomingMessage, Server } from 'node:http';
import { S as ShugoiCoreOptions, J as JsonObject, C as CheckResponse, a as ScriptTagsOptions, b as ScriptTagsResult } from './types-CeZ7hqRi.js';
export { B as BlockPageContext, c as CheckRequest, D as DegradedAvailabilityMode, d as DegradedAvailabilityOptions, e as DegradedAvailabilityState, f as ShugoiMiddlewareOptions, g as ShugoiPluginOptions, h as SignedAvailabilitySnapshot, i as availabilityState, j as canServeDegradedPath, s as signAvailabilitySnapshot, v as verifyAvailabilitySnapshot } from './types-CeZ7hqRi.js';
export { applyBootObfuscation, applyObfuscation, isValidJs } from './obfuscate.js';

type ShugoiErrorCode = 'invalid_site_key' | 'site_key_validation_failed' | 'api_unreachable' | 'api_timeout' | 'missing_site_key' | 'unexpected_api_response' | 'internal_error';
type ErrorCause = string | number | boolean | object | null;
declare class ShugoiError extends Error {
    readonly code: ShugoiErrorCode;
    readonly cause?: ErrorCause | undefined;
    constructor(code: ShugoiErrorCode, message: string, cause?: ErrorCause | undefined);
}

type Locale = 'fr' | 'en';

/** The protected bootstrap is short-lived and delivered over its own same-origin socket. */
declare function storeBootstrap(token: string, script: string): void;
declare function readLatestBootstrap(): string | null;
declare function readBootstrap(token: string): string | null;
declare function encodeInvisibleBootstrapPath(token: string): string;
declare function decodeInvisibleBootstrapPath(value: string): string | null;
declare function storeHtml(token: string, html: string, _contentReplaceOn?: boolean): void;
declare function verifyRenderGrant(mid: string | undefined, grant: string | undefined, token?: string, _ip?: string, expectedSiteKey?: string, secretOverride?: string): boolean;
declare function renderResponseData(token: string, _locale?: Locale, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, _secret?: string): Promise<{
    html?: string;
    error?: string;
    blocked?: boolean;
    reason?: string;
    message?: string;
    title?: string;
}>;
declare function handleRender(token: string, res: {
    setHeader?: (k: string, v: string | string[]) => void;
    getHeader?: (k: string) => string | number | string[] | undefined;
    send?: (body: string) => void;
    end?: (body: string) => void;
}, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, baseUrl?: string, _secret?: string, ua?: string, midAnchor?: string): Promise<void>;
declare function signToken(siteKey: string, timestamp: number, secretOverride?: string): {
    token: string;
};
declare function getConfigAvailability(siteKey: string, baseUrl: string, secret?: string, maxStaleMs?: number): 'fresh' | 'degraded' | 'expired' | 'rejected' | 'recovered';
declare function fetchWhitelistForSiteKey(siteKey: string, baseUrl: string): Promise<string[]>;
declare function __clearConfigCache(): void;
declare function __clearGuardCache(siteKey?: string, baseUrl?: string): void;
declare function generateSkeleton(siteKey: string, token: string, baseUrl: string, restrictedAccess?: boolean, _whitelist?: string[], renderUrl?: string, locale?: Locale, flags?: Record<string, boolean>, clockts?: number, signingSecret?: string, supportEmail?: string, midAnchorOk?: boolean, renderTransport?: 'http' | 'websocket'): Promise<string>;
declare function injectGuardScripts(html: string, siteKey: string, baseUrl: string, whitelist?: string[] | null, restrictedAccess?: boolean, signingSecret?: string, _req?: object, _allowedOrigins?: string[], locale?: Locale, clockts?: number, midAnchorOk?: boolean, renderUrl?: string, renderTransport?: 'http' | 'websocket'): Promise<string>;

interface ShugoiWebSocketOptions {
    siteKey: string;
    secret: string;
    /** Optional multi-tenant resolver used by the Shugoi platform itself. */
    resolveSecret?: (siteKey: string) => string | null | Promise<string | null>;
    sameOrigin?: (req: IncomingMessage) => boolean;
}
/** SDK-owned bootstrap, SSR render, WLC, whitelist-stream and clock transports. */
declare function attachShugoiWebSocket(server: Server, opts: ShugoiWebSocketOptions): () => void;

declare const BLOCK_PAGE: string;

declare const DEFAULT_HEADLESS_PATTERNS: RegExp[];
declare const DEFAULT_BOT_WHITELIST: RegExp[];

declare function createShugoiMiddleware(options: ShugoiCoreOptions): (req: object, res: object, next: (...args: never[]) => void) => Promise<void>;
declare function createShugoiPlugin(options: ShugoiCoreOptions): (instance: object) => Promise<void>;

interface CspOptions {
    siteKey: string;
    extraDirectives?: Record<string, string[]>;
    splitRender?: boolean;
    apiOrigin?: string;
    bootEval?: boolean;
    enableDevtoolsCheck?: boolean;
}
declare function buildCsp(options: CspOptions): string;
declare function mergeCsp(existing: string | undefined, added: string): string;

interface CheckLicenseOptions {
    siteKey: string;
    action: string;
    machineId?: string;
    signals?: JsonObject;
    captchaToken?: string;
    passToken?: string;
    metadata?: {
        ip?: string;
        email?: string;
    };
    baseUrl?: string;
    timeout?: number;
    serverUa?: string;
}
declare function checkLicense(options: CheckLicenseOptions): Promise<CheckResponse>;

declare function scriptTags(options: ScriptTagsOptions): Promise<ScriptTagsResult>;

interface ValidateSiteKeyOptions {
    siteKey: string;
    baseUrl?: string;
    timeout?: number;
}
declare function validateSiteKey(options: ValidateSiteKeyOptions): Promise<{
    valid: boolean;
    mode?: 'live' | 'test';
    error?: string;
}>;

export { BLOCK_PAGE, CheckResponse, DEFAULT_BOT_WHITELIST, DEFAULT_HEADLESS_PATTERNS, ScriptTagsOptions, ScriptTagsResult, ShugoiCoreOptions, ShugoiError, type ShugoiWebSocketOptions, __clearConfigCache, __clearGuardCache, attachShugoiWebSocket, buildCsp, checkLicense, createShugoiMiddleware, createShugoiPlugin, decodeInvisibleBootstrapPath, encodeInvisibleBootstrapPath, fetchWhitelistForSiteKey, generateSkeleton, getConfigAvailability, handleRender, injectGuardScripts, mergeCsp, readBootstrap, readLatestBootstrap, renderResponseData, scriptTags, signToken, storeBootstrap, storeHtml, validateSiteKey, verifyRenderGrant };
