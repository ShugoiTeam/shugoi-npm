import { buildCsp } from '../csp';

/**
 * Options for the Next.js Shugoi plugin.
 */
export interface WithShugoiOptions {
  /** Shugoi siteKey */
  siteKey: string;
  /**
   * Local whitelist of machine IDs.
   * Empty array `[]` allows all machines.
   */
  whitelist?: string[];
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
 * ```ts
 * // next.config.ts
 * import { withShugoi } from 'shugoi/next';
 * export default withShugoi({ siteKey: 'sg_sk_live_xxx' });
 * ```
 *
 * Add guard scripts in your layout:
 * ```tsx
 * // app/layout.tsx
 * import { scriptTags } from 'shugoi';
 * const { whitelistConfig, guardDetect, guard } = scriptTags({
 *   siteKey: 'sg_sk_live_xxx',
 *   whitelist: [],
 * });
 * // head: whitelistConfig + guardDetect
 * // body: guard
 * ```
 */
export function withShugoi(
  opts: WithShugoiOptions,
  nextConfig: Record<string, unknown> = {},
): Record<string, unknown> {
  const csp = buildCsp({ siteKey: opts.siteKey });

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
