export type ShugoiErrorCode =
  | 'invalid_site_key'
  | 'site_key_validation_failed'
  | 'api_unreachable'
  | 'api_timeout'
  | 'missing_site_key'
  | 'unexpected_api_response'
  | 'internal_error';

export type ErrorCause = string | number | boolean | object | null;

export class ShugoiError extends Error {
  constructor(
    public readonly code: ShugoiErrorCode,
    message: string,
    public readonly cause?: ErrorCause,
  ) {
    super(message);
    this.name = 'ShugoiError';
  }
}
