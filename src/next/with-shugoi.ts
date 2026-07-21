import { buildCsp } from '../csp';

/**
 * Options for the Next.js Shugoi plugin.
 */
export interface WithShugoiOptions {
  /** Shugoi siteKey */
  siteKey: string;
  /**
   * Additional paths for the proxy allowlist.
   * @default ["/legal"]
   */
  allowlist?: string[];
  /** API base URL */
  baseUrl?: string;
}

/**
 * Next.js config wrapper that adds Shugoi CSP headers.
 *
 * Use in `next.config.ts`:
 *
 * ```ts
 * import { withShugoi } from 'shugoi/next';
 *
 * export default withShugoi(
 *   { siteKey: 'sg_sk_live_xxx' },
 *   { reactStrictMode: true }
 * );
 * ```
 *
 * @param shugoiOptions - Shugoi options
 * @param nextConfig - Existing Next.js config
 * @returns Merged Next.js config
 */
export function withShugoi(
  shugoiOptions: WithShugoiOptions,
  nextConfig: Record<string, unknown> = {},
): Record<string, unknown> {
  const csp = buildCsp({ siteKey: shugoiOptions.siteKey });

  return {
    ...nextConfig,
    async headers() {
      const existingHeaders = typeof nextConfig.headers === 'function'
        ? await (nextConfig as any).headers()
        : Array.isArray(nextConfig.headers)
          ? nextConfig.headers
          : [];

      return [
        ...existingHeaders,
        {
          source: '/(.*)',
          headers: [
            {
              key: 'Content-Security-Policy',
              value: csp,
            },
          ],
        },
      ];
    },
  };
}
