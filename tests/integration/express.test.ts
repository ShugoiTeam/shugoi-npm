import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { createShugoiMiddleware } from '../../src/middleware';

function httpGet(url: string, headers: Record<string, string>): Promise<{ body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const req = http.get({
      hostname: opts.hostname,
      port: opts.port,
      path: opts.pathname,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => resolve({ body: data, headers: res.headers }));
    });
    req.on('error', reject);
  });
}

describe('Express integration', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    // Mock Shugoi API + guard script fetches
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

    const app = express();
    app.use(createShugoiMiddleware({
      siteKey: 'sg_sk_live_test',
      allowlist: ['/legal'],
      verifyBots: false,
    }));
    app.get('/', (req, res) => res.send('<html><body>OK</body></html>'));
    app.get('/legal/shugoi-notice', (req, res) => res.send('<html><body>Legal notice</body></html>'));

    return new Promise<void>(resolve => {
      server = app.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.close();
  });

  it('blocks curl User-Agent', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/`, { 'User-Agent': 'curl/8.0.0' });
    expect(body).toContain('BLOCKED BY SHUGOI');
  });

  it('passe au challenge un Mozilla UA sans Sec-Fetch (audit Tor : pas de 403 brut)', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/`, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    // Plus de 403 BLOCKED BY SHUGOI : le guard client gère la détection (Tor → card)
    expect(body).not.toContain('BLOCKED BY SHUGOI');
  });

  it('returns skeleton for browser User-Agent with Sec-Fetch headers', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/`, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'accept-language': 'fr-FR,fr;q=0.9',
    });
    // Split render: returns skeleton with eval, not the original HTML
    expect(body).toContain('<script>eval(');
    expect(body).not.toContain('OK');
  });

  it('allows whitelisted /legal path for any UA', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/legal/shugoi-notice`, {
      'User-Agent': 'curl/8.0.0',
    });
    expect(body).toContain('Legal notice');
  });

  it('returns skeleton for Googlebot', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/`, {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    });
    // Googlebot bypasses headless blocking AND split-render (SEO)
    expect(body).toContain('OK');
    expect(body).not.toContain('<script>eval(');
  });

  it('sets CSP header', async () => {
    const { headers } = await httpGet(`http://127.0.0.1:${port}/`, {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
    });
    const csp = headers['content-security-policy'] as string;
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://shugoi.com");
    expect(csp).toContain("connect-src 'self' https://shugoi.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});
