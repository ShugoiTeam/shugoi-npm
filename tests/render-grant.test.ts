import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { signToken, storeHtml, renderResponseData, verifyRenderGrant, __clearConfigCache } from '../src/render';

const SECRET = 'sg_test_module_render_grant';
const SITE_KEY = 'sg_sk_live_render_grant_test';

const mid = 'a'.repeat(64);

function makeGrant(m: string, token: string, ip: string, siteKey?: string, tsMs?: number): string {
  const sk = siteKey ?? SITE_KEY;
  const t = Math.floor((tsMs ?? Date.now()) / 1000).toString(36);
  const payload = 'render-grant:' + [sk, m, token, ip, t].join(':');
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return t + ':' + sig;
}

beforeAll(() => {
  process.env.SHUGOKI_SIGNING_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.SHUGOKI_SIGNING_SECRET;
});

describe('renderResponseData anti-bypass token-only', () => {
  it('refuse sans grant (mid seul ou rien) — le bypass curl', async () => {
    const token = signToken(SITE_KEY, Date.now()).token;
    expect((await renderResponseData(token)).error).toBe('not_found');
    expect((await renderResponseData(token, undefined, undefined, mid)).error).toBe('not_found');
  });

  it('refuse un grant forgé (mauvais secret / mauvais mid)', async () => {
    const token = signToken(SITE_KEY, Date.now()).token;
    const fakeMid = 'b'.repeat(64);
    const forgedGrant = createHmac('sha256', SECRET).update('render-grant:' + fakeMid).digest('hex');
    expect((await renderResponseData(token, undefined, undefined, fakeMid, forgedGrant)).error).toBe('not_found');
  });

  it('accepte un grant valide lié au token + IP pour un token existant', async () => {
    const signed = signToken(SITE_KEY, Date.now());
    const html = '<html><body>secret-content</body></html>';
    storeHtml(signed.token, html);
    const grant = makeGrant(mid, signed.token, '1.2.3.4');
    const res = await renderResponseData(signed.token, undefined, undefined, mid, grant, '1.2.3.4', SITE_KEY);
    expect(res.html).toBe(html);
  });
});

describe('CH-01 rejeu cross-IP', () => {
  it('refuse un grant signé pour une autre IP', async () => {
    const signed = signToken(SITE_KEY, Date.now());
    storeHtml(signed.token, '<html>x</html>');
    const grant = makeGrant(mid, signed.token, '1.2.3.4');
    // Rejoué depuis une IP différente
    expect((await renderResponseData(signed.token, undefined, undefined, mid, grant, '5.6.7.8', SITE_KEY)).error).toBe('not_found');
  });
});

describe('CH-02 rejeu cross-token', () => {
  it('refuse un grant lié à un autre token', async () => {
    const tokenA = signToken(SITE_KEY, Date.now()).token;
    const tokenB = signToken(SITE_KEY, Date.now()).token;
    storeHtml(tokenB, '<html>y</html>');
    const grantForA = makeGrant(mid, tokenA, '1.2.3.4');
    // Rejoué sur token B avec un grant fait pour A
    expect((await renderResponseData(tokenB, undefined, undefined, mid, grantForA, '1.2.3.4', SITE_KEY)).error).toBe('not_found');
  });
});

describe('CH-03 expiration du grant', () => {
  it('refuse un grant expiré (> 2 min)', async () => {
    const signed = signToken(SITE_KEY, Date.now());
    storeHtml(signed.token, '<html>z</html>');
    const old = Date.now() - 180_000;
    const expiredGrant = makeGrant(mid, signed.token, '1.2.3.4', SITE_KEY, old);
    expect((await renderResponseData(signed.token, undefined, undefined, mid, expiredGrant, '1.2.3.4', SITE_KEY)).error).toBe('not_found');
  });

  it('verifyRenderGrant accepte un grant frais et refuse un grant expiré', () => {
    expect(verifyRenderGrant(mid, makeGrant(mid, 't', '1.2.3.4'), 't', '1.2.3.4', SITE_KEY)).toBe(true);
    expect(verifyRenderGrant(mid, makeGrant(mid, 't', '1.2.3.4', SITE_KEY, Date.now() - 180_000), 't', '1.2.3.4', SITE_KEY)).toBe(false);
  });
});

