import { buildCsp } from '../csp';

/**
 * Options pour le plugin Next.js Shugoi.
 */
export interface WithShugoiOptions {
  /** SiteKey Shugoi */
  siteKey: string;
  /**
   * Chemins supplémentaires pour l'allowlist du proxy.
   * @default ["/legal"]
   */
  allowlist?: string[];
  /** URL de base de l'API */
  baseUrl?: string;
}

/**
 * Wrapper Next.js config qui ajoute les headers CSP Shugoi.
 *
 * À utiliser dans `next.config.ts` :
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
 * @param shugoiOptions - Options Shugoi
 * @param nextConfig - Configuration Next.js existante
 * @returns Configuration Next.js fusionnée
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
