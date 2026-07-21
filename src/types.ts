/**
 * Options de configuration du middleware Shugoi.
 */
export interface ShugoiOptions {
  /**
   * Votre siteKey Shugoi (commence par `sg_sk_live_` ou `sg_sk_test_`).
   * Obtenez-la sur https://shugoi.com/dashboard
   */
  siteKey: string;

  /**
   * Chemins qui contournent le blocage anti-headless.
   * Utile pour exposer les pages /docs ou /legal aux crawlers.
   * @default ["/legal"]
   */
  allowlist?: string[];

  /**
   * Liste des User-Agent headless à bloquer (patterns regex).
   * @default patterns curl, wget, python, Go-http-client, ...
   */
  headlessPatterns?: RegExp[];

  /**
   * Liste des bots légitimes à ne JAMAIS bloquer (Googlebot, Bingbot...).
   * @default patterns Googlebot, Bingbot, Slurp, DuckDuckBot, ...
   */
  botWhitelist?: RegExp[];

  /**
   * Action par défaut envoyée à l'API `/check`.
   * @default "signup"
   */
  defaultAction?: string;

  /**
   * URL de base de l'API Shugoi.
   * @default "https://shugoi.com/api/v1"
   */
  baseUrl?: string;

  /**
   * Timeout en ms pour les appels API.
   * @default 5000
   */
  timeout?: number;

  /**
   * User-Agent utilisé pour les appels serveur→serveur.
   * @default "ShugoiNode/0.1.0"
   */
  serverUa?: string;

  /**
   * Activer le mode debug (logs console).
   * @default false
   */
  debug?: boolean;
}

/**
 * Réponse de l'API POST /api/v1/check
 */
export interface CheckResponse {
  allowed?: boolean;
  blocked?: boolean;
  blocked_reason?: BlockedReason;
  remaining?: number;
  limit?: number;
  resetAt?: number;
  risk?: 'low' | 'medium' | 'high';
  reason?: RateLimitReason;
  captcha?: CaptchaChallenge;
  error?: string;
  requestId?: string;
}

export type BlockedReason =
  | 'tor_browser'
  | 'virtual_machine'
  | 'headless_browser'
  | 'anti_detect_browser'
  | 'suspicious_traffic'
  | 'non_whitelisted';

export type RateLimitReason =
  | 'browser_cap_reached'
  | 'ip_cap_reached'
  | 'machineId_cap_reached'
  | 'email_cap_reached';

export interface CaptchaChallenge {
  challenge: string;
  difficulty: number;
}

/**
 * Payload envoyé à POST /api/v1/check
 */
export interface CheckRequest {
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

/**
 * État interne du middleware.
 */
export interface ShugoiState {
  siteKey: string;
  validated: boolean;
  validationError?: string;
}
