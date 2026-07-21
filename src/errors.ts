/**
 * Codes d'erreur Shugoi.
 */
export type ShugoiErrorCode =
  | 'invalid_site_key'
  | 'site_key_validation_failed'
  | 'api_unreachable'
  | 'api_timeout'
  | 'missing_site_key'
  | 'unexpected_api_response'
  | 'internal_error';

/**
 * Erreur Shugoi typée avec code machine-readable.
 *
 * @example
 * ```ts
 * try {
 *   await checkLicense({ siteKey: 'invalid', machineId: 'abc' });
 * } catch (err) {
 *   if (err instanceof ShugoiError && err.code === 'invalid_site_key') {
 *     console.error('Clé invalide:', err.message);
 *   }
 * }
 * ```
 */
export class ShugoiError extends Error {
  /**
   * @param code Code machine-readable de l'erreur
   * @param message Message humain lisible
   * @param cause Erreur originale (optionnelle)
   */
  constructor(
    public readonly code: ShugoiErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ShugoiError';
  }
}
