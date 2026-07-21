import { ShugoiError } from './errors';
import type { CheckResponse } from './types';

/**
 * Options pour {@link checkLicense}.
 */
export interface CheckLicenseOptions {
  /** SiteKey Shugoi */
  siteKey: string;
  /** Action (ex: "signup", "login", "download") */
  action: string;
  /** Machine ID (SHA-256 du fingerprint) */
  machineId?: string;
  /** Signaux de fingerprint additionnels */
  signals?: Record<string, unknown>;
  /** Token captcha (si requis) */
  captchaToken?: string;
  /** Pass token */
  passToken?: string;
  /** Métadonnées (IP, email) */
  metadata?: { ip?: string; email?: string };
  /** Base URL API */
  baseUrl?: string;
  /** Timeout en ms */
  timeout?: number;
  /** User-Agent pour la requête */
  serverUa?: string;
}

/**
 * Vérifie une licence/appel auprès de l'API Shugoi.
 *
 * Wrapper typé autour de `POST /api/v1/check` avec gestion des erreurs,
 * timeout, et codes d'erreur normalisés.
 *
 * @param options - Paramètres de la vérification
 * @returns Réponse de l'API Shugoi
 * @throws {ShugoiError} Si la clé est invalide, l'API injoignable, ou timeout
 *
 * @example
 * ```ts
 * const result = await checkLicense({
 *   siteKey: 'sg_sk_live_xxx',
 *   action: 'signup',
 *   machineId: window.machineId,
 * });
 *
 * if (result.blocked) {
 *   return res.redirect(`https://shugoi.com/api/v1/block?reason=${result.blocked_reason}`);
 * }
 * ```
 */
export async function checkLicense(
  options: CheckLicenseOptions
): Promise<CheckResponse> {
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1';
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
    throw new ShugoiError('api_unreachable', 'Shugoi API unreachable', err);
  }
}
