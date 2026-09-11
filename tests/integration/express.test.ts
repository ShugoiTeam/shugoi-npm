import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { createShugoiMiddleware } from '../../src/middleware';
import { signAvailabilitySnapshot } from '../../src/availability';

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
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('validate-key')) {
        return Promise.resolve({ ok: true, json: async () => ({ valid: true }) });
      }
      if (url.includes('/whitelist')) {
        const snapshot = signAvailabilitySnapshot({ version: 1, siteKey: 'sg_sk_live_test', fetchedAt: Date.now(), flags: {}, skipPaths: [] }, 'test-secret-32bytes-long!');
        return Promise.resolve({ ok: true, json: async () => ({ whitelistedMachines: [], detectionFlags: {}, skipPaths: [], availabilitySnapshot: snapshot }) });
      }
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
      signingSecret: 'test-secret-32bytes-long!',
      allowlist: ['/legal'],
      verifyBots: false,
    }));
    app.get('/', (req, res) => res.send('<html><body>OK</body></html>'));
    app.get('/legal/shugoi-notice', (req, res) => res.send('<html><body>Legal notice</body></html>'));

    return new Promise<void>(resolve => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address === null || typeof address === 'string') throw new Error('server address unavailable');
        port = address.port;
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
    expect(body).not.toContain('BLOCKED BY SHUGOI');
  });

  it('returns skeleton for browser User-Agent with Sec-Fetch headers', async () => {
    const { body } = await httpGet(`http://127.0.0.1:${port}/`, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'accept-language': 'fr-FR,fr;q=0.9',
    });
    expect(body).toContain('BLOCKED BY SHUGOI');
    expect(body).not.toContain('eval(');
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
    expect(body).toContain('OK');
    expect(body).not.toContain('<script>window.__sg_siteKey=');
  });

  it('bypass le challenge PoW pour les bots whitelistés (og:image / SEO) mais challenge un UA navigateur', async () => {
    const { createCore } = await import('../../src/core');
    const prev = process.env.SHUGOKI_SIGNING_SECRET;
    process.env.SHUGOKI_SIGNING_SECRET = 'test-secret-pow';
    try {
      const core = createCore({ siteKey: 'sg_sk_live_test', signingSecret: 'test-secret-pow', verifyBots: false, allowlist: [] });
      const bot = await core.evaluate({ path: '/', ua: 'facebookexternalhit/1.1', ip: '1.2.3.4' });
      expect(bot).toBeNull();
      const tw = await core.evaluate({ path: '/', ua: 'Twitterbot/1.0', ip: '1.2.3.4' });
      expect(tw).toBeNull();
      const browser = await core.evaluate({ path: '/', ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', ip: '1.2.3.4', secFetchDest: 'document', secFetchMode: 'navigate', acceptLanguage: 'en' });
      expect(browser?.status).toBe(307);
    } finally {
      if (prev === undefined) delete process.env.SHUGOKI_SIGNING_SECRET;
      else process.env.SHUGOKI_SIGNING_SECRET = prev;
    }
  });

  it("Discordbot est STRICT (UA + IP vérifiée par reverse-DNS) : un curl qui imite l'UA Discord depuis une IP aléatoire est traité comme un visiteur normal (F1 403), pas bypassé. facebookexternalhit (sans vérif d'IP) reste lenient (UA seul).", async () => {
    const { createCore } = await import('../../src/core');
    const prev = process.env.SHUGOKI_SIGNING_SECRET;
    process.env.SHUGOKI_SIGNING_SECRET = 'test-secret-pow';
    try {
      const core = createCore({ siteKey: 'sg_sk_live_test', signingSecret: 'test-secret-pow', allowlist: [] });
      const fakeDiscord = await core.evaluate({ path: '/', ua: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', ip: '1.2.3.5' });
      expect(fakeDiscord?.status).toBe(403);
      const fb = await core.evaluate({ path: '/', ua: 'facebookexternalhit/1.1', ip: '1.2.3.5' });
      expect(fb).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.SHUGOKI_SIGNING_SECRET;
      else process.env.SHUGOKI_SIGNING_SECRET = prev;
    }
  });

  it("Discordbot avec verifyBots:false (IP non vérifiée par choix) → bypass autorisé (UA whitelisté)", async () => {
    const { createCore } = await import('../../src/core');
    const prev = process.env.SHUGOKI_SIGNING_SECRET;
    process.env.SHUGOKI_SIGNING_SECRET = 'test-secret-pow';
    try {
      const core = createCore({ siteKey: 'sg_sk_live_test', signingSecret: 'test-secret-pow', verifyBots: false, allowlist: [] });
      const discord = await core.evaluate({ path: '/', ua: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', ip: '1.2.3.5' });
      expect(discord).toBeNull();
      const fakeBrowser = await core.evaluate({ path: '/', ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120', ip: '1.2.3.6' });
      expect(fakeBrowser?.status).toBe(403);
    } finally {
      if (prev === undefined) delete process.env.SHUGOKI_SIGNING_SECRET;
      else process.env.SHUGOKI_SIGNING_SECRET = prev;
    }
  });

  it('sets CSP header', async () => {
    const { headers } = await httpGet(`http://127.0.0.1:${port}/`, {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
    });
    const csp = headers['content-security-policy'] as string;
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://shugoi.com");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("connect-src 'self' https://shugoi.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});
