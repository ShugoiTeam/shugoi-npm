/** Options communes au middleware Express et au plugin Fastify. */
export interface ShugoiCoreOptions {
  /** Votre siteKey Shugoi. Requis. */
  siteKey: string
  /** Secret du site. Active la validation de clé et la signature des tokens. */
  secret?: string
  /** Secret HMAC de signature. Par défaut : `secret`. */
  signingSecret?: string
  /** Chemins qui contournent toute protection. Défaut : ['/api', '/legal'] */
  allowlist?: string[]
  /** User-Agents bloqués. Défaut : DEFAULT_HEADLESS_PATTERNS */
  headlessPatterns?: RegExp[]
  /** Bots légitimes toujours autorisés (et exemptés de split-render). Défaut : DEFAULT_BOT_WHITELIST */
  botWhitelist?: RegExp[]
  /** URL de base de l'API. Défaut : 'https://shugoi.com/api/v1' */
  baseUrl?: string
  /** URL interne pour les appels serveur-serveur (évite le deadlock via Cloudflare). Défaut : baseUrl */
  internalUrl?: string
  /** Logs console. Défaut : false */
  debug?: boolean
  /** Injecte les guards dans le HTML. Défaut : true */
  autoInject?: boolean
  /** Affiche la page « accès restreint » aux machines non whitelistées. Défaut : false */
  restrictedAccess?: boolean
  /** Directives CSP additionnelles, fusionnées avec les défauts. */
  extraDirectives?: Record<string, string[]>
  /** false = ne gère pas du tout la CSP. Défaut : true */
  csp?: boolean
  /** Code HTTP des pages de blocage. Défaut : 403 */
  blockStatus?: number
  /** Langue des pages de blocage. Défaut : détection via Accept-Language, fallback 'en' */
  locale?: 'fr' | 'en'
  /** Remplace entièrement la page de blocage. */
  blockPage?: (ctx: BlockPageContext) => string
  /** Active le split-render (skeleton + eval). Défaut : true */
  splitRender?: boolean
  /** Stocke le HTML sur disque (nécessaire en cluster PM2). Défaut : false */
  multiProcess?: boolean
  /** Vérifie par DNS inverse que les robots whitelistés viennent bien de leurs plages
   *  officielles (Googlebot, Bingbot…). Défaut : true.
   *  Mettre à false uniquement si le DNS sortant est bloqué sur votre infrastructure. */
  verifyBots?: boolean
  /** Journaliser les IP des bots whitelistés (diagnostic embeds Discord/Twitter). */
  logBotIps?: boolean
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
  /** Balise <script> à placer dans <head>. */
  guardDetect: string
  /** Balise <script> à placer en fin de <body>. Vide si splitRender. */
  guard: string
  /** Script inline de config whitelist, à placer AVANT guardDetect. Vide si non applicable. */
  whitelistConfig: string
  /** Token signé associé à ce rendu. */
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
  signals?: Record<string, unknown>
  captchaToken?: string
  passToken?: string
  metadata?: { ip?: string; email?: string }
  blockRisk?: number
}
