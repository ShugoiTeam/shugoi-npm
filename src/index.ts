/**
 * Shugoi - Hardware fingerprinting anti-abuse protection.
 *
 * @packageDocumentation
 */

export { ShugoiError } from './errors';
export type { ShugoiErrorCode } from './errors';

export { createShugoiMiddleware } from './middleware';

export { checkLicense } from './check-license';
export type { CheckLicenseOptions } from './check-license';

export { buildCsp } from './csp';
export type { CspOptions } from './csp';

export { scriptTags } from './scripts';
export type { ScriptTagsOptions } from './scripts';

export { validateSiteKey } from './validate-site-key';

export {
  signToken,
  storeHtml,
  generateSkeleton,
  renderResponseData,
  renderResponseJson,
  handleRender,
  injectAndStore,
  ensureGuardsFetched,
} from './render';
export type { RenderResponse } from './render';

export type {
  ShugoiOptions,
  CheckResponse,
  CheckRequest,
  BlockedReason,
  RateLimitReason,
  CaptchaChallenge,
} from './types';
