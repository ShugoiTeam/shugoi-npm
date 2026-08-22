type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = {
    [key: string]: JsonValue;
};
interface ShugoiCoreOptions {
    siteKey: string;
    secret?: string;
    signingSecret?: string;
    allowlist?: string[];
    headlessPatterns?: RegExp[];
    botWhitelist?: RegExp[];
    baseUrl?: string;
    internalUrl?: string;
    debug?: boolean;
    autoInject?: boolean;
    restrictedAccess?: boolean;
    extraDirectives?: Record<string, string[]>;
    csp?: boolean;
    blockStatus?: number;
    locale?: 'fr' | 'en';
    blockPage?: (ctx: BlockPageContext) => string;
    splitRender?: boolean;
    multiProcess?: boolean;
    verifyBots?: boolean;
    logBotIps?: boolean;
    renderSkipPath?: (path: string) => string | Promise<string>;
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
    guardDetect: string;
    guard: string;
    whitelistConfig: string;
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
    signals?: JsonObject;
    captchaToken?: string;
    passToken?: string;
    metadata?: {
        ip?: string;
        email?: string;
    };
    blockRisk?: number;
}

export type { BlockPageContext as B, CheckResponse as C, JsonObject as J, ShugoiCoreOptions as S, ScriptTagsOptions as a, ScriptTagsResult as b, CheckRequest as c, ShugoiMiddlewareOptions as d, ShugoiPluginOptions as e, JsonValue as f };
