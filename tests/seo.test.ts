import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createShugoiMiddleware, type MinimalRequest } from '../src/middleware';

describe('SEO — Googlebot receives original HTML', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  function mockGuardFetch() {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('guard-detect') || url.includes('guard?')) {
        return Promise.resolve({ ok: true, text: async () => '(function(){})()' });
      }
      return Promise.resolve({ ok: true, json: async () => ({ allowed: true }) });
    });
  }

  it('Googlebot receives original HTML without eval/skeleton injection', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware({ siteKey: 'sg_sk_live_xxx', signingSecret: 'test-secret-32bytes-long!', verifyBots: false });
    let sentBody = '';
    const req = {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
      path: '/',
    } satisfies MinimalRequest;
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send(b: string) { sentBody = b; },
    };
    const next = vi.fn();

    await mw(req, res, next);
    expect(res.status).toHaveBeenCalled();

    const html = '<!DOCTYPE html><html><head></head><body><h1>OK</h1></body></html>';
    res.send(html);

    expect(sentBody).toContain('<h1>OK</h1>');
    expect(sentBody).not.toContain('<script>window.__sg_siteKey=');
  });

  it('regular browser with Mozilla UA still gets skeleton', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware({ siteKey: 'sg_sk_live_xxx', signingSecret: 'test-secret-32bytes-long!' });
    let sentBody = '';
    const req = {
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'accept-language': 'fr-FR,fr;q=0.9',
      },
      path: '/',
    } satisfies MinimalRequest;
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send(b: string) { sentBody = b; },
    };
    const next = vi.fn();

    await mw(req, res, next);
    expect(res.status).toHaveBeenCalled();

    const html = '<!DOCTYPE html><html><head></head><body><h1>OK</h1></body></html>';
    await res.send(html);

    expect(sentBody).toContain('<h1>OK</h1>');
    expect(sentBody).not.toContain('<script>window.__sg_siteKey=');
    expect(sentBody).not.toContain('eval(');
  });
});
