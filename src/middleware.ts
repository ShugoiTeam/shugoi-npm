import type { ShugoiCoreOptions } from './types'
import { injectGuardScripts, ensureGuardsReady, enableDiskStore, getConfig, storeHtml, signToken, renderResponseData } from './render'

import { mergeCsp } from './csp'
import { createCore, DEFAULT_HEADLESS_PATTERNS, BLOCK_PAGE, DEFAULT_BOT_WHITELIST } from './core'
import { resolveLocale, type Locale } from './locales'

interface MinimalRequest {
  path?: string; url?: string; ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}
interface MinimalResponse {
  setHeader?(k: string, v: string): void;
  getHeader?(k: string): string | number | string[] | undefined;
  status?(code: number): unknown;
  type?(t: string): unknown;
  send?(body: unknown): unknown;
  end?(body?: unknown, ...rest: unknown[]): unknown;
}

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

  return async function shugoiMiddleware(req: MinimalRequest, res: MinimalResponse, next: () => void) {
    try {
      const path = (req.path ?? req.url ?? '/').split('?')[0];

      // Render endpoint — handled by middleware adapter
      if (path.endsWith('/__shugoi/render')) {
        const { handleRender } = await import('./render');
        const q = (req.query && (req.query as Record<string, string>)) || {};
        const ip = (typeof req.headers?.['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
          : undefined) || (typeof req.ip === 'string' ? req.ip : 'unknown');
        // CRITIQUE 1 (§7bis) : le render vérifie que le token appartient à CE site
        // (options.siteKey) — un grant émis par un autre site (pyxelze) est refusé ici.
        return handleRender(q.token || '', res, internalUrl, q.mid || '', q.grant || '', ip, options.siteKey);
      }

      // CSP: merge with existing header
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

      // Delegate evaluation to core
      const ua = (typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : '') || '';
      const ip = (typeof req.headers?.['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : undefined) || (typeof req.ip === 'string' ? req.ip : 'unknown');
      const reqLocale: Locale = resolveLocale(options.locale, typeof req.headers?.['accept-language'] === 'string' ? req.headers?.['accept-language'] : undefined);

      // SkipPaths check BEFORE detection — ces routes contournent toute protection.
      // Audit passe 8 (§3.1) : MATCH EXACT uniquement (plus de prefix-match). Un skipPath
      // `/docs` ne couvre PAS `/docs/anything` — sinon un skipPath large (`/api`, `/`)
      // exposerait toutes les sous-routes sans guard. L'utilisateur liste chaque chemin.
      if (autoInject && options.siteKey) {
        try {
          const { skipPaths } = await getConfig(options.siteKey, internalUrl);
          if (skipPaths?.some((p: string) => path === p)) {
            try {
              // @ts-ignore
              const { renderPage } = await import('../../../server/lib/ssr.js');
              const html = await renderPage(path);
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

      const decision = await core.evaluate({
        path,
        ua,
        ip,
        host: typeof req.headers?.['host'] === 'string' ? req.headers.host : undefined,
        acceptLanguage: typeof req.headers?.['accept-language'] === 'string' ? req.headers['accept-language'] : undefined,
        secFetchDest: typeof req.headers?.['sec-fetch-dest'] === 'string' ? req.headers['sec-fetch-dest'] : undefined,
        secFetchMode: typeof req.headers?.['sec-fetch-mode'] === 'string' ? req.headers['sec-fetch-mode'] : undefined,
        sgProof: (req.query && typeof (req.query as Record<string, unknown>).sg_proof === 'string') ? (req.query as Record<string, unknown>).sg_proof as string : undefined,
      });

      if (decision) {
        if (res.status) res.status(decision.status);
        if (res.type) res.type(decision.contentType.split('/')[1]);
        if (res.send) res.send(decision.body);
        else if (res.end) res.end(decision.body);
        return;
      }

      // Split-render: inject skeleton for HTML pages (skip for allowlisted paths and whitelisted bots)
      const isBot = await core.isTrustedBot(ua, ip);

      if (autoInject && splitRender && !isBot && !core.isAllowlisted(path)) {
        let injected = false;
        const originalSend = res.send?.bind(res) as ((body?: unknown) => unknown) | undefined;
        const originalEnd = res.end?.bind(res) as ((chunk?: unknown, encoding?: string, cb?: () => void) => unknown) | undefined;

        const doInject = async (body: unknown): Promise<unknown> => {
          if (injected) return body;
          if (typeof body === 'string') {
            const ct = res.getHeader ? res.getHeader('content-type') : undefined;
            if (!ct || String(ct).includes('text/html')) {
              try { body = await injectGuardScripts(body, options.siteKey, baseUrl, undefined, restrictedAccess, signingSecret, req as any, undefined, reqLocale); } catch (e) { core.log('inject error:', e); }
              injected = true;
            }
          }
          return body;
        };

        if (originalSend) {
          res.send = function (body: unknown) { return doInject(body).then(b => originalSend(b)); };
        }
        if (originalEnd) {
          res.end = function (chunk?: unknown, encoding?: string, cb?: () => void) {
            doInject(chunk).then(b => {
              if (cb) originalEnd(b, encoding, cb);
              else originalEnd(b, encoding);
            });
            return this;
          };
        }
      }

      next();
    } catch (err) {
      core.log('Unhandled error:', err);
      next();
    }
  };
}

export function createShugoiPlugin(options: ShugoiCoreOptions) {
  const core = createCore(options);
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1';

  if (options.multiProcess) enableDiskStore(true);

  return async function shugoiPlugin(fastify: any) {
    // CSP onRequest hook
    fastify.addHook('onRequest', async (request: any, reply: any) => {
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

    // Render endpoint
    fastify.get('/__shugoi/render', async (request: any, reply: any) => {
      const { renderResponseData } = await import('./render');
      const ip = (typeof request.headers?.['x-forwarded-for'] === 'string'
        ? request.headers['x-forwarded-for'].split(',')[0]?.trim()
        : undefined) || (typeof request.ip === 'string' ? request.ip : 'unknown');
      const data = await renderResponseData(request.query.token || '', undefined, options.baseUrl, request.query.mid || '', request.query.grant || '', ip, options.siteKey);
      reply.send(data);
    });

    fastify.head('/__shugoi/healthcheck', async (request: any, reply: any) => reply.send(''));

    // PreHandler: evaluation pipeline
    fastify.addHook('preHandler', async (request: any, reply: any) => {
      try {
        const path = request.url.split('?')[0];
        if (path.endsWith('/__shugoi/render') || path.endsWith('/__shugoi/healthcheck')) return;
        if (core.isAllowlisted(path)) return;

        const ua = request.headers['user-agent'] ?? '';
        const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || 'unknown';

        const decision = await core.evaluate({
          path,
          ua,
          ip,
          host: request.headers?.host,
          acceptLanguage: request.headers['accept-language'],
          secFetchDest: request.headers['sec-fetch-dest'],
          secFetchMode: request.headers['sec-fetch-mode'],
          sgProof: (request.query && typeof request.query?.sg_proof === 'string') ? request.query.sg_proof as string : undefined,
        });

        if (decision) {
          reply.code(decision.status).type(decision.contentType === 'text/html' ? 'text/html' : 'text/plain').send(decision.body);
          return;
        }
      } catch (err) {
        core.log('preHandler error:', err);
      }
    });

    // onSend: split-render injection
    fastify.addHook('onSend', async (request: any, reply: any, payload: any) => {
      if (typeof payload !== 'string') return payload;
      const path = request.url.split('?')[0];
      if (path.endsWith('/__shugoi/render') || path.endsWith('/__shugoi/healthcheck')) return payload;
      if (reply.statusCode !== 200) return payload;
      const ct = reply.getHeader('content-type');
      if (!ct || String(ct).includes('text/html')) {
        const pluginLocale: Locale = resolveLocale(options.locale, typeof request.headers?.['accept-language'] === 'string' ? request.headers?.['accept-language'] : undefined);
        return await injectGuardScripts(payload, options.siteKey, baseUrl, undefined, restrictedAccess, signingSecret, { url: path } as any, undefined, pluginLocale);
      }
      return payload;
    });
  };
}
