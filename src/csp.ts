/**
 * Options for {@link buildCsp}.
 */
export interface CspOptions {
  /** SiteKey (used for future directives) */
  siteKey: string;
  /** Additional CSP directives merged with defaults */
  extraDirectives?: Record<string, string[]>;
}

const DEFAULT_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://shugoi.com', 'https://challenges.cloudflare.com'],
  'connect-src': ["'self'", 'https://shugoi.com', 'https://api.github.com', 'https://discord.com'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://shugoi.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'https://shugoi.com'],
  'img-src': ["'self'", 'https://shugoi.com', 'data:', 'blob:', 'https:', 'https://cdn.discordapp.com'],
  'frame-src': ["'self'", 'https://shugoi.com', 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
};

/**
 * Builds a Content-Security-Policy header string from options.
 *
 * Merges default Shugoi directives with any extra directives.
 * Extra directives override defaults when keys overlap.
 *
 * @param options - CSP configuration options
 * @returns The full CSP string, ready to use in an HTTP header
 *
 * @example
 * ```ts
 * const csp = buildCsp({ siteKey: 'sg_sk_live_xxx' });
 * res.setHeader('Content-Security-Policy', csp);
 * ```
 */
export function buildCsp(options: CspOptions): string {
  const merged: Record<string, string[]> = { ...DEFAULT_DIRECTIVES };

  if (options.extraDirectives) {
    for (const [key, values] of Object.entries(options.extraDirectives)) {
      merged[key] = values;
    }
  }

  return Object.entries(merged)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}
