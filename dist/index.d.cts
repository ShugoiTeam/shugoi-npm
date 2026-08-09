type ShugoiErrorCode = 'invalid_site_key' | 'site_key_validation_failed' | 'api_unreachable' | 'api_timeout' | 'missing_site_key' | 'unexpected_api_response' | 'internal_error';
declare class ShugoiError extends Error {
    readonly code: ShugoiErrorCode;
    readonly cause?: unknown | undefined;
    constructor(code: ShugoiErrorCode, message: string, cause?: unknown | undefined);
}

type Locale = 'fr' | 'en';

declare function storeHtml(token: string, html: string, contentReplaceOn?: boolean): void;
declare function verifyRenderGrant(mid: string | undefined, grant: string | undefined, token?: string, ip?: string, expectedSiteKey?: string): boolean;
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
declare function generateSkeleton(siteKey: string, token: string, baseUrl: string, restrictedAccess?: boolean, whitelist?: string[], renderUrl?: string, locale?: Locale, flags?: Record<string, boolean>, clockts?: number, signingSecret?: string): Promise<string>;
declare function injectGuardScripts(html: string, siteKey: string, baseUrl: string, whitelist?: string[] | null, restrictedAccess?: boolean, signingSecret?: string, req?: unknown, _allowedOrigins?: string[], locale?: Locale, clockts?: number): Promise<string>;

/** Options communes au middleware Express et au plugin Fastify. */
interface ShugoiCoreOptions {
    /** Votre siteKey Shugoi. Requis. */
    siteKey: string;
    /** Secret du site. Active la validation de clé et la signature des tokens. */
    secret?: string;
    /** Secret HMAC de signature. Par défaut : `secret`. */
    signingSecret?: string;
    /** Chemins qui contournent toute protection. Défaut : ['/api', '/legal'] */
    allowlist?: string[];
    /** User-Agents bloqués. Défaut : DEFAULT_HEADLESS_PATTERNS */
    headlessPatterns?: RegExp[];
    /** Bots légitimes toujours autorisés (et exemptés de split-render). Défaut : DEFAULT_BOT_WHITELIST */
    botWhitelist?: RegExp[];
    /** URL de base de l'API. Défaut : 'https://shugoi.com/api/v1' */
    baseUrl?: string;
    /** URL interne pour les appels serveur-serveur (évite le deadlock via Cloudflare). Défaut : baseUrl */
    internalUrl?: string;
    /** Logs console. Défaut : false */
    debug?: boolean;
    /** Injecte les guards dans le HTML. Défaut : true */
    autoInject?: boolean;
    /** Affiche la page « accès restreint » aux machines non whitelistées. Défaut : false */
    restrictedAccess?: boolean;
    /** Directives CSP additionnelles, fusionnées avec les défauts. */
    extraDirectives?: Record<string, string[]>;
    /** false = ne gère pas du tout la CSP. Défaut : true */
    csp?: boolean;
    /** Code HTTP des pages de blocage. Défaut : 403 */
    blockStatus?: number;
    /** Langue des pages de blocage. Défaut : détection via Accept-Language, fallback 'en' */
    locale?: 'fr' | 'en';
    /** Remplace entièrement la page de blocage. */
    blockPage?: (ctx: BlockPageContext) => string;
    /** Active le split-render (skeleton + eval). Défaut : true */
    splitRender?: boolean;
    /** Stocke le HTML sur disque (nécessaire en cluster PM2). Défaut : false */
    multiProcess?: boolean;
    /** Vérifie par DNS inverse que les robots whitelistés viennent bien de leurs plages
     *  officielles (Googlebot, Bingbot…). Défaut : true.
     *  Mettre à false uniquement si le DNS sortant est bloqué sur votre infrastructure. */
    verifyBots?: boolean;
    /** Journaliser les IP des bots whitelistés (diagnostic embeds Discord/Twitter). */
    logBotIps?: boolean;
}
interface BlockPageContext {
    reason: 'rate_limit' | 'headless' | 'content_replacement' | 'restricted';
    title: string;
    message: string;
    badge: string;
    host?: string;
    remainingSeconds?: number;
    locale: 'fr' | 'en';
}
type ShugoiMiddlewareOptions = ShugoiCoreOptions;
type ShugoiPluginOptions = ShugoiCoreOptions;
interface ScriptTagsOptions {
    siteKey: string;
    baseUrl?: string;
    signingSecret?: string;
    restrictedAccess?: boolean;
    whitelist?: string[];
}
interface ScriptTagsResult {
    /** Balise <script> à placer dans <head>. */
    guardDetect: string;
    /** Balise <script> à placer en fin de <body>. Vide si splitRender. */
    guard: string;
    /** Script inline de config whitelist, à placer AVANT guardDetect. Vide si non applicable. */
    whitelistConfig: string;
    /** Token signé associé à ce rendu. */
    token: string;
}
interface CheckResponse {
    allowed?: boolean;
    blocked?: boolean;
    blocked_reason?: string;
    remaining?: number;
    limit?: number;
    resetAt?: number;
    risk?: 'low' | 'medium' | 'high';
    reason?: string;
    captcha?: {
        challenge: string;
        difficulty: number;
    };
    error?: string;
    requestId?: string;
}
interface CheckRequest {
    siteKey: string;
    action: string;
    fingerprint: {
        machineId?: string;
        browser?: string;
    };
    signals?: Record<string, unknown>;
    captchaToken?: string;
    passToken?: string;
    metadata?: {
        ip?: string;
        email?: string;
    };
    blockRisk?: number;
}

