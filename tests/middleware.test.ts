import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createShugoiMiddleware } from '../src/middleware';
import type { ShugoiOptions } from '../src/types';

describe('createShugoiMiddleware', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  const validOptions: ShugoiOptions = {
    siteKey: 'sg_sk_live_xxx',
  };

  function mockReqRes(headers: Record<string, string>, path = '/') {
    const req = { headers, path, url: path } as any;
    const res = {
      _status: 200,
      _body: '',
      _type: '',
      statusCode: 200,
      status(code: number) { this._status = code; return this; },
      type(t: string) { this._type = t; return this; },
      send(b: string) { this._body = b; },
      end(b?: string) { if (b) this._body = b; },
      setHeader: vi.fn(),
      getHeader: vi.fn(),
    };
    return { req, res };
  }

  it('returns a middleware function', () => {
    const mw = createShugoiMiddleware(validOptions);
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3);
  });

  it('blocks curl User-Agent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({ 'user-agent': 'curl/8.0.0' });
    const next = vi.fn();

    await mw(req, res, next);
    expect(res._body).toContain('BLOCKED BY SHUGOI');
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks wget User-Agent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({ 'user-agent': 'wget/1.21' });
    const next = vi.fn();

    await mw(req, res, next);
    expect(res._body).toContain('BLOCKED BY SHUGOI');
  });

  it('blocks Mozilla UA without Sec-Fetch headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const next = vi.fn();

    await mw(req, res, next);
    expect(res._body).toContain('BLOCKED BY SHUGOI');
  });

  it('allows Mozilla UA WITH Sec-Fetch headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
    });
    const next = vi.fn();

    await mw(req, res, next);
    expect(res._body).not.toContain('BLOCKED');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows Googlebot', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({
      'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    });
    const next = vi.fn();

    await mw(req, res, next);
    expect(res._body).not.toContain('BLOCKED');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows whitelisted /legal path', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({ 'user-agent': 'curl/8.0.0' }, '/legal/shugoi-notice');
    const next = vi.fn();

    await mw(req, res, next);
    expect(res._body).not.toContain('BLOCKED');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows custom whitelisted path', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const mw = createShugoiMiddleware({
      siteKey: 'sg_sk_live_xxx',
      allowlist: ['/docs', '/legal'],
    });
    const { req, res } = mockReqRes({ 'user-agent': 'curl/8.0.0' }, '/docs');
    const next = vi.fn();

    await mw(req, res, next);
    expect(res._body).not.toContain('BLOCKED');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets CSP header on response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({});
    const next = vi.fn();

    await mw(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining('script-src')
    );
  });
});
