/**
 * Shugoi middleware configuration options.
 */
export interface ShugoiOptions {
  /**
   * Your Shugoi siteKey (starts with `sg_sk_live_` or `sg_sk_test_`).
   * Get one at https://shugoi.com/dashboard
   */
  siteKey: string;

  /**
   * Path prefixes that bypass the anti-headless block.
   * Useful to expose /docs or /legal pages to crawlers.
   * @default ["/legal"]
   */
  allowlist?: string[];

  /**
   * Headless User-Agent patterns to block (regex).
   * @default curl, wget, python, Go-http-client patterns
   */
  headlessPatterns?: RegExp[];

  /**
   * Legitimate bots that should NEVER be blocked (Googlebot, Bingbot...).
   * @default Googlebot, Bingbot, Slurp, DuckDuckBot, ...
   */
  botWhitelist?: RegExp[];

  /**
   * Default action sent to `/check` API.
   * @default "signup"
   */
  defaultAction?: string;

  /**
   * Shugoi API base URL.
   * @default "https://shugoi.com/api/v1"
   */
  baseUrl?: string;

  /**
   * API request timeout in ms.
   * @default 5000
   */
  timeout?: number;

  /**
   * User-Agent for server-to-server API calls.
   * @default "ShugoiNode/0.1.0"
   */
  serverUa?: string;

  /**
   * Enable debug mode (console logs).
   * @default false
   */
  debug?: boolean;

  /**
   * Automatically inject guard-detect and guard scripts into HTML pages.
   * Scripts are inserted before `</head>` and before `</body>`.
   * @default true
   */
  autoInject?: boolean;

  /**
   * Enable/disable the restricted access block page.
   * When false, users with blocked or unverified machineIds will not
   * see the restricted access overlay. Tor and headless detection still apply.
   * @default false
   */
  restrictedAccess?: boolean;

  /**
   * Local whitelist of machine IDs.
   * Machines in this list bypass the server whitelist check entirely.
   * Empty array `[]` allows all machines (no filtering).
   *
   * @example ['abc123...', 'def456...']
   */
  whitelist?: string[];
}

/**
 * Response from POST /api/v1/check
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
 * Payload sent to POST /api/v1/check
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
 * Internal middleware state.
 */
export interface ShugoiState {
  siteKey: string;
  validated: boolean;
  validationError?: string;
}
