/**
 * Shugoi error codes.
 */
export type ShugoiErrorCode =
  /** The siteKey is invalid or expired */
  | 'invalid_site_key'
  /** The siteKey could not be validated (timeout, network) */
  | 'site_key_validation_failed'
  /** The Shugoi API is unreachable */
  | 'api_unreachable'
  /** The API request timed out */
  | 'api_timeout'
  /** No siteKey was configured */
  | 'missing_site_key'
  /** Unexpected API response */
  | 'unexpected_api_response'
  /** Internal package error */
  | 'internal_error';

/**
 * Typed Shugoi error with a machine-readable code.
 *
 * @example
 * ```ts
 * try {
 *   await checkLicense({ siteKey: 'invalid', machineId: 'abc' });
 * } catch (err) {
 *   if (err instanceof ShugoiError && err.code === 'invalid_site_key') {
 *     console.error('Invalid siteKey:', err.message);
 *   }
 * }
 * ```
 */
export class ShugoiError extends Error {
  /**
   * @param code Machine-readable error code
   * @param message Human-readable error message
   * @param cause Original error (optional)
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
