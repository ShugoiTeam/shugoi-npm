import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  createMidAnchorValue,
  isMidAnchorValid,
  type CookieSecurityOptions,
} from '../src/cookie-security';
import { ipBucket, uaFingerprint } from '../src/security-utils';

const SECRET = 'test-anchor-secret-32bytes-long!';
const IP = '203.0.113.42';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const MID = 'a'.repeat(64);

function opts(anchorTtlMs?: number): CookieSecurityOptions {
  return { secret: SECRET, okTtlMs: 30 * 24 * 3600 * 1000, authorizedTtlMs: 120_000, anchorTtlMs };
}

describe('ancre serveur __sg_mid_anchor', () => {
  it('valide une ancre créée pour le même (ip, ua, mid)', () => {
    const value = createMidAnchorValue(IP, UA, MID, opts());
    expect(value.split(':').length).toBe(5);
    expect(isMidAnchorValid(value, IP, UA, MID, opts())).toBe(true);
  });

  it('rejette un mid différent de celui enregistré dans l’ancre', () => {
    const value = createMidAnchorValue(IP, UA, MID, opts());
    expect(isMidAnchorValid(value, IP, UA, 'b'.repeat(64), opts())).toBe(false);
  });

  it('rejette un bucket IP différent', () => {
    const value = createMidAnchorValue(IP, UA, MID, opts());
    expect(isMidAnchorValid(value, '203.0.114.1', UA, MID, opts())).toBe(false);
  });

  it('rejette une empreinte UA différente', () => {
    const value = createMidAnchorValue(IP, UA, MID, opts());
    expect(isMidAnchorValid(value, IP, 'curl/8.0', MID, opts())).toBe(false);
  });

  it('rejette une signature invalide', () => {
    const value = createMidAnchorValue(IP, UA, MID, opts());
    const [ts, bucket, fp] = value.split(':');
    const forged = [ts, bucket, fp, MID, '0'.repeat(64)].join(':');
    expect(isMidAnchorValid(forged, IP, UA, MID, opts())).toBe(false);
  });

  it('rejette une ancre expirée (TTL dépassé)', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 31 * 24 * 3600;
    const bucket = ipBucket(IP);
    const fp = uaFingerprint(UA);
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(`sg_mid_anchor:${oldTs}:${bucket}:${fp}:${MID}`)
      .digest('hex');
    const value = [oldTs, bucket, fp, MID, sig].join(':');
    expect(isMidAnchorValid(value, IP, UA, MID, opts())).toBe(false);
  });

  it('respecte un anchorTtlMs personnalisé', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 2;
    const bucket = ipBucket(IP);
    const fp = uaFingerprint(UA);
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(`sg_mid_anchor:${oldTs}:${bucket}:${fp}:${MID}`)
      .digest('hex');
    const value = [oldTs, bucket, fp, MID, sig].join(':');
    expect(isMidAnchorValid(value, IP, UA, MID, opts(5000))).toBe(true);
    expect(isMidAnchorValid(value, IP, UA, MID, opts(1000))).toBe(false);
  });

  it('retourne false sans secret', () => {
    const value = createMidAnchorValue(IP, UA, MID, opts());
    expect(isMidAnchorValid(value, IP, UA, MID, { secret: '', okTtlMs: 1, authorizedTtlMs: 1 })).toBe(false);
  });
});