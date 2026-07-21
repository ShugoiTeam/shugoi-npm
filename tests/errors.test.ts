import { describe, it, expect } from 'vitest';
import { ShugoiError } from '../src/errors';

describe('ShugoiError', () => {
  it('creates an error with code and message', () => {
    const err = new ShugoiError('invalid_site_key', 'Site key is invalid');
    expect(err.code).toBe('invalid_site_key');
    expect(err.message).toBe('Site key is invalid');
    expect(err.name).toBe('ShugoiError');
    expect(err.cause).toBeUndefined();
  });

  it('creates an error with a cause', () => {
    const cause = new Error('network error');
    const err = new ShugoiError('api_unreachable', 'API unreachable', cause);
    expect(err.cause).toBe(cause);
  });

  it('is instanceof Error and ShugoiError', () => {
    const err = new ShugoiError('internal_error', 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ShugoiError);
  });
});
