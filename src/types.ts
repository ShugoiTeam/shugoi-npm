export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export interface ShugoiCoreOptions {
  siteKey: string
  secret?: string
  signingSecret?: string
  allowlist?: string[]
  headlessPatterns?: RegExp[]
  botWhitelist?: RegExp[]
  baseUrl?: string
  internalUrl?: string
  debug?: boolean
  autoInject?: boolean
  restrictedAccess?: boolean
  extraDirectives?: Record<string, string[]>
  csp?: boolean
  blockStatus?: number
  locale?: 'fr' | 'en'
  blockPage?: (ctx: BlockPageContext) => string
  splitRender?: boolean
  multiProcess?: boolean
  verifyBots?: boolean
  logBotIps?: boolean
  renderSkipPath?: (path: string) => string | Promise<string>
}

export interface BlockPageContext {
  reason: 'rate_limit' | 'headless' | 'content_replacement' | 'restricted'
  title: string
  message: string
  badge: string
  host?: string
  remainingSeconds?: number
  locale: 'fr' | 'en'
}

export type ShugoiMiddlewareOptions = ShugoiCoreOptions
export type ShugoiPluginOptions = ShugoiCoreOptions

export interface ScriptTagsOptions {
  siteKey: string
  baseUrl?: string
  signingSecret?: string
  restrictedAccess?: boolean
  whitelist?: string[]
}

export interface ScriptTagsResult {
  guardDetect: string
  guard: string
  whitelistConfig: string
  token: string
}

export interface CheckResponse {
  allowed?: boolean
  blocked?: boolean
  blocked_reason?: string
  remaining?: number
  limit?: number
  resetAt?: number
  risk?: 'low' | 'medium' | 'high'
  reason?: string
  captcha?: { challenge: string; difficulty: number }
  error?: string
  requestId?: string
}

export interface CheckRequest {
  siteKey: string
  action: string
  fingerprint: { machineId?: string; browser?: string }
  signals?: JsonObject
  captchaToken?: string
  passToken?: string
  metadata?: { ip?: string; email?: string }
  blockRisk?: number
}
