import { signToken, generateSkeleton, ensureGuardsFetched } from './render';

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
   * @example ['abc123...', 'def456...']
   */
  whitelist?: string[];

  /** Secret for HMAC-signing split-render tokens */
  signingSecret?: string;
}

export async function scriptTags(options: ScriptTagsOptions): Promise<{
  guardDetect: string;
  guard: string;
  whitelistConfig?: string;
}> {
  const base = options.baseUrl ?? 'https://shugoi.com/api/v1';

  await ensureGuardsFetched(base);

  const ts = Date.now();
  const signed = signToken(options.siteKey, ts, options.signingSecret);
  const skel = generateSkeleton(
    options.siteKey,
    signed.token,
    base,
    options.whitelist,
  );

  return {
    guardDetect: skel,
    guard: '',
    whitelistConfig: `<script>window.__sg_whitelist=${JSON.stringify(options.whitelist ?? [])}</script>`,
  };
}
