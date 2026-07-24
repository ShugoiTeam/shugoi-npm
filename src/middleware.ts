// @ts-nocheck
import { injectGuardScripts, ensureGuardsReady } from './render';

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

function shieldPage(title, msg, badge, host) {
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Itim&display=swap" rel="stylesheet"><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:Itim,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:"Alex Brush",cursive;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon.png alt class=l><img src=https://shugoi.com/brand.png alt class=b><div class=bdg>' + (badge || 'Blocage') + '</div><h2>' + (title || 'Acc\u00e8s bloqu\u00e9') + '</h2><p class=desc>' + (msg || '') + '</p><p class=ft>' + (host || 'shugoi.com') + ' \u00b7 Shugoi</p></div></body></html>';
}

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
let _cachedFlags = null;
let _flagsFetchedAt = 0;

export function createShugoiMiddleware(options) {
  const allowlist = options.allowlist ?? ['/legal'];
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST;
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1';
  const debug = options.debug ?? false;
  const autoInject = options.autoInject ?? true;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret;
  // Pre-fetch guard scripts so first request doesn't block
  ensureGuardsReady(baseUrl).catch(() => {});
  const csp = buildCsp({ siteKey: options.siteKey, extraDirectives: {} });

  function log(...args) { if (debug) console.log('[shugoi]', ...args); }
  async function getFlags() {
    if (_cachedFlags && Date.now() - _flagsFetchedAt < 10000) return _cachedFlags;
    try {
      const res = await fetch(baseUrl + '/whitelist?key=' + encodeURIComponent(options.siteKey));
      if (res.ok) { const d = await res.json(); _cachedFlags = d.detectionFlags || {}; _flagsFetchedAt = Date.now(); return _cachedFlags; }
    } catch {}
    return _cachedFlags || {};
  }

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

      const flags = await getFlags();

      // Allowlist bypass (rate limit only applies to pages, not assets)
      if (allowlist.some(p => path === p || path.startsWith(p + '/'))) return next();

      // Rate limit check (respects dashboard toggle)
      if (flags.enableRateLimit !== false) {
        try {
          const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
          const rlRes = await fetch(baseUrl + '/rate-limit-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteKey: options.siteKey, fingerprint: { browser: ip }, metadata: { ip, userAgent: req.headers?.['user-agent'] || '', middleware: true } }),
            signal: AbortSignal.timeout(2000)
          });
          if (rlRes.ok) {
            const rlData = await rlRes.json();
            if (rlData.allowed === false) {
              if (res.status) res.status(429);
              const remain = Math.max(0, Math.ceil((rlData.resetAt - Date.now()) / 1000));
              const mins = Math.floor(remain / 60);
              const secs = remain % 60;
              const timeStr = mins > 0 ? mins + ' min' + (mins > 1 ? 's' : '') + (secs > 0 ? ' ' + secs + ' s' : '') : secs + ' seconde' + (secs > 1 ? 's' : '');
              if (res.send) res.send(shieldPage('Trop de requ\u00eates', "Vous avez effectu\u00e9 trop de requ\u00eates en peu de temps. Il reste " + timeStr + " avant de pouvoir r\u00e9essayer.", 'Rate Limit', req.headers?.host));
              return;
            }
          }
        } catch (e) {}
      }

      // Headless UA block (respects dashboard toggle)
      const ua = req.headers?.['user-agent'] ?? '';
      if (flags.enableHeadlessCheck !== false && ua && !botWhitelist.some(p => p.test(ua)) && headlessPatterns.some(p => p.test(ua))) {
        log('headless block:', ua.slice(0, 40));
        fetch(baseUrl + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteKey: options.siteKey, reason: 'headless' }), signal: AbortSignal.timeout(2000) }).catch(() => {});
        if (res.status) res.status(200);
        if (res.type) res.type('txt');
        if (res.send) res.send(BLOCK_PAGE); else if (res.end) res.end(BLOCK_PAGE);
        return;
      }

      // Sec-Fetch + Accept-Language check for fake browsers (respects dashboard toggle)
      if (flags.enableHeadlessCheck !== false && /Mozilla/i.test(ua) && !botWhitelist.some(p => p.test(ua))) {
        const sfd = req.headers?.['sec-fetch-dest'] ?? '';
        const sfm = req.headers?.['sec-fetch-mode'] ?? '';
        const al = req.headers?.['accept-language'] ?? '';
        if (!al || (!sfd && !sfm)) {
          log('fake browser block:', ua.slice(0, 40));
          fetch(baseUrl + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteKey: options.siteKey, reason: 'headless' }), signal: AbortSignal.timeout(2000) }).catch(() => {});
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
        const doInject = async (body) => {
          if (injected) return body;
          if (typeof body === 'string') {
            const ct = res.getHeader ? res.getHeader('content-type') : undefined;
            if (!ct || String(ct).includes('text/html')) {
              try { body = await injectGuardScripts(body, options.siteKey, baseUrl, undefined, restrictedAccess, signingSecret, req); } catch (e) { log('inject error:', e); }
              injected = true;
            }
          }
          return body;
        };
        if (originalSend) { res.send = function (body) { return doInject(body).then(b => originalSend(b)); }; }
        if (originalEnd) { res.end = function (body) { return doInject(body).then(b => originalEnd(b)); }; }
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
  // Pre-fetch guard scripts so first request doesn't block
  ensureGuardsReady(baseUrl).catch(() => {});
  const csp = buildCsp({ siteKey: options.siteKey, extraDirectives: {} });

  function log(...args) { if (debug) console.log('[shugoi]', ...args); }
  async function getFlags() {
    if (_cachedFlags && Date.now() - _flagsFetchedAt < 10000) return _cachedFlags;
    try {
      const res = await fetch(baseUrl + '/whitelist?key=' + encodeURIComponent(options.siteKey));
      if (res.ok) { const d = await res.json(); _cachedFlags = d.detectionFlags || {}; _flagsFetchedAt = Date.now(); return _cachedFlags; }
    } catch {}
    return _cachedFlags || {};
  }

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

        // Pre-load guard scripts to avoid timeout in onSend
        await ensureGuardsReady(baseUrl).catch(() => {});

        const flags = await getFlags();

        // Rate limit check (respects dashboard toggle)
        if (flags.enableRateLimit !== false) {
          try {
            const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || 'unknown';
            const rlRes = await fetch(baseUrl + '/rate-limit-check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ siteKey: options.siteKey, fingerprint: { browser: ip }, metadata: { ip, userAgent: request.headers['user-agent'] || '', middleware: true } }),
              signal: AbortSignal.timeout(2000)
            });
            if (rlRes.ok) {
              const rlData = await rlRes.json();
              if (rlData.allowed === false) {
                const remain = Math.max(0, Math.ceil((rlData.resetAt - Date.now()) / 1000));
                const mins = Math.floor(remain / 60);
                const secs = remain % 60;
                const timeStr = mins > 0 ? mins + ' min' + (mins > 1 ? 's' : '') + (secs > 0 ? ' ' + secs + ' s' : '') : secs + ' seconde' + (secs > 1 ? 's' : '');
                reply.code(429).type('text/html').send(shieldPage('Trop de requ\u00eates', "Vous avez effectu\u00e9 trop de requ\u00eates en peu de temps. Il reste " + timeStr + " avant de pouvoir r\u00e9essayer.", 'Rate Limit', request.headers?.host));
                return;
              }
            }
          } catch (e) {}
        }

        const ua = request.headers['user-agent'] ?? '';
        if (flags.enableHeadlessCheck !== false && ua && !botWhitelist.some(p => p.test(ua)) && headlessPatterns.some(p => p.test(ua))) {
          fetch(baseUrl + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteKey: options.siteKey, reason: 'headless' }), signal: AbortSignal.timeout(2000) }).catch(() => {});
          reply.code(200).type('text/plain').send(BLOCK_PAGE);
          return;
        }
        if (flags.enableHeadlessCheck !== false && /Mozilla/i.test(ua) && !botWhitelist.some(p => p.test(ua))) {
          const sfd = request.headers['sec-fetch-dest'] ?? '';
          const sfm = request.headers['sec-fetch-mode'] ?? '';
          const al = request.headers['accept-language'] ?? '';
          if (!al || (!sfd && !sfm)) {
fetch(baseUrl + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteKey: options.siteKey, reason: 'headless' }), signal: AbortSignal.timeout(2000) }).catch(() => {});
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
        return await injectGuardScripts(payload, options.siteKey, baseUrl, undefined, restrictedAccess, signingSecret, { url: path });
      }
      return payload;
    });
  };
}
