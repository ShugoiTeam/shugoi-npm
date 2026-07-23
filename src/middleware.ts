// @ts-nocheck
import { injectGuardScripts } from './render';

export const DEFAULT_HEADLESS_PATTERNS = [
  /^curl/i, /^wget/i, /^python/i, /^Go-http-client/i, /^Java\//,
  /HTTPie/i, /^node-fetch/i, /axios/i, /^okhttp/i, /^scrapy/i,
  /PowerShell/i, /WinHttp/i,
];

export const BLOCK_PAGE = [
  "+---------------------------------------------+",
  "|           BLOCKED BY SHUGOI                 |",
  "+---------------------------------------------+",
  "|  Bots, scrapers and headless clients        |",
  "|  are blocked by Shugoi protection.          |",
  "|                                             |",
  "|  Use a standard browser to access           |",
  "|  this site.                                 |",
  "|                                             |",
  "|  - contact: support@shugoi.com -            |",
  "+---------------------------------------------+",
].join('\n') + '\n';

export const DEFAULT_BOT_WHITELIST = [
  /Googlebot/i, /Bingbot/i, /Slurp/i, /DuckDuckBot/i, /YandexBot/i,
  /FacebookExternalHit/i, /Twitterbot/i, /LinkedInBot/i, /Applebot/i,
  /AhrefsBot/i, /SemrushBot/i,
];

function buildCsp(options) {
  const DEFAULT_DIRECTIVES = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://shugoi.com'],
    'connect-src': ["'self'", 'https://shugoi.com'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'https://shugoi.com', 'data:'],
    'frame-src': ["'self'", 'https://shugoi.com'],
  };
  const merged = { ...DEFAULT_DIRECTIVES };
  if (options.extraDirectives) {
    for (const [key, values] of Object.entries(options.extraDirectives)) {
      merged[key] = values;
    }
  }
  return Object.entries(merged).map(([key, values]) => `${key} ${values.join(' ')}`).join('; ');
}

/**
 * Creates a Connect-compatible middleware for Shugoi split-render protection.
 *
 * @param {object} options
 * @param {string} options.siteKey - Your Shugoi siteKey
 * @param {string[]} [options.allowlist] - Paths bypassing anti-bot checks (default: ['/legal'])
 * @param {boolean} [options.restrictedAccess] - Show restricted block page (default: false)
 * @param {string} [options.signingSecret] - HMAC secret for token signing
 * @param {boolean} [options.debug] - Enable console logs
 * @param {string} [options.baseUrl] - API base URL (default: https://shugoi.com/api/v1)
 */
