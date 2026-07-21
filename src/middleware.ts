import { validateSiteKey } from './validate-site-key';
import { buildCsp } from './csp';
import { ShugoiError } from './errors';
import type { ShugoiOptions, ShugoiState } from './types';

const DEFAULT_HEADLESS_PATTERNS = [
  /^curl/i, /^wget/i, /^python/i, /^Go-http-client/i,
  /^Java\//, /HTTPie/i, /^node-fetch/i, /axios/i,
  /^okhttp/i, /^scrapy/i, /PowerShell/i, /WinHttp/i,
];

const DEFAULT_BOT_WHITELIST = [
  /Googlebot/i, /Bingbot/i, /Slurp/i, /DuckDuckBot/i,
  /YandexBot/i, /Baiduspider/i, /FacebookExternalHit/i,
  /Twitterbot/i, /LinkedInBot/i, /Applebot/i,
  /AhrefsBot/i, /SemrushBot/i,
];

/**
 * Creates a Connect-compatible middleware for Shugoi protection.
 *
 * Validates the siteKey on first call, then:
 * 1. Sets CSP headers
 * 2. Blocks headless User-Agents (curl, wget...)
 * 3. Checks Sec-Fetch headers for fake browser UAs
 * 4. Bypasses allowlisted paths
 *
 * @param options - Configuration options
 * @returns Connect middleware (req, res, next)
 * @throws {ShugoiError} If siteKey is invalid (async, on first call)
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createShugoiMiddleware } from 'shugoi';
 *
 * const app = express();
 * app.use(createShugoiMiddleware({ siteKey: 'sg_sk_live_xxx' }));
 * ```
 */
export function createShugoiMiddleware(options: ShugoiOptions) {
  const state: ShugoiState = {
    siteKey: options.siteKey,
    validated: false,
  };

  const allowlist = options.allowlist ?? ['/legal'];
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST;
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1';
  const debug = options.debug ?? false;

  const csp = buildCsp({ siteKey: options.siteKey, extraDirectives: {} });

  function log(...args: unknown[]) {
    if (debug) console.log('[shugoi]', ...args);
  }

  async function ensureValidated(): Promise<void> {
    if (state.validated) return;
    try {
      const result = await validateSiteKey({
        siteKey: options.siteKey,
        baseUrl,
        timeout: options.timeout,
      });
      if (!result.valid) {
        state.validationError = result.error;
        throw new ShugoiError(
          'invalid_site_key',
          `Invalid siteKey: ${options.siteKey} - ${result.error}`
        );
      }
      state.validated = true;
      log('SiteKey validated, mode:', result.mode);
    } catch (err) {
      if (err instanceof ShugoiError && err.code === 'invalid_site_key') throw err;
      state.validated = true;
      log('Validation skipped (network unavailable)');
    }
  }

  return async function shugoiMiddleware(
    req: { headers: Record<string, string | string[] | undefined>; path?: string; url?: string },
    res: {
      statusCode?: number;
      setHeader?: (key: string, val: string) => void;
      status?: (code: number) => any;
      type?: (t: string) => any;
      send?: (b: string) => void;
      end?: (b?: string) => void;
      [key: string]: any;
    },
    next: () => void,
  ): Promise<void> {
    try {
      await ensureValidated();

      const path = (req.path ?? req.url ?? '/').split('?')[0];

      if (res.setHeader) {
        res.setHeader('Content-Security-Policy', csp);
      }

      if (allowlist.some(p => path === p || path.startsWith(p + '/'))) {
        return next();
      }

      const ua = (req.headers?.['user-agent'] as string) ?? '';

      if (ua && !botWhitelist.some(p => p.test(ua)) && headlessPatterns.some(p => p.test(ua))) {
        if (res.status) res.status(200);
        if (res.type) res.type('txt');
        if (res.send) res.send('BLOCKED BY SHUGOI');
        else if (res.end) res.end('BLOCKED BY SHUGOI');
        return;
      }

      if (/Mozilla/i.test(ua) && !botWhitelist.some(p => p.test(ua))) {
        const sfd = req.headers?.['sec-fetch-dest'] as string ?? '';
        const sfm = req.headers?.['sec-fetch-mode'] as string ?? '';
        if (!sfd && !sfm) {
          if (res.status) res.status(200);
          if (res.type) res.type('txt');
          if (res.send) res.send('BLOCKED BY SHUGOI');
          else if (res.end) res.end('BLOCKED BY SHUGOI');
          return;
        }
      }

      next();
    } catch (err) {
      if (err instanceof ShugoiError && err.code === 'invalid_site_key') {
        log('Invalid siteKey, blocking by default');
        if (res.status) res.status(500);
        if (res.type) res.type('txt');
        const msg = 'Shugoi configuration error: ' + err.message;
        if (res.send) res.send(msg);
        else if (res.end) res.end(msg);
        return;
      }
      log('Unhandled error:', err);
      next();
    }
  };
}
