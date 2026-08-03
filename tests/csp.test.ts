import { describe, it, expect } from 'vitest';
import { buildCsp, mergeCsp } from '../src/csp';

describe('buildCsp', () => {
  it('returns default CSP string', () => {
    const csp = buildCsp({ siteKey: 'sg_sk_live_xxx' });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://shugoi.com");
    expect(csp).toContain("connect-src 'self' https://shugoi.com");
  });

  it('includes custom directives from options (union)', () => {
    const csp = buildCsp({
      siteKey: 'sg_sk_live_xxx',
      extraDirectives: {
        'img-src': ["'self'", 'data:', 'https://images.example.com'],
      },
    });
    expect(csp).toContain('https://images.example.com');
    expect(csp).toContain("'self'");
  });

  it('extra directives union with defaults (does not remove)', () => {
    const csp = buildCsp({
      siteKey: 'sg_sk_live_xxx',
      extraDirectives: {
        'script-src': ["'self'"],
      },
    });
    const scriptSrc = csp.split('; ').find(s => s.startsWith('script-src'));
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain('https://shugoi.com');
  });

  it('removes unsafe-eval when splitRender is false', () => {
    const csp = buildCsp({ siteKey: 'sg_sk_live_xxx', splitRender: false });
    expect(csp).not.toContain('unsafe-eval');
  });

  it('keeps unsafe-eval when splitRender is true (default)', () => {
    const csp = buildCsp({ siteKey: 'sg_sk_live_xxx' });
    expect(csp).toContain('unsafe-eval');
  });
});

describe('mergeCsp', () => {
  it('returns second argument when first is undefined', () => {
    expect(mergeCsp(undefined, "default-src 'self'")).toBe("default-src 'self'");
  });

  it('merges two CSP strings — union of sources per directive', () => {
    const result = mergeCsp("default-src 'self'; script-src 'self'", "script-src https://shugoi.com");
    expect(result).toContain("script-src 'self' https://shugoi.com");
    expect(result).toContain("default-src 'self'");
  });

  it('does not duplicate sources already present', () => {
    const result = mergeCsp("script-src 'self'", "script-src 'self' https://shugoi.com");
    expect(result).toContain("script-src 'self' https://shugoi.com");
  });

  it("le mot-clé 'none' reste SEUL dans une directive (sinon le navigateur l'ignore)", () => {
    // site client : frame-ancestors 'none' + module : frame-ancestors 'self'
    const result = mergeCsp("default-src 'self'; frame-ancestors 'none'", "frame-ancestors 'self'");
    expect(result).toContain("frame-ancestors 'none'");
    expect(result).not.toContain("frame-ancestors 'none' 'self'");
    // l'inverse aussi : 'none' ajouté par le module doit écraser les autres sources
    const r2 = mergeCsp("frame-ancestors 'self'", "frame-ancestors 'none'");
    expect(r2).toContain("frame-ancestors 'none'");
  });
});
