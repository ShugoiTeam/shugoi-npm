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

    const result = await scriptTags({ siteKey: 'sg_sk_live_xxx' });
    expect(result.guardDetect).toContain('<script>window.__sg_siteKey=');
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

    const result = await scriptTags({ siteKey: 'sg_sk_live_xxx', baseUrl: 'https://custom.com/api' });
    expect(result.guardDetect).toContain('window.__sg_baseUrl="https://custom.com/api"');
    expect(result.guardDetect).not.toContain('eval(');
  });
});
