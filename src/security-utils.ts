import crypto from 'node:crypto'

export function safeChallengePath(path: string): string {
  if (!path) return '/'
  if (path.charAt(0) !== '/' || path.charAt(1) === '/' || path.includes('\\')) return '/'
  for (const character of path) {
    const code = character.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return '/'
  }
  return path
}

export function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

export function ipBucket(ip: string): string {
  if (!ip || ip === 'unknown') return '0'
  if (ip.includes('.')) {
    const match = ip.match(/^(\d+\.\d+\.\d+)(?:\.\d+)?$/)
    return match?.[1] ?? '0'
  }
  if (ip.includes(':')) return ip.split(':').filter(Boolean).slice(0, 4).join('.') || '0'
  return '0'
}

export function uaFingerprint(userAgent: string): string {
  return crypto.createHash('sha256').update(userAgent).digest('hex').slice(0, 16)
}
