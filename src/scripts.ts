/**
 * Options for {@link scriptTags}.
 */
export interface ScriptTagsOptions {
  /** Shugoi siteKey */
  siteKey: string;
  /** API base URL */
  baseUrl?: string;
  /**
   * Cache-busting version.
   * When the guard script is updated on the server, increment this
   * to force browsers to re-fetch (instead of serving a stale 1-year cache).
   *
   * Recommended: your build/deploy timestamp.
   * @example "20250722"
   */
  version?: string;
  /**
   * Local whitelist of machine IDs.
   * Machines in this list bypass the server whitelist check entirely.
   * Empty array `[]` allows all machines (no filtering).
   *
   * When set, an inline `<script>` tag is returned via `whitelistConfig`
   * that must be placed **before** `guardDetect` in the `<head>`.
   *
   * @example ['abc123...', 'def456...']
   */
  whitelist?: string[];
}

/**
 * Generates `<script>` tags for Shugoi guard scripts.
 *
 * @returns Object with:
 * - `whitelistConfig` (optional) — inline script for local whitelist
 * - `guardDetect` — place in `<head>` (after whitelistConfig if present)
 * - `guard` — place at end of `<body>`
 *
 * @example
 * ```ts
 * const { whitelistConfig, guardDetect, guard } = scriptTags({
 *   siteKey: 'sg_sk_live_xxx',
 *   version: '20250722',
 *   whitelist: ['abc123...'],
 * });
 * // head: whitelistConfig + guardDetect
 * // body: guard
 * ```
 */
export function scriptTags(options: ScriptTagsOptions): {
  guardDetect: string;
  guard: string;
  whitelistConfig?: string;
} {
  const base = options.baseUrl ?? 'https://shugoi.com/api/v1';
  const key = options.siteKey;
  const v = options.version ? `&v=${encodeURIComponent(options.version)}` : '';

  let whitelistConfig: string | undefined;
  if (options.whitelist) {
    whitelistConfig = `<script>window.__sg_whitelist=${JSON.stringify(options.whitelist)};</script>`;
  }

  return {
    guardDetect: `<script src="${base}/guard-detect?key=${key}${v}"></script>`,
    guard: `<script src="${base}/guard?key=${key}${v}"></script>`,
    whitelistConfig,
  };
}
