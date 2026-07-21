import { describe, it, expect } from 'vitest';
import { scriptTags } from '../src/scripts';

describe('scriptTags', () => {
  it('returns guard-detect and guard script tags', () => {
    const result = scriptTags({ siteKey: 'sg_sk_live_xxx' });
    expect(result.guardDetect).toBe(
      '<script src="https://shugoi.com/api/v1/guard-detect?key=sg_sk_live_xxx"></script>'
    );
    expect(result.guard).toBe(
      '<script src="https://shugoi.com/api/v1/guard?key=sg_sk_live_xxx"></script>'
    );
  });

  it('uses custom base URL', () => {
    const result = scriptTags({ siteKey: 'sg_sk_live_xxx', baseUrl: 'https://custom.com/api' });
    expect(result.guardDetect).toContain('https://custom.com/api/guard-detect');
    expect(result.guard).toContain('https://custom.com/api/guard');
  });
});
