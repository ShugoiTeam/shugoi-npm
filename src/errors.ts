export type ShugoiErrorCode =
  | 'invalid_site_key'
  | 'site_key_validation_failed'
  | 'api_unreachable'
  | 'api_timeout'
  | 'missing_site_key'
  | 'unexpected_api_response'
  | 'internal_error';

export class ShugoiError extends Error {
  constructor(
    public readonly code: ShugoiErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ShugoiError';
  }
}
