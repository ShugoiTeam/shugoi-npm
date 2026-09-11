import { ShugoiError } from './errors';
import type { CheckResponse, JsonObject } from './types';

export interface CheckLicenseOptions {
  siteKey: string;
  action: string;
  machineId?: string;
  signals?: JsonObject;
  captchaToken?: string;
  passToken?: string;
  metadata?: { ip?: string; email?: string };
  baseUrl?: string;
  timeout?: number;
  serverUa?: string;
}

export async function checkLicense(
  options: CheckLicenseOptions
): Promise<CheckResponse> {
  const baseUrl = options.baseUrl ?? 'https://api.shugoi.com/api/v1';
  const timeout = options.timeout ?? 5000;
  const serverUa = options.serverUa ?? 'ShugoiNode/0.1.0';

  const body = {
    siteKey: options.siteKey,
    action: options.action,
    fingerprint: {
      machineId: options.machineId,
    },
    signals: options.signals ?? {},
    captchaToken: options.captchaToken,
    passToken: options.passToken,
    metadata: options.metadata,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(`${baseUrl}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': serverUa,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json() as CheckResponse;

    if (data.error === 'invalid_site_key') {
      throw new ShugoiError('invalid_site_key', `Invalid siteKey: ${options.siteKey}`);
    }
    if (!res.ok) {
      throw new ShugoiError(
        'unexpected_api_response',
        `API returned status ${res.status}: ${JSON.stringify(data)}`
      );
    }

    return data;
  } catch (err) {
    if (err instanceof ShugoiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ShugoiError('api_timeout', 'Shugoi API request timed out', err);
    }
    throw new ShugoiError('api_unreachable', 'Shugoi API unreachable', String(err));
  }
}
