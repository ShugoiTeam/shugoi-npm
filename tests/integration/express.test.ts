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
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const app = express();
    app.use(createShugoiMiddleware({
      siteKey: 'sg_sk_live_test',
      allowlist: ['/legal'],
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
    expect(body).toBe('BLOCKED BY SHUGOI');
  });

  it('blocks Mozilla UA without Sec-Fetch headers', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/`, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    expect(body).toBe('BLOCKED BY SHUGOI');
  });

  it('allows browser User-Agent with Sec-Fetch headers', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/`, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
    });
    expect(body).toContain('OK');
  });

  it('allows whitelisted /legal path for any UA', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/legal/shugoi-notice`, {
      'User-Agent': 'curl/8.0.0',
    });
    expect(body).toContain('Legal notice');
  });

  it('allows Googlebot', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/`, {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    });
    expect(body).toContain('OK');
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
  });
});
