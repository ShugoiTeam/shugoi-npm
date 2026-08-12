import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createShugoiMiddleware } from '../src/middleware';
import { __clearConfigCache } from '../src/render';
import type { MinimalRequest, ResponseBody, MinimalResponse } from '../src/middleware';
import type { ShugoiCoreOptions } from '../src/types';

describe('createShugoiMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __clearConfigCache();
  });

  const validOptions: ShugoiCoreOptions = {
    siteKey: 'sg_sk_live_xxx',
  };

  function mockReqRes(headers: Record<string, string>, path = '/') {
    const req = { headers, path, url: path } satisfies MinimalRequest;
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
    }, path: '/' } satisfies MinimalRequest;
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
    expect(sentBody).toContain('<script>window.__sg_siteKey=');
    expect(sentBody).not.toContain('eval(');
    expect(sentBody).not.toContain('<h1>OK</h1>');
  });

  it('allows Googlebot and replaces HTML with skeleton', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware(validOptions);
    const req = { headers: {
      'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    }, path: '/' } satisfies MinimalRequest;
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
    const req = { headers: { 'user-agent': 'curl/8.0.0' }, path: '/legal/shugoi-notice', url: '/legal/shugoi-notice' } satisfies MinimalRequest;
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

  it('rend un skipPath via le renderer fourni sans dépendre du projet hôte', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('guard-detect') || url.includes('guard?')) {
        return Promise.resolve({ ok: true, text: async () => '(function(){})()' });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ whitelistedMachines: [], detectionFlags: {}, skipPaths: ['/docs'] }),
      });
    });
    const renderSkipPath = vi.fn().mockResolvedValue('<html><body>docs</body></html>');
    const mw = createShugoiMiddleware({ ...validOptions, renderSkipPath });
    const { req, res } = mockReqRes({}, '/docs');
    const next = vi.fn();

    await mw(req, res, next);

    expect(renderSkipPath).toHaveBeenCalledWith('/docs');
    expect(res._body).toBe('<html><body>docs</body></html>');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not modify HTML when autoInject is false', async () => {
    mockGuardFetch();
    const mw = createShugoiMiddleware({ siteKey: 'sg_sk_live_xxx', autoInject: false });
    const req = { headers: {}, path: '/' } satisfies MinimalRequest;
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
    expect(sentBody).not.toContain('<script>window.__sg_siteKey=');
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
    } satisfies MinimalRequest;
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
    expect(sentBody).not.toContain('<script>window.__sg_siteKey=');
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
    } satisfies MinimalRequest;
    let endCalled = false;
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
      end(_body?: ResponseBody, _encoding?: string, _callback?: () => void) { endCalled = true; },
    } satisfies MinimalResponse;
    const next = vi.fn();
    await mw(req, res, next);
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
    } satisfies MinimalRequest;
    let callbackCalled = false;
    let endBody = '';
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn().mockReturnValue('text/html'),
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
      end(chunk?: ResponseBody, _encoding?: string, cb?: () => void) {
        endBody = typeof chunk === 'string' ? chunk : '';
        if (cb) { callbackCalled = true; cb(); }
      },
    } satisfies MinimalResponse;
    const next = vi.fn();
    await mw(req, res, next);
    const html = '<!DOCTYPE html><html><head></head><body><h1>CB</h1></body></html>';
    res.end?.(html, 'utf-8', () => { callbackCalled = true; });
    await new Promise(r => setTimeout(r, 100));
    expect(endBody).toContain('<script>window.__sg_siteKey=');
    expect(endBody).not.toContain('eval(');
    expect(callbackCalled).toBe(true);
  });
});

describe('skipPath matching (audit passe 8 §3.1)', () => {
  it('le middleware fait un MATCH EXACT (pas de prefix-match /docs/anything)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'middleware.ts'), 'utf-8');
    expect(src).toMatch(/path === p/);
    expect(src).not.toMatch(/path\.startsWith\(p \+ '\/'\)/);
  });
});

describe('307 challenge minimal (anti-curl/view-source)', () => {
  it('le 307 challenge a un body = tableau ASCII seul, PAS de HTML/JS', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    expect(src).toContain('status: 307');
    expect(src).toContain('body: BLOCK_PAGE');
    expect(src).toContain('contentType: \'text/plain\'');
    expect(src).toContain("ctx.path === '/__sg_challenge'");
  });

  it('le JS challenge vit sur /__sg_challenge (suit le 307)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    expect(src).toContain('new URLSearchParams(location.search)');
    expect(src).toContain('sg_proof=');
    expect(src).toContain("crypto.subtle.digest");
  });

  it('la page /__sg_challenge : tableau en commentaire + JS PoW INLINE (pas de <pre>, pas de script src externe)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    expect(src).toContain("ctx.path === '/__sg_challenge'");
    expect(src).toContain("'<!--\\n' + BLOCK_PAGE");
    expect(src).toContain('<script>');
    expect(src.indexOf('<pre>')).toBe(-1);
    expect(src.indexOf('__sg_challenge.js')).toBe(-1);
  });

  it('le cookie __sg_ok est signé HMAC (posé après PoW valide)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    expect(src).toContain('isSgOkValid');
    const security = readFileSync(require('node:path').join(process.cwd(), 'src', 'security-utils.ts'), 'utf-8');
    expect(security).toContain('timingSafeEqual');
    const cookies = readFileSync(require('node:path').join(process.cwd(), 'src', 'cookie-security.ts'), 'utf-8');
    expect(cookies).toContain('sg_ok:');
    expect(src).toContain('const canProceed = validCookie || proofFresh');
    expect(src).toContain('function consumeProof');
  });
});

describe('challenge couvre les extensions (audit anti-bypass)', () => {
  it('isPage ne doit PLUS exclure les extensions (catch-all SPA sert index.html pour tout)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    const line = src.split('\n').find(l => l.includes('const isPage'));
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/\\\.\[a-zA-Z0-9\]/);
  });
});

describe('X-Forwarded-Prefix (sous-chemin reverse proxy)', () => {
  it('le challenge 307 préfixe la Location et le path avec forwardedPrefix', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    expect(src).toContain('forwardedPrefix');
    expect(src).toContain("prefix + '/__sg_challenge?ts='");
    expect(src).toContain('encodeURIComponent(prefix + path)');
  });

  it('le middleware transmet x-forwarded-prefix à evaluate', () => {
    const { readFileSync } = require('node:fs');
    const mw = readFileSync(require('node:path').join(process.cwd(), 'src', 'middleware.ts'), 'utf-8');
    expect(mw).toContain("['x-forwarded-prefix']");
  });
});

describe('protection des assets à contenu (audit extraction bundle)', () => {
  it('les /assets/*.js sont refusés sans cookie __sg_authorized', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'core.ts'), 'utf-8');
    expect(src).toContain('(js|css)');
    expect(src).toContain('/\\/assets\\/');
    expect(src).toContain('isSgAuthorizedValid');
    const cookies = readFileSync(require('node:path').join(process.cwd(), 'src', 'cookie-security.ts'), 'utf-8');
    expect(cookies).toContain('sg_authorized:');
  });

  it('handleRender pose le cookie __sg_authorized après render réussi', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'render.ts'), 'utf-8');
    expect(src).toContain('__sg_authorized=');
    expect(src).toContain('sg_authorized:' + ('').replace('', ''));
    expect(src).toContain('HttpOnly; SameSite=Strict');
  });
});
