import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { signToken, storeHtml, renderResponseData } from '../src/render';

const SECRET = 'sg_test_module_render_grant';
const SITE_KEY = 'sg_sk_live_render_grant_test';

const mid = 'a'.repeat(64);

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

  it('refuse un grant invalide (mid différent, grant forgé)', async () => {
    const token = signToken(SITE_KEY, Date.now()).token;
    const fakeMid = 'b'.repeat(64);
    const forgedGrant = createHmac('sha256', SECRET).update('render-grant:' + fakeMid).digest('hex');
    expect((await renderResponseData(token, undefined, undefined, fakeMid, forgedGrant)).error).toBe('not_found');
  });

  it('accepte un grant valide pour un token existant', async () => {
    const signed = signToken(SITE_KEY, Date.now());
    const html = '<html><body>secret-content</body></html>';
    storeHtml(signed.token, html);
    const grant = createHmac('sha256', SECRET).update('render-grant:' + mid).digest('hex');
    const res = await renderResponseData(signed.token, undefined, undefined, mid, grant);
    expect(res.html).toBe(html);
  });
});
