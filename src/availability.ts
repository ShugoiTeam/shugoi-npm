import crypto from 'node:crypto';

export type DegradedAvailabilityMode = 'fail-closed' | 'public-last-known';
export type DegradedAvailabilityState = 'fresh' | 'degraded' | 'expired' | 'recovered' | 'rejected';

export interface DegradedAvailabilityOptions {
  mode?: DegradedAvailabilityMode;
  maxStaleMs?: number;
  allowPaths?: string[];
  onStateChange?: (state: DegradedAvailabilityState) => void;
}

export interface SignedAvailabilitySnapshot {
  version: number;
  siteKey: string;
  fetchedAt: number;
  flags: Record<string, boolean>;
  skipPaths: string[];
  signature: string;
}

const DEFAULT_MAX_STALE_MS = 5 * 60_000;

function canonical(snapshot: Omit<SignedAvailabilitySnapshot, 'signature'>): string {
  return JSON.stringify({ flags: snapshot.flags, fetchedAt: snapshot.fetchedAt, siteKey: snapshot.siteKey, skipPaths: snapshot.skipPaths, version: snapshot.version });
}

export function signAvailabilitySnapshot(snapshot: Omit<SignedAvailabilitySnapshot, 'signature'>, secret: string): SignedAvailabilitySnapshot {
  if (!secret) throw new Error('availability_secret_required');
  return { ...snapshot, signature: crypto.createHmac('sha256', secret).update(canonical(snapshot)).digest('hex') };
}

export function verifyAvailabilitySnapshot(snapshot: SignedAvailabilitySnapshot, secret: string, now = Date.now(), maxStaleMs = DEFAULT_MAX_STALE_MS): boolean {
  if (!secret || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1) return false;
  if (!Number.isFinite(snapshot.fetchedAt) || snapshot.fetchedAt > now || now - snapshot.fetchedAt > maxStaleMs) return false;
  const { signature: _signature, ...unsigned } = snapshot;
  const expected = signAvailabilitySnapshot(unsigned, secret).signature;
  return /^[a-f0-9]{64}$/.test(snapshot.signature) && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(snapshot.signature));
}

export function availabilityState(snapshot: SignedAvailabilitySnapshot | null, secret: string, now = Date.now(), maxStaleMs = DEFAULT_MAX_STALE_MS): DegradedAvailabilityState {
  if (!snapshot) return 'expired';
  if (!verifyAvailabilitySnapshot(snapshot, secret, now, maxStaleMs)) return 'rejected';
  return now - snapshot.fetchedAt > 30_000 ? 'degraded' : 'fresh';
}

export function canServeDegradedPath(path: string, options: DegradedAvailabilityOptions, state: DegradedAvailabilityState): boolean {
  // Explicitly public paths may remain available when the control-plane cache
  // is stale or absent. A rejected/tampered snapshot is never fail-safe.
  return options.mode === 'public-last-known'
    && (state === 'degraded' || state === 'expired')
    && (options.allowPaths ?? []).includes(path);
}
