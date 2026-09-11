import { requestIp, type PeerRequest } from './request-ip';
import type { JsonObject, JsonValue, ShugoiCoreOptions } from './types'
import { injectGuardScripts, enableDiskStore, getConfig, getConfigAvailability, decodeInvisibleBootstrapPath, readLatestBootstrap } from './render'

import { mergeCsp } from './csp'
import { createCore } from './core'
import { createEvaluateContext } from './evaluate-context'
import { resolveLocale, type Locale } from './locales'
import { isMidAnchorValid } from './cookie-security'
import { BLOCK_PAGE, DEFAULT_HEADLESS_PATTERNS } from './core'
import { canServeDegradedPath } from './availability'

export interface MinimalRequest extends PeerRequest {
  path?: string; url?: string; ip?: string; method?: string;
  headers?: Record<string, string | string[]>;
  query?: JsonObject;
}
export type ResponseBody = string | Uint8Array | JsonValue;
export interface MinimalResponse {
  setHeader?(k: string, v: string | string[]): void;
  getHeader?(k: string): string | number | string[] | undefined;
  status?(code: number): MinimalResponse;
  type?(t: string): MinimalResponse;
  send?(body: ResponseBody): MinimalResponse | Promise<MinimalResponse>;
  end?(body?: ResponseBody, encoding?: string, cb?: () => void): MinimalResponse;
}

interface FastifyRequestLike extends PeerRequest {
  url: string;
  ip?: string;
  headers: Record<string, string>;
  query: Record<string, string>;
}

interface FastifyReplyLike {
  statusCode: number;
  getHeader?(name: string): string | number | string[] | undefined;
  header(name: string, value: string): FastifyReplyLike;
  code(status: number): FastifyReplyLike;
  type(contentType: string): FastifyReplyLike;
  send(body: string | Record<string, string | boolean | number | null>): FastifyReplyLike;
}

interface FastifyLike {
  addHook(
    name: 'onRequest' | 'preHandler' | 'onSend',
    handler: (...args: FastifyHookArguments) => Promise<string | void | FastifyReplyLike>,
  ): void;
  get(path: string, handler: (request: FastifyRequestLike, reply: FastifyReplyLike) => Promise<void>): void;
  head(path: string, handler: (request: FastifyRequestLike, reply: FastifyReplyLike) => Promise<FastifyReplyLike>): void;
}

type FastifyHookArguments = [FastifyRequestLike, FastifyReplyLike, string?];

const runtimeGlobal = globalThis as typeof globalThis & {
  __sg_trustedClient?: boolean;
};

export { DEFAULT_HEADLESS_PATTERNS, BLOCK_PAGE, DEFAULT_BOT_WHITELIST } from './core';

