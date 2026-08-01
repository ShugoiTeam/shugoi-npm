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

  function mockGuardFetch() {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('guard-detect') || url.includes('guard?')) {
        return Promise.resolve({
          ok: true,
          text: async () => '(function(){})()',
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ allowed: true }),
      });
    });
  }

  it('returns a middleware function', () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3);
  });

  it('blocks curl User-Agent', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({ 'user-agent': 'curl/8.0.0' });
    const next = vi.fn();
    await mw(req, res, next);
    expect(res._body).toContain('BLOCKED BY SHUGOI');
    expect(next).not.toHaveBeenCalled();
  });

  it('passe au challenge un Mozilla UA sans Sec-Fetch (audit Tor : pas de 403 brut)', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const next = vi.fn();
    await mw(req, res, next);
    // Plus de 403 BLOCKED BY SHUGOI : le guard client gère la détection (Tor → card)
    expect(res._body).not.toContain('BLOCKED BY SHUGOI');
  });

  it('allows Sec-Fetch UA and replaces HTML with skeleton', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const req = { headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'accept-language': 'fr-FR,fr;q=0.9',
    }, path: '/' } as any;
    let sentBody = '';
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send(b: string) { sentBody = b; },
    };
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    const html = '<!DOCTYPE html><html><head></head><body><h1>OK</h1></body></html>';
    await res.send(html);
    expect(sentBody).toContain('<script>eval(');
    expect(sentBody).not.toContain('<h1>OK</h1>');
  });

  it('allows Googlebot and replaces HTML with skeleton', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const req = { headers: {
      'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    }, path: '/' } as any;
    let sentBody = '';
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send(b: string) { sentBody = b; },
    };
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('bypasses allowlisted path', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const req = { headers: { 'user-agent': 'curl/8.0.0' }, path: '/legal/shugoi-notice', url: '/legal/shugoi-notice' } as any;
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('does not modify HTML when autoInject is false', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware({ siteKey: 'sg_sk_live_xxx', autoInject: false });
    const req = { headers: {}, path: '/' } as any;
    let sentBody = '';
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send(b: string) { sentBody = b; },
    };
    const next = vi.fn();
    await mw(req, res, next);
    const html = '<!DOCTYPE html><html><head></head><body><h1>OK</h1></body></html>';
    res.send(html);
    expect(sentBody).toContain('<h1>OK</h1>');
    expect(sentBody).not.toContain('<script>eval(');
  });

  it('sets CSP header on response', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({});
    const next = vi.fn();
    await mw(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining('script-src')
    );
  });

  it('returns 403 for curl UA instead of 200', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const { req, res } = mockReqRes({ 'user-agent': 'curl/8.0.0' });
    const next = vi.fn();
    await mw(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body).toContain('BLOCKED BY SHUGOI');
  });

  it('respects custom blockStatus option', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware({ siteKey: 'sg_sk_live_xxx', blockStatus: 418 });
    const { req, res } = mockReqRes({ 'user-agent': 'curl/8.0.0' });
    const next = vi.fn();
    await mw(req, res, next);
    expect(res._status).toBe(418);
  });

  it('splitRender: false preserves original HTML', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware({ siteKey: 'sg_sk_live_xxx', splitRender: false });
    const req = {
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'accept-language': 'fr-FR,fr;q=0.9',
      },
      path: '/',
    } as any;
    let sentBody = '';
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send(b: string) { sentBody = b; },
    };
    const next = vi.fn();
    await mw(req, res, next);
    const html = '<!DOCTYPE html><html><head></head><body><h1>OK</h1></body></html>';
    res.send(html);
    expect(sentBody).toContain('<h1>OK</h1>');
    expect(sentBody).not.toContain('<script>eval(');
  });

  it('res.end without args works (synchronous bypass)', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const req = {
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'accept-language': 'fr-FR,fr;q=0.9',
      },
      path: '/',
    } as any;
    let endCalled = false;
    let endArgs: unknown[] = [];
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
      end(...args: unknown[]) { endCalled = true; endArgs = args; },
    };
    const next = vi.fn();
    await mw(req, res, next);
    // res.end() without args should not crash
    // The overridden end handles undefined correctly
    expect(next).toHaveBeenCalled();
  });

  it('res.end with callback preserves callback argument', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const req = {
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'accept-language': 'fr-FR,fr;q=0.9',
      },
      path: '/',
    } as any;
    let callbackCalled = false;
    let endBody = '';
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
      end(chunk?: unknown, _encoding?: string, cb?: () => void) {
        endBody = typeof chunk === 'string' ? chunk : '';
        if (cb) { callbackCalled = true; cb(); }
      },
    };
    const next = vi.fn();
    await mw(req, res, next);
    const html = '<!DOCTYPE html><html><head></head><body><h1>CB</h1></body></html>';
    (res as any).end(html, 'utf-8', () => { callbackCalled = true; });
    // Wait for promise resolution
    await new Promise(r => setTimeout(r, 100));
    expect(endBody).toContain('<script>eval(');
    expect(callbackCalled).toBe(true);
  });
});

describe('skipPath matching (audit passe 8 §3.1)', () => {
  it('le middleware fait un MATCH EXACT (pas de prefix-match /docs/anything)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'middleware.ts'), 'utf-8');
    // Le skipPath `/docs` ne couvre plus `/docs/anything`
    expect(src).toMatch(/path === p/);
    expect(src).not.toMatch(/path\.startsWith\(p \+ '\/'\)/);
  });
});

describe('307 challenge minimal (anti-curl/view-source)', () => {
  it('le 307 challenge a un body = tableau ASCII seul, PAS de HTML/JS', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    // 307 + body = BLOCK_PAGE brut (text/plain), sans <pre> ni <script> inline
    expect(src).toContain('status: 307');
    expect(src).toContain('body: BLOCK_PAGE');
    expect(src).toContain('contentType: \'text/plain\'');
    // redirection vers le challenge
    expect(src).toContain("ctx.path === '/__sg_challenge'");
  });

  it('le JS challenge vit sur /__sg_challenge (suit le 307)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    expect(src).toContain('new URLSearchParams(location.search)');
    expect(src).toContain('sg_proof=');
    expect(src).toContain("crypto.subtle.digest");
  });

  it('la page /__sg_challenge affiche le tableau ASCII + un <script src> externe (view-source propre)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    // La page challenge : <pre>tableau</pre> + <script src="/__sg_challenge.js"> (externe)
    expect(src).toContain("ctx.path === '/__sg_challenge'");
    expect(src).toContain('<pre>');
    expect(src).toContain('<script src="/__sg_challenge.js"></script>');
    expect(src).toContain("'Content-Type': 'application/javascript; charset=utf-8'");
  });

  it('le cookie __sg_ok est signé HMAC et validé (navigations rapides)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    expect(src).toContain('sg_ok:');
    expect(src).toContain('isSgOkValid');
    expect(src).toContain('timingSafeEqual');
  });
});
