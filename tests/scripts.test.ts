import { describe, it, expect, vi } from 'vitest';
import { scriptTags } from '../src/scripts';

describe('scriptTags', () => {
  it('returns a directly executable skeleton', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('guard-detect') || url.includes('guard?')) {
        return Promise.resolve({
          ok: true,
          text: async () => '(function(){})()',
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const result = await scriptTags({ siteKey: 'sg_sk_live_xxx', signingSecret: 'test-secret-32bytes-long!' });
    expect(result.guardDetect).toMatch(/script/);
    expect(result.guardDetect).not.toContain('eval(');
  });

  it('uses custom base URL', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('guard-detect') || url.includes('guard?')) {
        return Promise.resolve({
          ok: true,
          text: async () => '(function(){})()',
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const result = await scriptTags({ siteKey: 'sg_sk_live_xxx', signingSecret: 'test-secret-32bytes-long!', baseUrl: 'https://custom.com/api' });
    expect(result.guardDetect).toMatch(/script/);
    expect(result.guardDetect).not.toContain('eval(');
  });
});
