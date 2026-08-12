import { buildCsp } from '../csp';
import type { JsonValue } from '../types';

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

interface NextHeader {
  key: string;
  value: string;
}

interface NextHeaderRule {
  source: string;
  headers: NextHeader[];
}

type NextHeaders = NextHeaderRule[] | (() => Promise<NextHeaderRule[]> | NextHeaderRule[]);

interface NextConfigShape {
  headers?: NextHeaders;
  [key: string]: JsonValue | NextHeaders | undefined;
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
  nextConfig: NextConfigShape = {},
): NextConfigShape {
  const csp = buildCsp({ siteKey: opts.siteKey });

  return {
    ...nextConfig,
    async headers() {
      const existingHeaders = typeof nextConfig.headers === 'function'
        ? await nextConfig.headers()
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
