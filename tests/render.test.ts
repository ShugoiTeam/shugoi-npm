import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeHtml, renderResponseData, signToken } from '../src/render';

describe('renderResponseData — idempotence', () => {
  it('returns same HTML on multiple reads (idempotent)', () => {
    const token = 'test-token-for-idempotence-' + Date.now();
    storeHtml(token, '<html>test</html>');

    const first = renderResponseData(token);
    const second = renderResponseData(token);

    expect(first.html).toBe('<html>test</html>');
    expect(second.html).toBe('<html>test</html>');
  });

  it('returns error for invalid token length', () => {
    expect(renderResponseData('short').error).toBe('not_found');
    expect(renderResponseData('').error).toBe('not_found');
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
    const result = signToken('sg_sk_test', 1234567890);
    expect(result.token).toContain(':');
    const parts = result.token.split(':');
    expect(parts.length).toBe(4); // siteKey:timestamp:nonce:sig
    expect(parts[0]).toBe('sg_sk_test');
    expect(parts[1]).toBe('1234567890');
    expect(parts[3].length).toBe(64); // SHA-256 hex
  });

  it('produces different nonces for consecutive calls', () => {
    const t1 = signToken('sg_sk_test', Date.now());
    const t2 = signToken('sg_sk_test', Date.now());
    expect(t1.token).not.toBe(t2.token);
  });
});

describe('renderResponseData — memory store', () => {
  it('stores and retrieves from memory', () => {
    const token = 'memory-test-token-' + Date.now();
    storeHtml(token, '<html>memory</html>');
    const result = renderResponseData(token);
    expect(result.html).toBe('<html>memory</html>');
  });

  it('evicts expired entries', async () => {
    const token = 'expired-token-' + Date.now();
    storeHtml(token, '<html>expired</html>');
    const result = renderResponseData(token);
    expect(result.html).toBe('<html>expired</html>');
  });
});
