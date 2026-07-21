import { describe, it, expect } from 'vitest';
import { buildCsp } from '../src/csp';

describe('buildCsp', () => {
  it('returns default CSP string', () => {
    const csp = buildCsp({ siteKey: 'sg_sk_live_xxx' });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://shugoi.com");
    expect(csp).toContain("connect-src 'self' https://shugoi.com");
  });

  it('includes custom directives from options', () => {
    const csp = buildCsp({
      siteKey: 'sg_sk_live_xxx',
      extraDirectives: {
        'img-src': ["'self'", 'data:', 'https://images.example.com'],
      },
    });
    expect(csp).toContain("img-src 'self' data: https://images.example.com");
  });

  it('overrides defaults with extra directives', () => {
    const csp = buildCsp({
      siteKey: 'sg_sk_live_xxx',
      extraDirectives: {
        'script-src': ["'self'"],
      },
    });
    const scriptSrc = csp.split('; ').find(s => s.startsWith('script-src'));
    expect(scriptSrc).toBe("script-src 'self'");
    expect(scriptSrc).not.toContain('unsafe-inline');
  });
});
