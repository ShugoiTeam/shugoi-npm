import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withShugoi } from '../src/next/with-shugoi';
import { createShugoiProxy, SHUGOI_MATCHER } from '../src/next/index';
import { renderResponseData as nextRenderResponseData } from '../src/next/middleware';

describe('withShugoi', () => {
  it('adds a headers function to config', () => {
    const result = withShugoi({ siteKey: 'sg_sk_live_xxx' }, {});
    expect(result).toHaveProperty('headers');
    expect(typeof result.headers).toBe('function');
  });

  it('returns CSP header from headers()', async () => {
    const result = withShugoi({ siteKey: 'sg_sk_live_xxx' }, {});
    if (typeof result.headers !== 'function') throw new Error('headers must be callable');
    const headers = await result.headers();
    expect(headers).toHaveLength(1);
    expect(headers[0].source).toBe('/(.*)');
    expect(headers[0].headers[0].key).toBe('Content-Security-Policy');
    expect(headers[0].headers[0].value).toContain('https://shugoi.com');
  });

  it('merges with existing config', () => {
    const result = withShugoi({ siteKey: 'sg_sk_live_xxx' }, { reactStrictMode: true });
    expect(result.reactStrictMode).toBe(true);
  });

  it('merges with existing headers', async () => {
    const result = withShugoi({ siteKey: 'sg_sk_live_xxx' }, {
      async headers() {
        return [{ source: '/api/(.*)', headers: [{ key: 'X-Custom', value: 'val' }] }];
      },
    });

    if (typeof result.headers !== 'function') throw new Error('headers must be callable');
    const headers = await result.headers();
    expect(headers).toHaveLength(2);
    expect(headers[0].source).toBe('/api/(.*)');
    expect(headers[1].source).toBe('/(.*)');
  });
});

describe('createShugoiProxy', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  function mockRequest(path: string, ua: string) {
    return {
      nextUrl: { pathname: path },
      headers: {
        get(name: string) {
          const map: Record<string, string> = {
            'user-agent': ua,
            'accept': 'text/html',
          };
          return map[name.toLowerCase()] ?? null;
        },
      },
      url: 'http://localhost:3000' + path,
    } satisfies Parameters<ReturnType<typeof createShugoiProxy>>[0];
  }

  it('blocks curl User-Agent with 403', async () => {
    const proxy = createShugoiProxy({ siteKey: 'sg_sk_live_test', signingSecret: 'test-secret-32bytes-long!', target: 'http://127.0.0.1:3001' });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<html>test</html>' });

    const req = mockRequest('/', 'curl/8.0.0');
    const res = await proxy(req);
    expect(res.status).toBe(403);
  });

  it('allows regular browser User-Agent', async () => {
    const proxy = createShugoiProxy({ siteKey: 'sg_sk_live_test', signingSecret: 'test-secret-32bytes-long!', target: 'http://127.0.0.1:3001' });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<html>test</html>' });
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('guard-detect') || url.includes('guard?')) {
        return Promise.resolve({ ok: true, text: async () => '(function(){})()' });
      }
      return Promise.resolve({ ok: true, json: async () => ({ allowed: true }), text: async () => '<html>test</html>' });
    });

    const req = mockRequest('/', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    const res = await proxy(req);
    expect(res).toBeDefined();
  });

  it('SHUGOI_MATCHER excludes Next.js internals', () => {
    expect(SHUGOI_MATCHER).toContain('_next/static');
    expect(SHUGOI_MATCHER).toContain('_next/image');
    expect(SHUGOI_MATCHER).toContain('favicon.ico');
  });
});

describe('renderResponseData (adapter Next) — parité render-grant NP-01', () => {
  const SECRET = 'sg_test_next_grant';

  beforeEach(() => {
    vi.stubEnv('SHUGOKI_SIGNING_SECRET', SECRET);
    vi.stubEnv('SHUGOKI_SECRET', '');
  });

  it('refuse le render sans grant (bypass token-only)', () => {
    const res = nextRenderResponseData('some-token-1234567890');
    expect(res.error).toBe('not_found');
  });

  it('refuse un grant forgé (mid différent du secret)', () => {
    const crypto = require('node:crypto');
    const fakeMid = 'b'.repeat(64);
    const forgedGrant = crypto.createHmac('sha256', SECRET).update('render-grant:' + fakeMid).digest('hex');
    const res = nextRenderResponseData('some-token-1234567890', fakeMid, forgedGrant);
    expect(res.html).toBeUndefined();
  });
});
