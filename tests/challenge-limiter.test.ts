import { describe, expect, it } from 'vitest'
import { ChallengeLimiter } from '../src/challenge-limiter'

describe('ChallengeLimiter', () => {
  it('releases its state when closed', () => {
    const limiter = new ChallengeLimiter({ limit: 1, windowMs: 60_000, maxBlockMs: 60_000 })
    expect(limiter.allow('192.0.2.1')).toBe(true)
    limiter.close()
    expect(limiter.allow('192.0.2.1')).toBe(true)
    limiter.close()
  })
})