export function createShugoiMiddleware(options: ShugoiCoreOptions) {
  const core = createCore(options);
  const autoInject = options.autoInject ?? true;
  const splitRender = options.splitRender ?? true;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? 'https://api.shugoi.com/api/v1';
  const internalUrl = options.internalUrl || baseUrl;
  const renderTransport = 'websocket';
  let siteFlags: Record<string, unknown> | null = null;
  let previousAvailability: 'fresh' | 'degraded' | 'expired' | 'rejected' | null = null;

  if (options.multiProcess) enableDiskStore(true);

  const middleware = async function shugoiMiddleware(req: MinimalRequest, res: MinimalResponse, next: (...args: never[]) => void) {
    try {
      const path = (req.path ?? req.url ?? '/').split('?')[0] ?? '/';

      if (path === '/__shugoi/availability' && options.availabilityDiagnostics === true) {
        const state = getConfigAvailability(options.siteKey, internalUrl, signingSecret, options.degradedAvailability?.maxStaleMs);
        if (res.setHeader) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
        }
        const body = JSON.stringify({ state, checkedAt: Math.floor(Date.now() / 1000) * 1000 });
        if (res.status) res.status(200);
        if (res.send) res.send(body); else if (res.end) res.end(body);
        return;
      }

      // Static dependencies are loaded by the browser before the WLC grant is
      // available. Let the host's static middleware serve them with their real
      // MIME type; HTML/document requests still go through the full guard.
      if (/\/assets\/[^/]+\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|ico)$/i.test(path)) {
        return next();
      }

      // The compact loader intentionally uses an invisible same-origin URL.
      // The protected bootstrap is delivered by /__shugoi/bootstrap/ws; this
      // response must remain a tiny opener rather than exposing the guard.
      if (path.startsWith('/') && decodeInvisibleBootstrapPath(path.slice(1))) {
        if (res.setHeader) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
          res.setHeader('X-Content-Type-Options', 'nosniff');
        }
      const loader = "(function(){var done=false;function deliver(t){if(done||!t)return;done=true;document.write(t);try{document.close()}catch(e){}}function fallback(){if(done)return;fetch('/__shugoi/bootstrap/http',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.text():''}).then(deliver).catch(function(){})}try{var ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/__shugoi/bootstrap/ws');var timer=setTimeout(function(){try{ws.close()}catch(e){}fallback()},2500);ws.onmessage=function(e){clearTimeout(timer);deliver(e.data);try{ws.close()}catch(x){}};ws.onerror=function(){clearTimeout(timer);fallback()}}catch(e){fallback()}})()";
        if (res.end) res.end(loader);
        else if (res.send) res.send(loader);
        return;
      }

      if (path === '/__shugoi/bootstrap/http') {
        const bootstrap = readLatestBootstrap();
        if (!bootstrap) { if (res.status) res.status(404); if (res.end) res.end('bootstrap_unavailable'); return; }
        if (res.setHeader) { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); }
        if (res.end) res.end(bootstrap); else if (res.send) res.send(bootstrap);
        return;
      }

      if (path.endsWith('/__shugoi/render')) {
        const m = String((req.method || 'GET')).toUpperCase();
        if (m !== 'GET' && m !== 'HEAD') {
          if (res.status) res.status(405);
          if (res.type) res.type('application/json');
          const body = JSON.stringify({ error: 'method_not_allowed' });
          if (res.send) res.send(body);
          else if (res.end) res.end(body);
          return;
        }
        const { handleRender } = await import('./render');
        const q = (req.query && (req.query as Record<string, string>)) || {};
        const ip = requestIp(req);
        const ua = (typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : '') || '';
        const midAnchor = typeof req.headers?.cookie === 'string' ? req.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
        return handleRender(q.token || '', res, internalUrl, q.mid || '', q.grant || '', ip, options.siteKey, baseUrl, signingSecret, ua, midAnchor || undefined);
      }

      if (path === '/__sg_challenge') {
        const m = String((req.method || 'GET')).toUpperCase();
        if (m !== 'GET' && m !== 'HEAD') {
          if (res.status) res.status(405);
          if (res.type) res.type('application/json');
          const body = JSON.stringify({ error: 'method_not_allowed' });
          if (res.send) res.send(body);
          else if (res.end) res.end(body);
          return;
        }
      }

      if (core.cspEnabled && res.setHeader) {
        if (res.getHeader) {
          const existing = res.getHeader('Content-Security-Policy');
          res.setHeader('Content-Security-Policy', mergeCsp(
            typeof existing === 'string' ? existing : undefined,
            core.csp,
          ));
        } else {
          res.setHeader('Content-Security-Policy', core.csp);
        }
      }

      const ua = (typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : '') || '';
      const ip = requestIp(req);
      const reqLocale: Locale = resolveLocale(options.locale, typeof req.headers?.['accept-language'] === 'string' ? req.headers?.['accept-language'] : undefined);
      const midAnchor = typeof req.headers?.cookie === 'string' ? req.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
      const anchorSecret = signingSecret;
      let midAnchorOk: boolean | undefined;
      if (anchorSecret) {
        const anchorMid = midAnchor?.split(':')[3] ?? '';
        midAnchorOk = midAnchor && /^[a-f0-9]{64}$/.test(anchorMid)
          ? isMidAnchorValid(midAnchor, ip, ua, anchorMid, { secret: anchorSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1000 })
          : false;
      }

      if (autoInject && options.siteKey) {
        runtimeGlobal.__sg_trustedClient = false;
        try {
          // The configured application allowlist is an explicit public
          // contract. Keep it reachable during a control-plane outage; all
          // other routes still go through the signed availability policy.
          if (options.degradedAvailability?.mode === 'public-last-known'
            && (options.degradedAvailability.allowPaths ?? []).includes(path)
            && core.isAllowlisted(path)) return next();
          siteFlags = await getConfig(options.siteKey, internalUrl, signingSecret) as Record<string, unknown>;
          const degraded = options.degradedAvailability;
          const availability = getConfigAvailability(options.siteKey, internalUrl, signingSecret, degraded?.maxStaleMs);
          if (degraded?.onStateChange && availability !== previousAvailability) {
            if (previousAvailability === 'degraded' || previousAvailability === 'expired' || previousAvailability === 'rejected') {
              degraded.onStateChange(availability === 'fresh' ? 'recovered' : availability === 'expired' ? 'expired' : 'degraded');
            } else if (availability !== 'fresh') {
              degraded.onStateChange(availability === 'expired' ? 'expired' : 'degraded');
            }
          }
          previousAvailability = availability === 'recovered' ? 'fresh' : availability;
          const allowDegraded = canServeDegradedPath(path, degraded ?? {}, availability);
          if (allowDegraded) {
            if (res.setHeader) res.setHeader('X-Shugoi-Availability', 'degraded');
            return next();
          }
          // An unavailable or unverifiable control plane must never become an
          // implicit bypass. Only explicitly allow-listed public paths may
          // continue in public-last-known mode; protected paths fail closed.
          if (availability !== 'fresh') {
            if (res.setHeader) {
              res.setHeader('X-Shugoi-Availability', availability);
              res.setHeader('Cache-Control', 'no-store');
              res.setHeader('Retry-After', '30');
            }
            if (res.status) res.status(503);
            if (res.type) res.type('text/plain');
            const unavailable = 'Shugoi configuration is temporarily unavailable.';
            if (res.end) res.end(unavailable);
            else if (res.send) res.send(unavailable);
            return;
          }
          const configuredFlags = (siteFlags.flags as Record<string, boolean> | undefined) ?? {};
          const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
          if (configuredFlags.enableHeadlessCheck === true && ua && headlessPatterns.some((pattern) => pattern.test(ua))) {
            if (res.status) res.status(options.blockStatus ?? 403);
            if (res.type) res.type('text/plain');
            if (res.end) res.end(BLOCK_PAGE);
            else if (res.send) res.send(BLOCK_PAGE);
            return;
          }
          const skipPaths = siteFlags.skipPaths as string[] | undefined;
          if (skipPaths?.some((p: string) => path === p)) {
            try {
              if (!options.renderSkipPath) return next();
              const html = await options.renderSkipPath(path);
              if (res.setHeader) res.setHeader('Content-Type', 'text/html; charset=utf-8');
              if (res.send) res.send(html);
              else if (res.end) res.end(html);
              return;
            } catch (ssrErr) {
              return next();
            }
          }
        } catch {
          // A failed refresh can throw before a response is parsed. Treat the
          // control plane as unavailable here as well; otherwise execution
          // would fall through to the application and create a silent bypass.
          const degraded = options.degradedAvailability;
          const availability = getConfigAvailability(options.siteKey, internalUrl, signingSecret, degraded?.maxStaleMs);
          if (canServeDegradedPath(path, degraded ?? {}, availability)) {
            if (res.setHeader) res.setHeader('X-Shugoi-Availability', 'degraded');
            return next();
          }
          if (res.setHeader) {
            res.setHeader('X-Shugoi-Availability', availability);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Retry-After', '30');
          }
          if (res.status) res.status(503);
          if (res.type) res.type('text/plain');
          const unavailable = 'Shugoi configuration is temporarily unavailable.';
          if (res.end) res.end(unavailable);
          else if (res.send) res.send(unavailable);
          return;
        }
      }

      const decision = await core.evaluate(createEvaluateContext(path, ua, ip, {
        mid: null,
        host: typeof req.headers?.['host'] === 'string' ? req.headers.host : null,
        acceptLanguage: typeof req.headers?.['accept-language'] === 'string' ? req.headers['accept-language'] : null,
        secFetchDest: typeof req.headers?.['sec-fetch-dest'] === 'string' ? req.headers['sec-fetch-dest'] : null,
        secFetchMode: typeof req.headers?.['sec-fetch-mode'] === 'string' ? req.headers['sec-fetch-mode'] : null,
        sgProof: typeof req.query?.sg_proof === 'string' ? req.query.sg_proof : null,
        sgOk: typeof req.headers?.cookie === 'string' ? req.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] ?? null : null,
        sgAuthorized: typeof req.headers?.cookie === 'string' ? req.headers.cookie.match(/(?:^|;\s*)__sg_authorized=([^;]+)/)?.[1] ?? null : null,
        sgMidAnchor: midAnchor,
        forwardedPrefix: typeof req.headers?.['x-forwarded-prefix'] === 'string' ? req.headers['x-forwarded-prefix'] : null,
      }));

      if (decision) {
        if (decision.headers) {
          for (const [k, v] of Object.entries(decision.headers)) {
            if (res.setHeader) res.setHeader(k, v);
          }
        }
        if (res.status) res.status(decision.status);
        if (decision.headers && decision.headers['Content-Type']) {
          if (res.setHeader) res.setHeader('Content-Type', decision.headers['Content-Type']);
        } else if (res.setHeader) {
          res.setHeader('Content-Type', decision.contentType);
        } else if (res.type) {
          res.type(decision.contentType);
        }
        if (decision.body) {
          if (typeof decision.body === 'string' && decision.body.includes('__sg_wlcRequest') && res.setHeader) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
          }
          if (res.send) res.send(decision.body);
          else if (res.end) res.end(decision.body);
        } else if (res.end) {
          res.end();
        }
        return;
      }

      const sgProofQ = typeof req.query?.sg_proof === 'string' ? req.query.sg_proof : undefined;
      if (sgProofQ && res.setHeader) {
        const okCookie = core.sgOkCookie(sgProofQ, ip, ua);
        if (okCookie) res.setHeader('Set-Cookie', okCookie);
      }

      const isBot = (await core.isTrustedBot(ua, ip)) || core.isWhitelistedBot(ua);

      // Client de confiance (cookie __sg_ok valide) → on skippe le loader « Vérification »
      // dans le bootcode (pas de flash à chaque refresh).
      const okCookie = typeof req.headers?.cookie === 'string' ? req.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] ?? null : null;
      if (okCookie && core.isOkCookieValid(okCookie, ip, ua)) {
        runtimeGlobal.__sg_trustedClient = true;
      }

      // With headless protection disabled, the site explicitly opts into
      // crawler/AI-readable SSR. Do not replace that HTML with the browser-only
      // bootstrap loader; the core policy still handles all enabled checks.
      const crawlerReadable = (siteFlags?.flags as Record<string, boolean> | undefined)?.enableHeadlessCheck === false;
      if (autoInject && splitRender && !crawlerReadable && !isBot && !core.isAllowlisted(path)) {
        let injected = false;
        const originalSend = res.send?.bind(res);
        const originalEnd = res.end?.bind(res);

        const doInject = async (body: ResponseBody | undefined): Promise<ResponseBody> => {
          if (injected) return body ?? '';
          if (typeof body === 'string') {
            const ct = res.getHeader ? res.getHeader('content-type') : undefined;
            if (!ct || String(ct).includes('text/html')) {
              try { body = await injectGuardScripts(body, options.siteKey, baseUrl, undefined, restrictedAccess, signingSecret, req, undefined, reqLocale, undefined, midAnchorOk, './__shugoi/render', renderTransport); } catch (e) { core.log('inject error:', String(e)); }
              injected = true;
            }
          }
          return body ?? '';
        };

        if (originalSend) {
          res.send = function (body: ResponseBody) { return doInject(body).then(b => originalSend?.(b) ?? res); };
        }
        if (originalEnd) {
          res.end = function (chunk?: ResponseBody, encoding?: string, cb?: () => void) {
            doInject(chunk).then(b => {
              if (cb) originalEnd?.(b, encoding, cb);
              else originalEnd?.(b, encoding);
            });
            return this;
          };
        }
      }

      next();
    } catch (err) {
      core.log('Unhandled error:', String(err));
      next();
    }
  };

  return async (req: object, res: object, next: (...args: never[]) => void): Promise<void> =>
    middleware(req as MinimalRequest, res as MinimalResponse, next);
}

