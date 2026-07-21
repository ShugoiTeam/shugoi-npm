/**
 * Options pour {@link buildCsp}.
 */
export interface CspOptions {
  /** SiteKey (utilisée pour les directives futures) */
  siteKey: string;
  /** Directives CSP supplémentaires qui fusionnent avec les défauts */
  extraDirectives?: Record<string, string[]>;
}

const DEFAULT_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://shugoi.com'],
  'connect-src': ["'self'", 'https://shugoi.com'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'https://shugoi.com', 'data:'],
  'frame-src': ["'self'", 'https://shugoi.com'],
};

/**
 * Construit la chaîne Content-Security-Policy à partir des options.
 *
 * Fusionne les directives par défaut avec les directives supplémentaires.
 * Les directives supplémentaires écrasent les défauts si elles existent.
 *
 * @param options - Options de configuration CSP
 * @returns La chaîne CSP complète, prête à être utilisée dans un header HTTP
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
