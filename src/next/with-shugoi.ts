import { buildCsp } from '../csp';
import type { JsonValue } from '../types';

export interface WithShugoiOptions {
  siteKey: string;
  whitelist?: string[];
  allowlist?: string[];
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
