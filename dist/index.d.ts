import { S as ShugoiCoreOptions, J as JsonObject, a as JsonValue, C as CheckResponse, b as ScriptTagsOptions, c as ScriptTagsResult } from './types-B7HEI2Ab.js';
export { B as BlockPageContext, d as CheckRequest, e as ShugoiMiddlewareOptions, f as ShugoiPluginOptions } from './types-B7HEI2Ab.js';

type ShugoiErrorCode = 'invalid_site_key' | 'site_key_validation_failed' | 'api_unreachable' | 'api_timeout' | 'missing_site_key' | 'unexpected_api_response' | 'internal_error';
type ErrorCause = string | number | boolean | object | null;
declare class ShugoiError extends Error {
    readonly code: ShugoiErrorCode;
    readonly cause?: ErrorCause | undefined;
    constructor(code: ShugoiErrorCode, message: string, cause?: ErrorCause | undefined);
}

type Locale = 'fr' | 'en';

declare function storeHtml(token: string, html: string, contentReplaceOn?: boolean): void;
declare function verifyRenderGrant(mid: string | undefined, grant: string | undefined, token?: string, _ip?: string, expectedSiteKey?: string): boolean;
declare function renderResponseData(token: string, locale?: Locale, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, _secret?: string): Promise<{
    html?: string;
    error?: string;
    blocked?: boolean;
    reason?: string;
    message?: string;
    title?: string;
}>;
declare function handleRender(token: string, res: {
    setHeader?: (k: string, v: string) => void;
    send?: (body: string) => void;
    end?: (body: string) => void;
}, configUrl?: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, baseUrl?: string, _secret?: string): Promise<void>;
declare function signToken(siteKey: string, timestamp: number, secretOverride?: string): {
    token: string;
};
declare function fetchWhitelistForSiteKey(siteKey: string, baseUrl: string): Promise<string[]>;
declare function __clearConfigCache(): void;
declare function generateSkeleton(siteKey: string, token: string, baseUrl: string, restrictedAccess?: boolean, _whitelist?: string[], renderUrl?: string, locale?: Locale, flags?: Record<string, boolean>, clockts?: number, signingSecret?: string): Promise<string>;
declare function injectGuardScripts(html: string, siteKey: string, baseUrl: string, whitelist?: string[] | null, restrictedAccess?: boolean, signingSecret?: string, _req?: object, _allowedOrigins?: string[], locale?: Locale, clockts?: number): Promise<string>;

declare const BLOCK_PAGE: string;

declare const DEFAULT_HEADLESS_PATTERNS: RegExp[];
declare const DEFAULT_BOT_WHITELIST: RegExp[];

interface MinimalRequest {
    path?: string;
    url?: string;
    ip?: string;
    method?: string;
    headers?: Record<string, string | string[]>;
    query?: JsonObject;
}
type ResponseBody = string | Uint8Array | JsonValue;
interface MinimalResponse {
    setHeader?(k: string, v: string): void;
    getHeader?(k: string): string | number | string[] | undefined;
    status?(code: number): MinimalResponse;
    type?(t: string): MinimalResponse;
    send?(body: ResponseBody): MinimalResponse | Promise<MinimalResponse>;
    end?(body?: ResponseBody, encoding?: string, cb?: () => void): MinimalResponse;
}
interface FastifyRequestLike {
    url: string;
    ip?: string;
    headers: Record<string, string>;
    query: Record<string, string>;
}
interface FastifyReplyLike {
    statusCode: number;
    getHeader?(name: string): string | number | string[] | undefined;
    header(name: string, value: string): FastifyReplyLike;
    code(status: number): FastifyReplyLike;
    type(contentType: string): FastifyReplyLike;
    send(body: string | Record<string, string | boolean | number | null>): FastifyReplyLike;
}
interface FastifyLike {
    addHook(name: 'onRequest' | 'preHandler' | 'onSend', handler: (...args: FastifyHookArguments) => Promise<string | void>): void;
    get(path: string, handler: (request: FastifyRequestLike, reply: FastifyReplyLike) => Promise<void>): void;
    head(path: string, handler: (request: FastifyRequestLike, reply: FastifyReplyLike) => Promise<FastifyReplyLike>): void;
}
type FastifyHookArguments = [FastifyRequestLike, FastifyReplyLike, string?];

declare function createShugoiMiddleware(options: ShugoiCoreOptions): (req: MinimalRequest, res: MinimalResponse, next: (...args: never[]) => void) => Promise<void>;
declare function createShugoiPlugin(options: ShugoiCoreOptions): (fastify: FastifyLike) => Promise<void>;

interface CspOptions {
    siteKey: string;
    extraDirectives?: Record<string, string[]>;
    splitRender?: boolean;
    apiOrigin?: string;
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

export { BLOCK_PAGE, CheckResponse, DEFAULT_BOT_WHITELIST, DEFAULT_HEADLESS_PATTERNS, ScriptTagsOptions, ScriptTagsResult, ShugoiCoreOptions, ShugoiError, __clearConfigCache, buildCsp, checkLicense, createShugoiMiddleware, createShugoiPlugin, fetchWhitelistForSiteKey, generateSkeleton, handleRender, injectGuardScripts, mergeCsp, renderResponseData, scriptTags, signToken, storeHtml, validateSiteKey, verifyRenderGrant };
