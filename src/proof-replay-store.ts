export interface ProofReplayStoreOptions {
  ttlMs: number
}

export class ProofReplayStore {
  private readonly entries = new Map<string, number>()
  private readonly timer: NodeJS.Timeout

  public constructor(private readonly options: ProofReplayStoreOptions) {
    this.timer = setInterval(() => this.cleanup(), options.ttlMs)
    this.timer.unref()
  }

  public consume(proof: string): boolean {
    this.cleanup()
    if (this.entries.has(proof)) return false
    this.entries.set(proof, Date.now())
    return true
  }

  public close(): void {
    clearInterval(this.timer)
    this.entries.clear()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [proof, timestamp] of this.entries) {
      if (now - timestamp > this.options.ttlMs) this.entries.delete(proof)
    }
  }
}
