/**
 * Options for {@link scriptTags}.
 */
export interface ScriptTagsOptions {
  /** Shugoi siteKey */
  siteKey: string;
  /** API base URL */
  baseUrl?: string;
}

/**
 * Generates `<script>` tags for Shugoi guard scripts.
 *
 * @returns Object with `guardDetect` (place in `<head>`)
 * and `guard` (place at end of `<body>`)
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