export function createShugoiMiddleware(options) {
  const allowlist = options.allowlist ?? ['/legal'];
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST;
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1';
  const debug = options.debug ?? false;
  const autoInject = options.autoInject ?? true;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret;
  const csp = buildCsp({ siteKey: options.siteKey, extraDirectives: {} });

  function log(...args) { if (debug) console.log('[shugoi]', ...args); }

  return async function shugoiMiddleware(req, res, next) {
    try {
      const path = (req.path ?? req.url ?? '/').split('?')[0];

      // Render endpoint
      if (path.endsWith('/__shugoi/render')) {
        const { handleRender } = await import('./render');
        return handleRender((req.query && req.query.token) || '', res);
      }

      // CSP
      if (res.setHeader) res.setHeader('Content-Security-Policy', csp);

      // Allowlist bypass
      if (allowlist.some(p => path === p || path.startsWith(p + '/'))) return next();

      // Headless UA block
      const ua = req.headers?.['user-agent'] ?? '';
      if (ua && !botWhitelist.some(p => p.test(ua)) && headlessPatterns.some(p => p.test(ua))) {
        if (res.status) res.status(200);
        if (res.type) res.type('txt');
        if (res.send) res.send(BLOCK_PAGE); else if (res.end) res.end(BLOCK_PAGE);
        return;
      }

      // Sec-Fetch + Accept-Language check for fake browsers
      if (/Mozilla/i.test(ua) && !botWhitelist.some(p => p.test(ua))) {
        const sfd = req.headers?.['sec-fetch-dest'] ?? '';
        const sfm = req.headers?.['sec-fetch-mode'] ?? '';
        const al = req.headers?.['accept-language'] ?? '';
        if (!al || (!sfd && !sfm)) {
          if (res.status) res.status(200);
          if (res.type) res.type('txt');
          if (res.send) res.send(BLOCK_PAGE); else if (res.end) res.end(BLOCK_PAGE);
          return;
        }
      }

      // Split-render: replace HTML with skeleton
      if (autoInject) {
        let injected = false;
        const originalSend = res.send?.bind(res);
        const originalEnd = res.end?.bind(res);
        const doInject = (body) => {
          if (injected) return body;
          if (typeof body === 'string') {
            const ct = res.getHeader ? res.getHeader('content-type') : undefined;
            if (!ct || String(ct).includes('text/html')) {
              // whitelist is handled by dashboard via guard-detect endpoint injection
              body = injectGuardScripts(body, options.siteKey, baseUrl, undefined, restrictedAccess, signingSecret, req);
              injected = true;
            }
          }
          return body;
        };
        if (originalSend) { res.send = function (body) { return originalSend(doInject(body)); }; }
        if (originalEnd) { res.end = function (body) { return originalEnd(doInject(body)); }; }
      }

      next();
    } catch (err) {
      log('Unhandled error:', err);
      next();
    }
  };
}

/**
 * Shugoi Fastify plugin.
 */
export function createShugoiPlugin(options) {
  const allowlist = options.allowlist ?? ['/legal'];
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST;
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1';
  const debug = options.debug ?? false;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret;
  const csp = buildCsp({ siteKey: options.siteKey, extraDirectives: {} });

  function log(...args) { if (debug) console.log('[shugoi]', ...args); }

  return async function shugoiPlugin(fastify) {
    fastify.addHook('onRequest', async (request, reply) => {
      reply.header('Content-Security-Policy', csp);
    });

    fastify.get('/__shugoi/render', async (request, reply) => {
      const { renderResponseData } = await import('./render');
      const data = renderResponseData(request.query.token || '');
      reply.send(data);
    });

    fastify.head('/__shugoi/healthcheck', async (request, reply) => reply.send(''));

    fastify.addHook('preHandler', async (request, reply) => {
      try {
        const path = request.url.split('?')[0];
        if (path.endsWith('/__shugoi/render') || path.endsWith('/__shugoi/healthcheck')) return;
        if (allowlist.some(p => path === p || path.startsWith(p + '/'))) return;

        const ua = request.headers['user-agent'] ?? '';
        if (ua && !botWhitelist.some(p => p.test(ua)) && headlessPatterns.some(p => p.test(ua))) {
          reply.code(200).type('text/plain').send(BLOCK_PAGE);
          return;
        }
        if (/Mozilla/i.test(ua) && !botWhitelist.some(p => p.test(ua))) {
          const sfd = request.headers['sec-fetch-dest'] ?? '';
          const sfm = request.headers['sec-fetch-mode'] ?? '';
          const al = request.headers['accept-language'] ?? '';
          if (!al || (!sfd && !sfm)) {
            reply.code(200).type('text/plain').send(BLOCK_PAGE);
            return;
          }
        }
      } catch (err) {
        log('preHandler error:', err);
      }
    });

    fastify.addHook('onSend', async (request, reply, payload) => {
      if (typeof payload !== 'string') return payload;
      const path = request.url.split('?')[0];
      if (path.endsWith('/__shugoi/render') || path.endsWith('/__shugoi/healthcheck')) return payload;
      if (reply.statusCode !== 200) return payload;
      const ct = reply.getHeader('content-type');
      if (!ct || String(ct).includes('text/html')) {
        const result = injectGuardScripts(payload, options.siteKey, baseUrl, undefined, restrictedAccess, signingSecret, { url: path });
        return result;
      }
      return payload;
    });
  };
}
