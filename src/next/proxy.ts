import { createShugoiNextMiddleware, type ShugoiNextOptions } from './middleware';

export interface ShugoiProxyOptions extends ShugoiNextOptions {
  /** Trusted application origin; retained as an alias for origin. */
  target?: string;
}

export function createShugoiProxy(options: ShugoiProxyOptions) {
  return createShugoiNextMiddleware({ ...options, origin: options.origin ?? options.target, allowlist: options.allowlist ?? ['/legal'] });
}