describe('CH-07 multi-lecture du token (contentReplaceOn)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ whitelistedMachines: [], detectionFlags: { enableContentReplacementCheck: true } }),
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('refuse la 2e lecture d\'un token marqué contentReplaceOn', async () => {
    __clearConfigCache();
    const signed = signToken(SITE_KEY, Date.now());
    storeHtml(signed.token, '<html>once</html>', true);
    const grant = makeGrant(mid, signed.token, '1.2.3.4');
    const first = await renderResponseData(signed.token, undefined, undefined, mid, grant, '1.2.3.4', SITE_KEY);
    expect(first.html).toBe('<html>once</html>');
    const second = await renderResponseData(signed.token, undefined, undefined, mid, grant, '1.2.3.4', SITE_KEY);
    expect(second.error).toBe('not_found');
  });

  it('autorise plusieurs lectures si contentReplaceOn est off (exfiltration OK pour contenu public)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ whitelistedMachines: [], detectionFlags: { enableContentReplacementCheck: false } }),
    }));
    // config fraîche : le cache a peut-être déjà la valeur true du test précédent
    __clearConfigCache();
    const signed = signToken(SITE_KEY, Date.now());
    storeHtml(signed.token, '<html>public</html>', false);
    const grant = makeGrant(mid, signed.token, '1.2.3.4');
    const a = await renderResponseData(signed.token, undefined, undefined, mid, grant, '1.2.3.4', SITE_KEY);
    const b = await renderResponseData(signed.token, undefined, undefined, mid, grant, '1.2.3.4', SITE_KEY);
    expect(a.html).toBe('<html>public</html>');
    expect(b.html).toBe('<html>public</html>');
  });
});

describe('CH-05 pas d\'oracle token (réponses uniformes)', () => {
  it('token mal formé, HMAC invalide et timestamp invalide → même erreur not_found', async () => {
    const malformed = 'short';
    const badSig = 'sg_sk_x:1785598065755:c15bd94a76cbe040:' + '0'.repeat(64);
    const badTs = 'sg_sk_x:notanumber:c15bd94a76cbe040:' + 'f'.repeat(64);
    const r1 = await renderResponseData(malformed);
    const r2 = await renderResponseData(badSig);
    const r3 = await renderResponseData(badTs);
    expect(r1.error).toBe('not_found');
    expect(r2.error).toBe('not_found');
    expect(r3.error).toBe('not_found');
  });
});

describe('§7bis CRITIQUE 1 — grant cross-site (siteKey lié)', () => {
  it('refuse un grant émis par un autre site (siteKey du grant != site)', async () => {
    const { signToken, storeHtml, renderResponseData } = await import('../src/render');
    // Token du site "shugoi"...
    const token = signToken('sg_sk_live_shugoi', Date.now()).token;
    storeHtml(token, '<html>x</html>');
    // ...mais grant signé avec le siteKey "pyxelze" (whitelist off) → refus
    const grant = makeGrant(mid, token, '1.2.3.4', 'sg_sk_live_pyxelze');
    const res = await renderResponseData(token, undefined, undefined, mid, grant, '1.2.3.4', 'sg_sk_live_shugoi');
    expect(res.error).toBe('not_found');
  });

  it('refuse un token dont le siteKey diffère du site (token pyxelze sur shugoi)', async () => {
    const { signToken, storeHtml, renderResponseData } = await import('../src/render');
    const token = signToken('sg_sk_live_pyxelze', Date.now()).token;
    storeHtml(token, '<html>x</html>');
    const grant = makeGrant(mid, token, '1.2.3.4', 'sg_sk_live_pyxelze');
    const res = await renderResponseData(token, undefined, undefined, mid, grant, '1.2.3.4', 'sg_sk_live_shugoi');
    expect(res.error).toBe('not_found');
  });

  it('accepte un grant + token du bon siteKey', async () => {
    const { signToken, storeHtml, renderResponseData } = await import('../src/render');
    const signed = signToken('sg_sk_live_shugoi', Date.now());
    storeHtml(signed.token, '<html>ok</html>');
    const grant = makeGrant(mid, signed.token, '1.2.3.4', 'sg_sk_live_shugoi');
    const res = await renderResponseData(signed.token, undefined, undefined, mid, grant, '1.2.3.4', 'sg_sk_live_shugoi');
    expect(res.html).toBe('<html>ok</html>');
  });
});