declare const DEFAULT_HEADLESS_PATTERNS: RegExp[];
declare const BLOCK_PAGE: string;
declare const DEFAULT_BOT_WHITELIST: RegExp[];

interface MinimalRequest {
    path?: string;
    url?: string;
    ip?: string;
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, unknown>;
}
interface MinimalResponse {
    setHeader?(k: string, v: string): void;
    getHeader?(k: string): string | number | string[] | undefined;
    status?(code: number): unknown;
    type?(t: string): unknown;
    send?(body: unknown): unknown;
    end?(body?: unknown, ...rest: unknown[]): unknown;
}

declare function createShugoiMiddleware(options: ShugoiCoreOptions): (req: MinimalRequest, res: MinimalResponse, next: () => void) => Promise<void>;
declare function createShugoiPlugin(options: ShugoiCoreOptions): (fastify: any) => Promise<void>;

interface CspOptions {
    siteKey: string;
    extraDirectives?: Record<string, string[]>;
    splitRender?: boolean;
    apiOrigin?: string;
}
declare function buildCsp(options: CspOptions): string;
declare function mergeCsp(existing: string | undefined, added: string): string;

/**
 * Options for {@link checkLicense}.
 */
interface CheckLicenseOptions {
    /** Shugoi siteKey */
    siteKey: string;
    /** Action (e.g. "signup", "login", "download") */
    action: string;
    /** Machine ID (SHA-256 of browser fingerprint) */
    machineId?: string;
    /** Additional fingerprint signals */
    signals?: Record<string, unknown>;
    /** Captcha token (if required by API) */
    captchaToken?: string;
    /** Pass token */
    passToken?: string;
    /** Request metadata (IP, email) */
    metadata?: {
        ip?: string;
        email?: string;
    };
    /** API base URL */
    baseUrl?: string;
    /** Request timeout in ms */
    timeout?: number;
    /** User-Agent for server-to-server requests */
    serverUa?: string;
}
/**
 * Checks a license against the Shugoi API.
 *
 * Typed wrapper around `POST /api/v1/check` with error handling,
 * timeout, and normalized error codes.
 *
 * @param options - Check parameters
 * @returns Shugoi API response
 * @throws {ShugoiError} If the key is invalid, API unreachable, or timeout
 *
 * @example
 * ```ts
 * const result = await checkLicense({
 *   siteKey: 'sg_sk_live_xxx',
 *   action: 'signup',
 *   machineId: window.machineId,
 * });
 *
 * if (result.blocked) {
 *   return res.redirect(`https://shugoi.com/api/v1/block?reason=${result.blocked_reason}`);
 * }
 * ```
 */
declare function checkLicense(options: CheckLicenseOptions): Promise<CheckResponse>;

/** Generates script tags for manual Shugoi integration. */
declare function scriptTags(options: ScriptTagsOptions): Promise<ScriptTagsResult>;

/**
 * Options for {@link validateSiteKey}.
 */
interface ValidateSiteKeyOptions {
    /** SiteKey to validate */
    siteKey: string;
    /** API base URL */
    baseUrl?: string;
    /** Timeout in ms */
    timeout?: number;
}
/**
 * Validates a siteKey by calling the Shugoi API.
 *
 * Sends a lightweight request to `/api/v1/check` with the siteKey
 * and checks that the API does not return `invalid_site_key`.
 *
 * @param options - Validation options
 * @returns Validation result with validity and mode
 * @throws {ShugoiError} If the API is unreachable
 */
declare function validateSiteKey(options: ValidateSiteKeyOptions): Promise<{
    valid: boolean;
    mode?: 'live' | 'test';
    error?: string;
}>;

export { BLOCK_PAGE, type BlockPageContext, type CheckRequest, type CheckResponse, DEFAULT_BOT_WHITELIST, DEFAULT_HEADLESS_PATTERNS, type ScriptTagsOptions, type ScriptTagsResult, type ShugoiCoreOptions, ShugoiError, type ShugoiMiddlewareOptions, type ShugoiPluginOptions, __clearConfigCache, buildCsp, checkLicense, createShugoiMiddleware, createShugoiPlugin, fetchWhitelistForSiteKey, generateSkeleton, handleRender, injectGuardScripts, mergeCsp, renderResponseData, scriptTags, signToken, storeHtml, validateSiteKey, verifyRenderGrant };
