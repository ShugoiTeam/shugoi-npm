import { describe, expect, it } from 'vitest'
import { ProofReplayStore } from '../src/proof-replay-store'

describe('ProofReplayStore', () => {
  it('consumes a proof once', () => {
    const store = new ProofReplayStore({ ttlMs: 60_000 })
    expect(store.consume('proof')).toBe(true)
    expect(store.consume('proof')).toBe(false)
    store.close()
  })

  it('accepts distinct proofs', () => {
    const store = new ProofReplayStore({ ttlMs: 60_000 })
    expect(store.consume('first')).toBe(true)
    expect(store.consume('second')).toBe(true)
    store.close()
  })
})