export function createShugoiPlugin(options: ShugoiCoreOptions) {
  const core = createCore(options);
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? 'https://api.shugoi.com/api/v1';

  if (options.multiProcess) enableDiskStore(true);

  const plugin = async function shugoiPlugin(instance: object) {
    // Keep Fastify's generic types out of non-Fastify consumers' declarations.
    const fastify = instance as FastifyLike;
    if (!fastify || typeof fastify.addHook !== 'function' || typeof fastify.get !== 'function' || typeof fastify.head !== 'function') {
      throw new TypeError('Shugoi requires a Fastify instance');
    }
    fastify.addHook('onRequest', async (...args: FastifyHookArguments) => {
      const reply = args[1];
      if (core.cspEnabled && reply.getHeader) {
        const existing = reply.getHeader('Content-Security-Policy');
        reply.header('Content-Security-Policy', mergeCsp(
          typeof existing === 'string' ? existing : undefined,
          core.csp,
        ));
      } else if (core.cspEnabled) {
        reply.header('Content-Security-Policy', core.csp);
      }
    });

    if (options.availabilityDiagnostics === true) {
      fastify.get('/__shugoi/availability', async (_request: FastifyRequestLike, reply: FastifyReplyLike) => {
        const state = getConfigAvailability(options.siteKey, options.internalUrl || baseUrl, signingSecret, options.degradedAvailability?.maxStaleMs);
        reply.header('cache-control', 'no-store').header('x-content-type-options', 'nosniff').type('application/json; charset=utf-8').send({ state, checkedAt: Math.floor(Date.now() / 1000) * 1000 });
      });
    }

    fastify.get('/__shugoi/render', async (request: FastifyRequestLike, reply: FastifyReplyLike) => {
      const { renderResponseData, injectReferrerPolicy } = await import('./render');
      const ip = requestIp(request);
      const data = await renderResponseData(request.query.token || '', undefined, options.internalUrl || baseUrl, request.query.mid || '', request.query.grant || '', ip, options.siteKey, signingSecret);
      if (data.html) data.html = injectReferrerPolicy(data.html);
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
      reply.header('Pragma', 'no-cache');
      reply.send(data);
    });

    fastify.head('/__shugoi/healthcheck', async (_request: FastifyRequestLike, reply: FastifyReplyLike) => reply.send(''));

    fastify.addHook('preHandler', async (...args: FastifyHookArguments) => {
      const request = args[0];
      const reply = args[1];
      try {
        const path = request.url.split('?')[0] ?? '/';
        if (path.endsWith('/__shugoi/render') || path.endsWith('/__shugoi/healthcheck') || path === '/__shugoi/availability') return;
        if (options.degradedAvailability?.mode === 'public-last-known'
          && (options.degradedAvailability.allowPaths ?? []).includes(path)
          && core.isAllowlisted(path)) return;
        await getConfig(options.siteKey, options.internalUrl || baseUrl, signingSecret);
        const availability = getConfigAvailability(options.siteKey, options.internalUrl || baseUrl, signingSecret, options.degradedAvailability?.maxStaleMs);
        const canContinueDegraded = canServeDegradedPath(path, options.degradedAvailability ?? {}, availability);
        if (availability !== 'fresh' && !canContinueDegraded) {
          return reply.code(503).header('cache-control', 'no-store').header('retry-after', '30').header('x-shugoi-availability', availability).type('text/plain').send('Shugoi configuration is temporarily unavailable.');
        }
        if (canContinueDegraded) {
          return reply.header('x-shugoi-availability', 'degraded');
        }
        const ua = request.headers['user-agent'] ?? '';
        const ip = requestIp(request);

        const decision = await core.evaluate(createEvaluateContext(path, ua, ip, {
          mid: null,
          host: request.headers?.host ?? null,
          acceptLanguage: request.headers['accept-language'] ?? null,
          secFetchDest: request.headers['sec-fetch-dest'] ?? null,
          secFetchMode: request.headers['sec-fetch-mode'] ?? null,
          sgProof: request.query && typeof request.query?.sg_proof === 'string' ? request.query.sg_proof : null,
          sgOk: typeof request.headers.cookie === 'string' ? request.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] ?? null : null,
          sgAuthorized: typeof request.headers.cookie === 'string' ? request.headers.cookie.match(/(?:^|;\s*)__sg_authorized=([^;]+)/)?.[1] ?? null : null,
          sgMidAnchor: typeof request.headers.cookie === 'string' ? request.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null,
          forwardedPrefix: typeof request.headers['x-forwarded-prefix'] === 'string' ? request.headers['x-forwarded-prefix'] : null,
        }));

        if (decision) {
          if (decision.headers) {
            for (const [k, v] of Object.entries(decision.headers)) reply.header(k, v);
          }
          return reply.code(decision.status).type(decision.contentType === 'text/html' ? 'text/html' : 'text/plain').send(decision.body);
        }

        if (typeof request.query?.sg_proof === 'string') {
          const okCookie = core.sgOkCookie(request.query.sg_proof as string, ip, ua);
          if (okCookie) reply.header('Set-Cookie', okCookie);
        }
      } catch (err) {
        core.log('preHandler error:', String(err));
        return reply.code(503).type('application/json').send({ error: 'protection_unavailable' });
      }
    });

    fastify.addHook('onSend', async (...args: FastifyHookArguments) => {
      const request = args[0];
      const reply = args[1];
      const payload = args[2] ?? '';
      if (typeof payload !== 'string') return payload;
      const path = request.url.split('?')[0] ?? '/';
      if (path === '/__sg_challenge' || path.endsWith('/__shugoi/render') || path.endsWith('/__shugoi/healthcheck')) return payload;
      if (reply.statusCode !== 200) return payload;
      const ua = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : '';
      if (core.isWhitelistedBot(ua)) return payload;
      const ct = reply.getHeader?.('content-type');
      if (!ct || String(ct).includes('text/html')) {
        const pluginLocale: Locale = resolveLocale(options.locale, typeof request.headers?.['accept-language'] === 'string' ? request.headers?.['accept-language'] : undefined);
        const pluginIp = requestIp(request);
        const pluginAnchor = typeof request.headers?.cookie === 'string' ? request.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
        const pluginAnchorSecret = signingSecret;
        let pluginMidAnchorOk: boolean | undefined;
        if (pluginAnchorSecret) {
          const pluginAnchorMid = pluginAnchor?.split(':')[3] ?? '';
          pluginMidAnchorOk = pluginAnchor && /^[a-f0-9]{64}$/.test(pluginAnchorMid)
            ? isMidAnchorValid(pluginAnchor, pluginIp, ua, pluginAnchorMid, { secret: pluginAnchorSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1000 })
            : false;
        }
        return await injectGuardScripts(payload, options.siteKey, baseUrl, undefined, restrictedAccess, signingSecret, { url: path }, undefined, pluginLocale, undefined, pluginMidAnchorOk);
      }
      return payload;
    });
  };
  // Apply hooks to the registration scope and its descendants, as expected
  // from app.register(createShugoiPlugin(...)), not an empty child scope.
  Object.defineProperty(plugin, Symbol.for('skip-override'), { value: true });
  Object.defineProperty(plugin, Symbol.for('fastify.display-name'), { value: 'shugoi' });
  return plugin;
}
