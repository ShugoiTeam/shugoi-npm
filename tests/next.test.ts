import { describe, it, expect } from 'vitest';
import { withShugoi } from '../src/next/with-shugoi';

describe('withShugoi', () => {
  it('adds a headers function to config', () => {
    const result = withShugoi({ siteKey: 'sg_sk_live_xxx' }, {});
    expect(result).toHaveProperty('headers');
    expect(typeof (result as any).headers).toBe('function');
  });

  it('returns CSP header from headers()', async () => {
    const result = withShugoi({ siteKey: 'sg_sk_live_xxx' }, {}) as any;
    const headers = await result.headers();
    expect(headers).toHaveLength(1);
    expect(headers[0].source).toBe('/(.*)');
    expect(headers[0].headers[0].key).toBe('Content-Security-Policy');
    expect(headers[0].headers[0].value).toContain('https://shugoi.com');
  });

  it('merges with existing config', () => {
    const result = withShugoi({ siteKey: 'sg_sk_live_xxx' }, { reactStrictMode: true });
    expect(result.reactStrictMode).toBe(true);
  });

  it('merges with existing headers', async () => {
    const result = withShugoi({ siteKey: 'sg_sk_live_xxx' }, {
      async headers() {
        return [{ source: '/api/(.*)', headers: [{ key: 'X-Custom', value: 'val' }] }];
      },
    }) as any;

    const headers = await result.headers();
    expect(headers).toHaveLength(2);
    expect(headers[0].source).toBe('/api/(.*)');
    expect(headers[1].source).toBe('/(.*)');
  });
});
