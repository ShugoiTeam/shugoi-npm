import { NextRequest, NextResponse } from 'next/server.js';
import { decodeInvisibleBootstrapPath, enableDiskStore, injectGuardScripts, readLatestBootstrap, renderResponseData as renderData } from '../render';
import { BLOCK_PAGE } from '../block-page';
import { buildCsp, originOf } from '../csp';
import { INTERNAL_HEADER, signInternalRequest, verifyInternalRequest } from './internal-request';

export interface ShugoiNextOptions {
  siteKey: string;
  baseUrl?: string;
  /** Trusted origin of the application, configured by its operator (never from Host). */
  origin?: string | undefined;
  allowlist?: string[];
  whitelist?: string[];
  signingSecret?: string;
  headlessPatterns?: RegExp[];
}

const DEFAULT_HEADLESS = [/^curl/i, /^wget/i, /^python/i, /^Go-http-client/i, /^Java\//, /HTTPie/i, /^node-fetch/i, /axios/i, /^okhttp/i, /^scrapy/i, /PowerShell/i, /WinHttp/i];
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie' };
const INVISIBLE_LOADER = "(function(){var done=false;function deliver(t){if(done||!t)return;done=true;document.write(t);try{document.close()}catch(e){}}function fallback(){if(done)return;fetch('/__shugoi/bootstrap/http',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.text():''}).then(deliver).catch(function(){})}try{var ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/__shugoi/bootstrap/ws');var timer=setTimeout(function(){try{ws.close()}catch(e){}fallback()},2500);ws.onmessage=function(e){clearTimeout(timer);deliver(e.data);try{ws.close()}catch(x){}};ws.onerror=function(){clearTimeout(timer);fallback()}}catch(e){fallback()}})()";

export async function renderResponseData(token: string, mid?: string, grant?: string, ip?: string, expectedSiteKey?: string, secret?: string, baseUrl?: string) {
  return renderData(token, undefined, baseUrl, mid, grant, ip, expectedSiteKey, secret);
}

export function createShugoiNextMiddleware(options: ShugoiNextOptions) {
  const baseUrl = options.baseUrl ?? 'https://api.shugoi.com/api/v1';
  const secret = options.signingSecret;
  if (!secret) throw new Error('Shugoi requires an explicit site signing secret');
  const configuredApiOrigin = originOf(baseUrl);
  const responseHeaders = {
    ...PRIVATE_HEADERS,
    'content-security-policy': buildCsp(configuredApiOrigin
      ? { siteKey: options.siteKey, apiOrigin: configuredApiOrigin }
      : { siteKey: options.siteKey }),
  };
  let origin: URL | undefined;
  if (options.origin) {
    origin = new URL(options.origin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('Shugoi origin must be an HTTP(S) origin without credentials, path, query or fragment');
    }
  }
  enableDiskStore(true);
  // Use Next's own URL normalization (including loopback aliases) for the proof.
  const expectedOrigin = origin ? new URL(new NextRequest(origin).url).origin : undefined;
  const failure = (status = 503) => new NextResponse(BLOCK_PAGE, { status, headers: responseHeaders });

  return async function shugoiMiddleware(request: NextRequest) {
    const path = request.nextUrl.pathname;
    if (decodeInvisibleBootstrapPath(path.slice(1))) {
      return new NextResponse(INVISIBLE_LOADER, { status: 200, headers: { ...PRIVATE_HEADERS, 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, no-transform' } });
    }
    if (path === '/__shugoi/bootstrap/http') {
      const bootstrap = readLatestBootstrap();
      return bootstrap
        ? new NextResponse(bootstrap, { status: 200, headers: { ...PRIVATE_HEADERS, 'content-type': 'application/javascript; charset=utf-8' } })
        : new NextResponse('bootstrap_unavailable', { status: 404, headers: PRIVATE_HEADERS });
    }
    const cookie = request.headers.get('cookie') || '';
    const marker = request.headers.get(INTERNAL_HEADER);
    if (marker) {
      if (!expectedOrigin || new URL(request.url).origin !== expectedOrigin || !verifyInternalRequest(marker, secret, options.siteKey, request.url, cookie, request.method || 'GET')) return failure(403);
      const headers = new Headers(request.headers);
      headers.delete(INTERNAL_HEADER);
      return NextResponse.next({ request: { headers }, headers: responseHeaders });
    }
    if (path.endsWith('/__shugoi/render')) {
      if (request.method !== 'GET') return failure(405);
      try {
        const query = request.nextUrl.searchParams;
        const data = await renderResponseData(query.get('token') || '', query.get('mid') || '', query.get('grant') || '', undefined, options.siteKey, secret, baseUrl);
        return NextResponse.json(data, { headers: responseHeaders });
      } catch { return failure(); }
    }
    // API routes require application authentication; only static Next assets are public here.
    if (path.startsWith('/_next/static/') || path === '/_next/image' || path.startsWith('/api/')) return NextResponse.next();
    if (options.allowlist?.some(p => path === p || path.startsWith(p + '/'))) return NextResponse.next();
    const ua = request.headers.get('user-agent') || '';
    if ((options.headlessPatterns ?? DEFAULT_HEADLESS).some(pattern => pattern.test(ua))) return failure(403);
    if ((request.method || 'GET') !== 'GET' && request.method !== 'HEAD') return failure(405);
    // Never hand RSC/data responses to an unauthorised request by changing Accept.
    if (!(request.headers.get('accept') || '').includes('text/html')) return failure(406);
    if (!origin || !secret) return failure();
    try {
      const url = new URL(origin.origin);
      // nextUrl.pathname omits basePath. Preserve the actual request path while
      // retaining only the operator-configured origin for the internal fetch.
      url.pathname = new URL(request.url).pathname;
      url.search = new URL(request.url).search;
      const fetchOptions: NonNullable<Parameters<typeof fetch>[1]> & { cache: 'no-store' } = {
        headers: { accept: 'text/html', 'user-agent': 'Shugoi', cookie, [INTERNAL_HEADER]: signInternalRequest(secret, options.siteKey, new NextRequest(url).url, cookie) },
        redirect: 'error', cache: 'no-store',
      };
      const internal = await fetch(url, { ...fetchOptions, signal: AbortSignal.timeout(5000) });
      if (!internal.ok) return failure();
      const skeleton = await injectGuardScripts(
        await internal.text(), options.siteKey, baseUrl, options.whitelist, true, secret,
        undefined, undefined, undefined, undefined, undefined,
        `${request.nextUrl.basePath || ''}/__shugoi/render`,
      );
      return new NextResponse(skeleton, { status: 200, headers: { ...responseHeaders, 'content-type': 'text/html; charset=utf-8' } });
    } catch { return failure(); }
  };
}
