import type { ScriptTagsOptions, ScriptTagsResult } from './types'
import { signToken, generateSkeleton } from './render'

export async function scriptTags(options: ScriptTagsOptions): Promise<ScriptTagsResult> {
  if (!options.signingSecret) throw new Error('Shugoi requires an explicit site signing secret');
  const base = options.baseUrl ?? 'https://api.shugoi.com/api/v1';
  const key = options.siteKey;
  const ts = Date.now();
  const signed = signToken(key, ts, options.signingSecret);
  const skel = await generateSkeleton(key, signed.token, base, options.restrictedAccess ?? false, options.whitelist, undefined, undefined, undefined, undefined, options.signingSecret);
  return { guardDetect: skel, guard: '', whitelistConfig: '', token: signed.token };
}