describe('passe 8 — expiration du token (verifyTokenAndRead)', () => {
  it('refuse un token signé mais daté au-delà du TTL (store disque rejoué)', async () => {
    const { signToken, storeHtml, renderResponseData } = await import('../src/render');
    const SITE = 'sg_sk_live_render_grant_test';
    // Token vieux de 3 min (au-delà du TOKEN_TTL=120s)
    const old = Date.now() - 180_000;
    const signed = signToken(SITE, old);
    storeHtml(signed.token, '<html>expired-token</html>');
    const grant = makeGrant(mid, signed.token, '1.2.3.4');
    const res = await renderResponseData(signed.token, undefined, undefined, mid, grant, '1.2.3.4', SITE);
    expect(res.error).toBe('not_found');
  });
});

describe('notice injectée dans le render (audit — popup après split-render)', () => {
  it('handleRender injecte le script notice dans le HTML rendu quand mid fourni', async () => {
    const { signToken, storeHtml, handleRender } = await import('../src/render');
    const SITE = 'sg_sk_live_render_grant_test';
    const signed = signToken(SITE, Date.now());
    storeHtml(signed.token, '<html><body><div id=app>x</div></body></html>');
    const grant = makeGrant(mid, signed.token, '1.2.3.4');
    let sentBody = '';
    const res = { setHeader: () => {}, send: (b: string) => { sentBody = b; } };
    await handleRender(signed.token, res as any, undefined, mid, grant, '1.2.3.4', SITE);
    const parsed = JSON.parse(sentBody);
    expect(parsed.html).toContain('__sg_noticeEnabled');
    expect(parsed.html).toContain('__sg_ok');
    expect(parsed.html).toContain('__sg_o');
  });

  it('l injection place le script avant </body>', async () => {
    const { signToken, storeHtml, handleRender } = await import('../src/render');
    const SITE = 'sg_sk_live_render_grant_test';
    const signed = signToken(SITE, Date.now());
    storeHtml(signed.token, '<html><body><div>z</div></body></html>');
    const grant = makeGrant(mid, signed.token, '1.2.3.4');
    let sentBody = '';
    const res = { setHeader: () => {}, send: (b: string) => { sentBody = b; } };
    await handleRender(signed.token, res as any, undefined, mid, grant, '1.2.3.4', SITE);
    const parsed = JSON.parse(sentBody);
    const idxScript = parsed.html.indexOf('__sg_ok');
    const idxBodyClose = parsed.html.indexOf('</body>');
    expect(idxScript).toBeGreaterThan(0);
    expect(idxScript).toBeLessThan(idxBodyClose);
  });
});

describe('nettoyage sg_proof de l URL (audit)', () => {
  it('le skeleton retire ?sg_proof de l URL via history.replaceState (garde le reste du query)', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require('node:path').join(process.cwd(), 'src', 'render.ts'), 'utf-8');
    expect(src).toContain("'sg_proof='");
    expect(src).toContain('history.replaceState');
    expect(src).toContain('location.pathname');
    // conserve le query restant (sg_probe_debug) et retire uniquement sg_proof
    expect(src).toContain("sg_proof=[^&]*");
    expect(src).toContain("_qs?_qs:");
  });
});
