interface ChallengeEntry {
  count: number
  windowStart: number
  blockedUntil: number
}

export interface ChallengeLimiterOptions {
  limit: number
  windowMs: number
  maxBlockMs: number
}

export class ChallengeLimiter {
  private readonly entries = new Map<string, ChallengeEntry>()

  public constructor(private readonly options: ChallengeLimiterOptions) {
    setInterval(() => this.cleanup(), options.windowMs).unref()
  }

  public allow(ip: string): boolean {
    if (!ip || ip === 'unknown') return true
    const now = Date.now()
    let entry = this.entries.get(ip)
    if (!entry || now - entry.windowStart >= this.options.windowMs) {
      this.entries.set(ip, { count: 1, windowStart: now, blockedUntil: 0 })
      return true
    }
    entry.count += 1
    if (entry.blockedUntil > now) return false
    if (entry.count > this.options.limit) {
      const backoff = Math.min(60_000 * 2 ** Math.min(entry.count - this.options.limit, 10), this.options.maxBlockMs)
      entry.blockedUntil = now + backoff
      entry.count = 0
      return false
    }
    return true
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [ip, entry] of this.entries) {
      if (now > entry.blockedUntil && now - entry.windowStart > this.options.windowMs * 2) this.entries.delete(ip)
    }
  }
}
