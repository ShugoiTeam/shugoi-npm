import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const INTERNAL_HEADER = 'x-shugoi-internal';
const MAX_AGE_MS = 5_000;

function signature(secret: string, siteKey: string, url: string, cookie: string, stamp: string, nonce: string) {
  return createHmac('sha256', secret)
    .update(JSON.stringify(['next-internal-v1', siteKey, 'GET', url, cookie, stamp, nonce]))
    .digest('hex');
}

export function signInternalRequest(secret: string, siteKey: string, url: string, cookie: string, now = Date.now()) {
  const stamp = String(now);
  const nonce = randomBytes(16).toString('hex');
  return [stamp, nonce, signature(secret, siteKey, url, cookie, stamp, nonce)].join('.');
}

export function verifyInternalRequest(value: string, secret: string, siteKey: string, url: string, cookie: string, method: string, now = Date.now()) {
  if (!secret || method !== 'GET' || !/^\d{13}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value)) return false;
  const [stamp, nonce, mac] = value.split('.') as [string, string, string];
  const age = now - Number(stamp);
  if (age < -1_000 || age > MAX_AGE_MS) return false;
  return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(secret, siteKey, url, cookie, stamp, nonce), 'hex'));
}
