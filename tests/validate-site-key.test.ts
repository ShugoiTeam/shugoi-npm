import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateSiteKey } from '../src/validate-site-key';

describe('validateSiteKey', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns valid=true when API responds with allowed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true, remaining: 9 }),
    });
    const result = await validateSiteKey({ siteKey: 'sg_sk_live_valid' });
    expect(result.valid).toBe(true);
  });

  it('returns valid=false when API responds with invalid_site_key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'invalid_site_key' }),
    });
    const result = await validateSiteKey({ siteKey: 'sg_sk_live_invalid' });
    expect(result.valid).toBe(false);
  });

  it('returns mode=test for test keys', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });
    const result = await validateSiteKey({ siteKey: 'sg_sk_test_xxx' });
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('test');
  });

  it('returns mode=live for live keys', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });
    const result = await validateSiteKey({ siteKey: 'sg_sk_live_xxx' });
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('live');
  });

  it('throws ShugoiError on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      validateSiteKey({ siteKey: 'sg_sk_live_xxx' })
    ).rejects.toThrow('Shugoi API unreachable');
  });

  it('throws ShugoiError on timeout', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const controller = new AbortController();
      controller.abort();
      return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
    });
    await expect(
      validateSiteKey({ siteKey: 'sg_sk_live_xxx', timeout: 1 })
    ).rejects.toThrow('API request timed out');
  });
});
