import { validateSiteKey } from './validate-site-key';
import { buildCsp } from './csp';
import { ShugoiError } from './errors';
import { ensureGuardsFetched, injectAndStore, handleRender } from './render';
import type { ShugoiOptions, ShugoiState } from './types';

const DEFAULT_HEADLESS_PATTERNS = [
  /^curl/i, /^wget/i, /^python/i, /^Go-http-client/i,
  /^Java\//, /HTTPie/i, /^node-fetch/i, /axios/i,
  /^okhttp/i, /^scrapy/i, /PowerShell/i, /WinHttp/i,
];

const BLOCK_PAGE = [
  '╔═══════════════════════════════════════════╗',
  '║           BLOCKED BY SHUGOI               ║',
  '╠═══════════════════════════════════════════╣',
  '║  Bots, scrapers and headless clients      ║',
  '║  are blocked by Shugoi protection.        ║',
  '║                                           ║',
  '║  Use a standard browser to access         ║',
  '║  this site.                               ║',
  '║                                           ║',
  '║  ─ contact: support@shugoi.com ─          ║',
  '╚═══════════════════════════════════════════╝',
].join('\n') + '\n';

const DEFAULT_BOT_WHITELIST = [
  /Googlebot/i, /Bingbot/i, /Slurp/i, /DuckDuckBot/i,
  /YandexBot/i, /Baiduspider/i, /FacebookExternalHit/i,
  /Twitterbot/i, /LinkedInBot/i, /Applebot/i,
  /AhrefsBot/i, /SemrushBot/i,
];

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
  const autoInject = options.autoInject ?? true;
  const restrictedAccess = options.restrictedAccess ?? false;

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
      getHeader?: (key: string) => string | string[] | number | undefined;
      status?: (code: number) => any;
      type?: (t: string) => any;
      send?: (b: any) => void;
      end?: (b?: any) => void;
      write?: (chunk: any) => boolean;
      [key: string]: any;
    },
    next: () => void,
  ): Promise<void> {
    try {
      await ensureValidated();

      const path = (req.path ?? req.url ?? '/').split('?')[0];

      // CSP
      if (res.setHeader) {
        res.setHeader('Content-Security-Policy', csp);
      }

      // Render endpoint for split-render
      if (path.endsWith('/__shugoi/render')) {
        const token = (req as any).query?.token || '';
        handleRender(token, res);
        return;
      }

      // Allowlist bypass
      if (allowlist.some(p => path === p || path.startsWith(p + '/'))) {
        return next();
      }

      function recordBlock(reason: string) {
        fetch(`${baseUrl}/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteKey: options.siteKey, reason, machineId: '' }),
          keepalive: true,
        }).catch(() => {});
      }

      // Headless UA block
      const ua = (req.headers?.['user-agent'] as string) ?? '';
      if (ua && !botWhitelist.some(p => p.test(ua)) && headlessPatterns.some(p => p.test(ua))) {
        recordBlock('headless');
        if (res.status) res.status(200);
        if (res.type) res.type('txt');
        if (res.send) res.send(BLOCK_PAGE);
        else if (res.end) res.end(BLOCK_PAGE);
        return;
      }

      // Sec-Fetch check
      if (/Mozilla/i.test(ua) && !botWhitelist.some(p => p.test(ua))) {
        const sfd = req.headers?.['sec-fetch-dest'] as string ?? '';
        const sfm = req.headers?.['sec-fetch-mode'] as string ?? '';
        if (!sfd && !sfm) {
          recordBlock('headless');
          if (res.status) res.status(200);
          if (res.type) res.type('txt');
          if (res.send) res.send(BLOCK_PAGE);
          else if (res.end) res.end(BLOCK_PAGE);
          return;
        }
      }

      // Split-render: replace HTML with skeleton
      if (autoInject) {
        await ensureGuardsFetched(baseUrl);

        const originalSend = res.send?.bind(res);
        const originalEnd = res.end?.bind(res);

        if (originalSend) {
          res.send = function (body: any) {
            if (typeof body === 'string') {
              const ct = res.getHeader ? res.getHeader('content-type') : undefined;
              if (!ct || String(ct).includes('text/html')) {
                body = injectAndStore(
                  body,
                  options.siteKey,
                  baseUrl,
                  options.whitelist,
                  restrictedAccess,
                  options.signingSecret,
                );
              }
            }
            return originalSend(body);
          };
        }

        if (originalEnd) {
          res.end = function (body?: any) {
            if (body && typeof body === 'string') {
              const ct = res.getHeader ? res.getHeader('content-type') : undefined;
              if (!ct || String(ct).includes('text/html')) {
                body = injectAndStore(
                  body,
                  options.siteKey,
                  baseUrl,
                  options.whitelist,
                  restrictedAccess,
                  options.signingSecret,
                );
              }
            }
            return originalEnd(body);
          };
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
