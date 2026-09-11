export { ShugoiError } from './errors';
export { signToken, storeHtml, storeBootstrap, readBootstrap, readLatestBootstrap, encodeInvisibleBootstrapPath, decodeInvisibleBootstrapPath, generateSkeleton, injectGuardScripts, renderResponseData, handleRender, verifyRenderGrant, fetchWhitelistForSiteKey, getConfigAvailability, __clearConfigCache, __clearGuardCache } from './render';
export { attachShugoiWebSocket, type ShugoiWebSocketOptions } from './websocket';
export { createShugoiMiddleware, createShugoiPlugin, BLOCK_PAGE, DEFAULT_HEADLESS_PATTERNS, DEFAULT_BOT_WHITELIST } from './middleware';
export { buildCsp, mergeCsp } from './csp';
export { checkLicense } from './check-license';
export { scriptTags } from './scripts';
export { validateSiteKey } from './validate-site-key';
export { signAvailabilitySnapshot, verifyAvailabilitySnapshot, availabilityState, canServeDegradedPath } from './availability';
export type { DegradedAvailabilityMode, DegradedAvailabilityState, DegradedAvailabilityOptions, SignedAvailabilitySnapshot } from './availability';
export type {
  ShugoiCoreOptions, ShugoiMiddlewareOptions, ShugoiPluginOptions,
  ScriptTagsOptions, ScriptTagsResult, BlockPageContext,
  CheckRequest, CheckResponse,
} from './types';

export { applyObfuscation, applyBootObfuscation, isValidJs } from './obfuscate';
