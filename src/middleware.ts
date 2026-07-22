import { validateSiteKey } from './validate-site-key';
import { buildCsp } from './csp';
import { ShugoiError } from './errors';
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

function injectGuardScripts(html: string, siteKey: string, baseUrl: string, whitelist?: string[]): string {
  const cacheBust = Date.now();
  const whitelistScript = whitelist ? `<script>window.__sg_whitelist=${JSON.stringify(whitelist)};</script>\n` : '';
  const guardDetect = `${whitelistScript}<script src="${baseUrl}/guard-detect?key=${siteKey}&v=${cacheBust}"></script>`;
  const guard = `<script src="${baseUrl}/guard?key=${siteKey}&v=${cacheBust}"></script>`;
  let result = html;
  // guard-detect needs document.body for font enumeration.
  // Inject right after <body> (not in <head>) so body exists when it runs.
  if (result.includes('<body')) {
    const bodyMatch = result.match(/<body[^>]*>/);
    if (bodyMatch) {
      const insertAt = result.indexOf(bodyMatch[0]) + bodyMatch[0].length;
      result = result.substring(0, insertAt) + '\n' + guardDetect + result.substring(insertAt);
    }
  }
  if (result.includes('</body>')) {
    result = result.replace('</body>', `${guard}\n</body>`);
  }
  return result;
}

/**
 * Creates a Connect-compatible middleware for Shugoi protection.
 *
 * Validates the siteKey on first call, then:
 * 1. Blocks headless User-Agents (curl, wget...)
 * 2. Checks Sec-Fetch headers for fake browser UAs
 * 3. Sets CSP headers
 * 4. Bypasses allowlisted paths
 * 5. Auto-injects guard scripts into HTML responses
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
  const autoInject = options.autoInject ?? true;
  const restrictedAccess = options.restrictedAccess ?? false; // kept for backward compat

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

      // Allowlist bypass
      if (allowlist.some(p => path === p || path.startsWith(p + '/'))) {
        return next();
      }

      // Headless UA block
      const ua = (req.headers?.['user-agent'] as string) ?? '';
      if (ua && !botWhitelist.some(p => p.test(ua)) && headlessPatterns.some(p => p.test(ua))) {
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
          if (res.status) res.status(200);
          if (res.type) res.type('txt');
          if (res.send) res.send(BLOCK_PAGE);
          else if (res.end) res.end(BLOCK_PAGE);
          return;
        }
      }

      // Auto-inject guard scripts into HTML responses
      if (autoInject) {
        const originalSend = res.send?.bind(res);
        const originalEnd = res.end?.bind(res);

        if (originalSend) {
          res.send = function (body: any) {
            if (typeof body === 'string') {
              const ct = res.getHeader ? res.getHeader('content-type') : undefined;
              if (!ct || String(ct).includes('text/html')) {
                body = injectGuardScripts(body, options.siteKey, baseUrl, options.whitelist);
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
                body = injectGuardScripts(body, options.siteKey, baseUrl, options.whitelist);
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
