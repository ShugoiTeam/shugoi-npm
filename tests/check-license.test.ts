import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkLicense } from '../src/check-license';

describe('checkLicense', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns CheckResponse when API succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true, remaining: 9 }),
    });
    const result = await checkLicense({
      siteKey: 'sg_sk_live_xxx',
      action: 'signup',
      machineId: 'abc123',
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('sends correct body to API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    });
    globalThis.fetch = mockFetch;

    await checkLicense({
      siteKey: 'sg_sk_live_xxx',
      action: 'login',
      machineId: 'mid_123',
      signals: { platform: 'Win32' },
      metadata: { ip: '1.2.3.4', email: 'test@test.com' },
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.siteKey).toBe('sg_sk_live_xxx');
    expect(callBody.action).toBe('login');
    expect(callBody.fingerprint.machineId).toBe('mid_123');
    expect(callBody.signals.platform).toBe('Win32');
    expect(callBody.metadata.ip).toBe('1.2.3.4');
  });

  it('throws ShugoiError with invalid_site_key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'invalid_site_key' }),
    });
    await expect(
      checkLicense({ siteKey: 'bad', action: 'signup', machineId: 'abc' })
    ).rejects.toThrow('Invalid siteKey');
  });

  it('throws ShugoiError on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      checkLicense({ siteKey: 'sg_sk_live_xxx', action: 'signup', machineId: 'abc' })
    ).rejects.toThrow('Shugoi API unreachable');
  });

  it('throws ShugoiError on unexpected status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'server_error' }),
    });
    await expect(
      checkLicense({ siteKey: 'sg_sk_live_xxx', action: 'signup', machineId: 'abc' })
    ).rejects.toThrow('API returned status 500');
  });
});
