import type { JsonObject, JsonValue, ShugoiCoreOptions } from './types'
import { injectGuardScripts, enableDiskStore, getConfig } from './render'

import { mergeCsp } from './csp'
import { createCore } from './core'
import { createEvaluateContext } from './evaluate-context'
import { resolveLocale, type Locale } from './locales'
import { isMidAnchorValid } from './cookie-security'

export interface MinimalRequest {
  path?: string; url?: string; ip?: string; method?: string;
  headers?: Record<string, string | string[]>;
  query?: JsonObject;
}
export type ResponseBody = string | Uint8Array | JsonValue;
export interface MinimalResponse {
  setHeader?(k: string, v: string): void;
  getHeader?(k: string): string | number | string[] | undefined;
  status?(code: number): MinimalResponse;
  type?(t: string): MinimalResponse;
  send?(body: ResponseBody): MinimalResponse | Promise<MinimalResponse>;
  end?(body?: ResponseBody, encoding?: string, cb?: () => void): MinimalResponse;
}

interface FastifyRequestLike {
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
    handler: (...args: FastifyHookArguments) => Promise<string | void>,
  ): void;
  get(path: string, handler: (request: FastifyRequestLike, reply: FastifyReplyLike) => Promise<void>): void;
  head(path: string, handler: (request: FastifyRequestLike, reply: FastifyReplyLike) => Promise<FastifyReplyLike>): void;
}

type FastifyHookArguments = [FastifyRequestLike, FastifyReplyLike, string?];

export { DEFAULT_HEADLESS_PATTERNS, BLOCK_PAGE, DEFAULT_BOT_WHITELIST } from './core';

export function createShugoiMiddleware(options: ShugoiCoreOptions) {
  const core = createCore(options);
  const autoInject = options.autoInject ?? true;
  const splitRender = options.splitRender ?? true;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1';
  const internalUrl = options.internalUrl || baseUrl;

  if (options.multiProcess) enableDiskStore(true);

  const middleware = async function shugoiMiddleware(req: MinimalRequest, res: MinimalResponse, next: (...args: never[]) => void) {
    try {
      const path = (req.path ?? req.url ?? '/').split('?')[0] ?? '/';

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
        const ip = (typeof req.headers?.['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
          : undefined) || (typeof req.ip === 'string' ? req.ip : 'unknown');
        const ua = (typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : '') || '';
        const midAnchor = typeof req.headers?.cookie === 'string' ? req.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
        try { console.log('[shugoi:render]', 'mid=' + (q.mid || '').slice(0, 8), 'grant=' + (q.grant ? 'YES' : 'NO'), 'token=' + (q.token || '').slice(0, 40), 'tsAge=' + (Date.now() - (parseInt(String(q.token || '').split(':')[1] || '0', 10) || 0)) + 'ms'); } catch {}
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
      const ip = (typeof req.headers?.['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : undefined) || (typeof req.ip === 'string' ? req.ip : 'unknown');
      const reqLocale: Locale = resolveLocale(options.locale, typeof req.headers?.['accept-language'] === 'string' ? req.headers?.['accept-language'] : undefined);
      const midAnchor = typeof req.headers?.cookie === 'string' ? req.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
      const anchorSecret = signingSecret || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
      let midAnchorOk: boolean | undefined;
      if (anchorSecret) {
        const anchorMid = midAnchor?.split(':')[3] ?? '';
        midAnchorOk = midAnchor && /^[a-f0-9]{64}$/.test(anchorMid)
          ? isMidAnchorValid(midAnchor, ip, ua, anchorMid, { secret: anchorSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1000 })
          : false;
      }

      if (autoInject && options.siteKey) {
        (globalThis as Record<string, unknown>).__sg_trustedClient = false;
        try {
          const { skipPaths } = await getConfig(options.siteKey, internalUrl, signingSecret);
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
        } catch {}
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
        (globalThis as Record<string, unknown>).__sg_trustedClient = true;
      }

      if (autoInject && splitRender && !isBot && !core.isAllowlisted(path)) {
        let injected = false;
        const originalSend = res.send?.bind(res);
        const originalEnd = res.end?.bind(res);

        const doInject = async (body: ResponseBody | undefined): Promise<ResponseBody> => {
          if (injected) return body ?? '';
          if (typeof body === 'string') {
            const ct = res.getHeader ? res.getHeader('content-type') : undefined;
            if (!ct || String(ct).includes('text/html')) {
              try { body = await injectGuardScripts(body, options.siteKey, baseUrl, undefined, restrictedAccess, signingSecret, req, undefined, reqLocale, undefined, midAnchorOk); } catch (e) { core.log('inject error:', String(e)); }
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
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1';

  if (options.multiProcess) enableDiskStore(true);

  return async function shugoiPlugin(fastify: FastifyLike) {
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

    fastify.get('/__shugoi/render', async (request: FastifyRequestLike, reply: FastifyReplyLike) => {
      const { renderResponseData, injectReferrerPolicy } = await import('./render');
      const ip = (typeof request.headers?.['x-forwarded-for'] === 'string'
        ? request.headers['x-forwarded-for'].split(',')[0]?.trim()
        : undefined) || (typeof request.ip === 'string' ? request.ip : 'unknown');
      const data = await renderResponseData(request.query.token || '', undefined, options.baseUrl, request.query.mid || '', request.query.grant || '', ip, options.siteKey);
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
        if (path.endsWith('/__shugoi/render') || path.endsWith('/__shugoi/healthcheck')) return;
        if (core.isAllowlisted(path)) return;

        const ua = request.headers['user-agent'] ?? '';
        const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || 'unknown';

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
          reply.code(decision.status).type(decision.contentType === 'text/html' ? 'text/html' : 'text/plain').send(decision.body);
          return;
        }

        if (typeof request.query?.sg_proof === 'string') {
          const okCookie = core.sgOkCookie(request.query.sg_proof as string, ip, ua);
          if (okCookie) reply.header('Set-Cookie', okCookie);
        }
      } catch (err) {
        core.log('preHandler error:', String(err));
      }
    });

    fastify.addHook('onSend', async (...args: FastifyHookArguments) => {
      const request = args[0];
      const reply = args[1];
      const payload = args[2] ?? '';
      if (typeof payload !== 'string') return payload;
      const path = request.url.split('?')[0] ?? '/';
      if (path.endsWith('/__shugoi/render') || path.endsWith('/__shugoi/healthcheck')) return payload;
      if (reply.statusCode !== 200) return payload;
      const ua = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : '';
      if (core.isWhitelistedBot(ua)) return payload;
      const ct = reply.getHeader?.('content-type');
      if (!ct || String(ct).includes('text/html')) {
        const pluginLocale: Locale = resolveLocale(options.locale, typeof request.headers?.['accept-language'] === 'string' ? request.headers?.['accept-language'] : undefined);
        const pluginIp = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || 'unknown';
        const pluginAnchor = typeof request.headers?.cookie === 'string' ? request.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
        const pluginAnchorSecret = signingSecret || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
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
}
