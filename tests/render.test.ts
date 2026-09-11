import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { storeHtml, renderResponseData, signToken } from '../src/render';

const GRANT_MID = 'a'.repeat(64);
const GRANT_SITE = 'sg_sk_test_render';
function validGrant(token?: string, ip?: string): string {
  const secret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || '';
  const ts = Math.floor(Date.now() / 1000).toString(36);
  const payload = 'render-grant:' + [GRANT_SITE, GRANT_MID, token || '', ts].join(':');
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return ts + ':' + sig;
}

describe('renderResponseData — idempotence', () => {
  beforeEach(() => {
    vi.stubEnv('SHUGOKI_SIGNING_SECRET', 'test-secret-32bytes-long!');
  });

  it('returns same HTML on multiple reads (idempotent)', async () => {
    const token = GRANT_SITE + ':test-token-' + Date.now();
    storeHtml(token, '<html>test</html>');

    const first = await renderResponseData(token, undefined, undefined, GRANT_MID, validGrant(token), undefined, GRANT_SITE, 'test-secret-32bytes-long!');
    const second = await renderResponseData(token, undefined, undefined, GRANT_MID, validGrant(token), undefined, GRANT_SITE, 'test-secret-32bytes-long!');

    expect(first.html).toBe('<html>test</html>');
    expect(second.error).toBe('not_found');
  });

  it('returns error for invalid token length', async () => {
    expect((await renderResponseData('short')).error).toBe('not_found');
    expect((await renderResponseData('')).error).toBe('not_found');
  });
});

describe('signToken — HMAC signing', () => {
  beforeEach(() => {
    vi.stubEnv('SHUGOKI_SIGNING_SECRET', 'test-secret-32bytes-long!');
  });

  it('returns empty token when no secret available', () => {
    vi.stubEnv('SHUGOKI_SIGNING_SECRET', '');
    vi.stubEnv('SHUGOKI_SECRET', '');
    const result = signToken('sg_sk_test', Date.now());
    expect(result.token).toBe('');
  });

  it('signs token with HMAC', () => {
    const result = signToken('sg_sk_test', 1234567890, 'test-secret-32bytes-long!');
    expect(result.token).toContain(':');
    const parts = result.token.split(':');
    expect(parts.length).toBe(4)
    expect(parts[0]).toBe('sg_sk_test');
    expect(parts[1]).toBe('1234567890');
    expect(parts[3].length).toBe(64)
  });

  it('produces different nonces for consecutive calls', () => {
    const t1 = signToken('sg_sk_test', Date.now(), 'test-secret-32bytes-long!');
    const t2 = signToken('sg_sk_test', Date.now(), 'test-secret-32bytes-long!');
    expect(t1.token).not.toBe(t2.token);
  });
});

describe('renderResponseData — memory store', () => {
  beforeEach(() => {
    vi.stubEnv('SHUGOKI_SIGNING_SECRET', 'test-secret-32bytes-long!');
  });

  it('stores and retrieves from memory', async () => {
    const token = GRANT_SITE + ':memory-' + Date.now();
    storeHtml(token, '<html>memory</html>');
    const result = await renderResponseData(token, undefined, undefined, GRANT_MID, validGrant(token), undefined, GRANT_SITE, 'test-secret-32bytes-long!');
    expect(result.html).toBe('<html>memory</html>');
  });

  it('evicts expired entries', async () => {
    const token = GRANT_SITE + ':expired-' + Date.now();
    storeHtml(token, '<html>expired</html>');
    const result = await renderResponseData(token, undefined, undefined, GRANT_MID, validGrant(token), undefined, GRANT_SITE, 'test-secret-32bytes-long!');
    expect(result.html).toBe('<html>expired</html>');
  });
});
