/**
 * Options pour {@link scriptTags}.
 */
export interface ScriptTagsOptions {
  /** SiteKey Shugoi */
  siteKey: string;
  /** Base URL de l'API */
  baseUrl?: string;
}

/**
 * Génère les balises `<script>` pour les scripts Shugoi.
 *
 * @returns Objet avec `guardDetect` (à mettre dans `<head>`)
 * et `guard` (à mettre en fin de `<body>`)
 *
 * @example
 * ```ts
 * const { guardDetect, guard } = scriptTags({ siteKey: 'sg_sk_live_xxx' });
 * // head.html += guardDetect;
 * // body.html += guard;
 * ```
 */
export function scriptTags(options: ScriptTagsOptions): {
  guardDetect: string;
  guard: string;
} {
  const base = options.baseUrl ?? 'https://shugoi.com/api/v1';
  const key = options.siteKey;

  return {
    guardDetect: `<script src="${base}/guard-detect?key=${key}"></script>`,
    guard: `<script src="${base}/guard?key=${key}"></script>`,
  };
}
