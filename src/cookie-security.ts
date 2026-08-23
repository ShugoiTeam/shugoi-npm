import crypto from 'node:crypto'
import { ipBucket, safeEqual, uaFingerprint } from './security-utils'

export interface CookieSecurityOptions {
  secret: string
  okTtlMs: number
  authorizedTtlMs: number
  anchorTtlMs?: number
}

const ANCHOR_TTL_MS_DEFAULT = 30 * 24 * 3600 * 1000

export function createOkCookieValue(ip: string, userAgent: string, options: CookieSecurityOptions): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const bucket = ipBucket(ip)
  const fingerprint = uaFingerprint(userAgent)
  const signature = crypto.createHmac('sha256', options.secret).update(`sg_ok:${timestamp}:${bucket}:${fingerprint}`).digest('hex')
  return `${timestamp}:${bucket}:${fingerprint}:${signature}`
}

export function isOkCookieValid(value: string, ip: string, userAgent: string, options: CookieSecurityOptions): boolean {
  if (!options.secret) return false
  const [timestamp, bucket, fingerprint, signature] = value.split(':')
  if (!timestamp || !bucket || !fingerprint || !signature) return false
  const parsedTimestamp = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(parsedTimestamp) || Date.now() - parsedTimestamp * 1000 > options.okTtlMs || parsedTimestamp * 1000 > Date.now() + 60_000) return false
  if (bucket !== ipBucket(ip) || fingerprint !== uaFingerprint(userAgent)) return false
  const expected = crypto.createHmac('sha256', options.secret).update(`sg_ok:${timestamp}:${bucket}:${fingerprint}`).digest('hex')
  return safeEqual(signature, expected)
}

export function isAuthorizedCookieValid(value: string, options: CookieSecurityOptions): boolean {
  if (!options.secret) return false
  const separator = value.indexOf(':')
  if (separator <= 0) return false
  const timestamp = value.slice(0, separator)
  const signature = value.slice(separator + 1)
  const parsedTimestamp = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(parsedTimestamp) || Date.now() - parsedTimestamp * 1000 > options.authorizedTtlMs || parsedTimestamp * 1000 > Date.now() + 60_000) return false
  const expected = crypto.createHmac('sha256', options.secret).update(`sg_authorized:${timestamp}`).digest('hex')
  return safeEqual(signature, expected)
}

export function createMidAnchorValue(ip: string, userAgent: string, mid: string, options: CookieSecurityOptions): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const bucket = ipBucket(ip)
  const fingerprint = uaFingerprint(userAgent)
  const signature = crypto.createHmac('sha256', options.secret).update(`sg_mid_anchor:${timestamp}:${bucket}:${fingerprint}:${mid}`).digest('hex')
  return `${timestamp}:${bucket}:${fingerprint}:${mid}:${signature}`
}

export function isMidAnchorValid(value: string, ip: string, userAgent: string, mid: string, options: CookieSecurityOptions): boolean {
  if (!options.secret) return false
  const [timestamp, bucket, fingerprint, valueMid, signature] = value.split(':')
  if (!timestamp || !bucket || !fingerprint || !valueMid || !signature) return false
  const parsedTimestamp = Number.parseInt(timestamp, 10)
  const ttlMs = options.anchorTtlMs ?? ANCHOR_TTL_MS_DEFAULT
  if (!Number.isFinite(parsedTimestamp) || Date.now() - parsedTimestamp * 1000 > ttlMs || parsedTimestamp * 1000 > Date.now() + 60_000) return false
  if (bucket !== ipBucket(ip) || fingerprint !== uaFingerprint(userAgent)) return false
  if (valueMid !== mid) return false
  const expected = crypto.createHmac('sha256', options.secret).update(`sg_mid_anchor:${timestamp}:${bucket}:${fingerprint}:${valueMid}`).digest('hex')
  return safeEqual(signature, expected)
}
