import crypto from 'node:crypto'

export interface PowVerifierOptions {
  secret: string
  difficulty: number
  ttlMs: number
}

export function createPowNonce(): string {
  return crypto.randomBytes(8).toString('hex')
}

export function verifyPow(proof: string, options: PowVerifierOptions): boolean {
  if (!proof || !options.secret) return false
  const [timestamp, nonce, solution] = proof.split(':')
  if (!timestamp || !nonce || !solution || !/^[0-9a-f]{16}$/.test(nonce)) return false
  const parsedTimestamp = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp * 1000) > options.ttlMs) return false
  const salt = crypto.createHmac('sha256', options.secret).update(`${timestamp}:${nonce}`).digest('hex')
  const digest = crypto.createHash('sha256').update(`${salt}:${solution}`).digest('hex')
  let leadingBits = 0
  for (const nibble of digest) {
    const value = Number.parseInt(nibble, 16)
    if (value === 0) {
      leadingBits += 4
      continue
    }
    leadingBits += (value & 8) ? 0 : (value & 4) ? 1 : (value & 2) ? 2 : 3
    break
  }
  return leadingBits >= options.difficulty
}
