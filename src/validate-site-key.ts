import { ShugoiError } from './errors';
import type { CheckResponse } from './types';

/**
 * Options for {@link validateSiteKey}.
 */
export interface ValidateSiteKeyOptions {
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
export async function validateSiteKey(
  options: ValidateSiteKeyOptions
): Promise<{ valid: boolean; mode?: 'live' | 'test'; error?: string }> {
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1';
  const timeout = options.timeout ?? 5000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(`${baseUrl}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ShugoiNode/0.1.0',
      },
      body: JSON.stringify({
        siteKey: options.siteKey,
        action: 'validate',
        fingerprint: {},
        signals: {},
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json() as CheckResponse;

    if (data.error === 'invalid_site_key') {
      return { valid: false, error: 'invalid_site_key' };
    }

    const mode = options.siteKey.startsWith('sg_sk_test_') ? 'test' : 'live';
    return { valid: true, mode };
  } catch (err) {
    if (err instanceof ShugoiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ShugoiError('api_timeout', 'API request timed out', err);
    }
    throw new ShugoiError('api_unreachable', 'Shugoi API unreachable', err);
  }
}
