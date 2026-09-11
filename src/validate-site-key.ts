import { ShugoiError } from './errors';
import type { CheckResponse } from './types';

export interface ValidateSiteKeyOptions {
  siteKey: string;
  baseUrl?: string;
  timeout?: number;
}

export async function validateSiteKey(
  options: ValidateSiteKeyOptions
): Promise<{ valid: boolean; mode?: 'live' | 'test'; error?: string }> {
  const baseUrl = options.baseUrl ?? 'https://api.shugoi.com/api/v1';
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
    throw new ShugoiError('api_unreachable', 'Shugoi API unreachable', String(err));
  }
}
