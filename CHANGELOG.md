# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [unreleased]

### Added
- Config cache: shared whitelist+flags cache with 30s TTL, 10min stale max, background refresh, and inflight dedup (N-01).
- `verifyBots` option: reverse DNS verification for whitelisted bots (Googlebot, Bingbot…) (N-06).
- Bot DNS verification via `src/verify-bot.ts` — forward+reverse DNS check (N-06).
- `escapeHtml()` utility for HTML-safe block page rendering (N-03).
- Hardening CSP directives: `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` (N-05).
- `apiOrigin` parameter in `buildCsp()` — self-hosted API origins are auto-allowed (N-05).
- `verifyBots` option in `ShugoiCoreOptions` (N-06).
- `__clearConfigCache()` exported for testing (N-01).
- Localized fallback texts for block page (fr/en instead of hardcoded unaccented French) (N-09).
- Token max-reads check (N-10).
- Memory byte cap via `MAX_TOTAL_BYTES` (N-10).
- `verifyBots: false` test flag to bypass DNS in test suites (N-06).

### Fixed
- **Critical**: 3 serial `/whitelist` fetches per page render → single cached call with timeout (N-01).
- `getFlags()` infinite retry loop on API failure — replaced with shared config cache (N-02).
- HTML injection via `Host` header in block page — now escaped (N-03).
- `/tmp` token directory world-readable → 0700 + UID-scoped + 0600 files (N-04).
- Token read used `readdirSync` O(n) scan → deterministic `sha256` filename (N-04).
- `unsafe-inline` always present in CSP, hardcoded `shugoi.com` URL — now configurable via `apiOrigin` (N-05).
- Bot whitelist based solely on `User-Agent` (falsifiable) — now verified by DNS when `verifyBots: true` (N-06).
- `enableRateLimit` default `!== false` activated rate limiting on network failure — now `=== true` (N-07).
- Rate-limit body sent `fingerprint.browser: ip` — now sends `scope: 'edge_ip'` with `ip` field (N-07).
- Validation failure silently ignored in production — now `console.warn` hourly + reports to `/event` (N-08).
- `devtoolsMsg`/`tamperTitle` escaped for single quotes but not double quotes — now uses `JSON.stringify`-based encoding (N-09).
- `evictLRU` was actually FIFO + O(n) — renamed to `evictOldest`, O(1) via Map iterator (N-10).
- `_lastConfig`, `_validationAllowedOrigins` dead code removed (N-10).
- `reads` field incremented but never used — now enforces `MAX_TOKEN_READS` replay protection (N-10).
- Unbounded memory growth — capped at 64 MB total HTML (N-10).
- README claimed 37 tests — now generic (N-11).
- README said `extraDirectives` overrides — now documented as union (N-11).
- Bot whitelist included `AhrefsBot`, `SemrushBot` (SEO analytics crawlers, not search engines) — removed (N-06).

### Changed
- CSP `extraDirectives` semantics from override to union (sources are added, not replaced) (N-05).
- `fetch()` calls in render.ts now have timeouts: whitelist 2s, guards 5s (N-01).
- Guard script fetches use `AbortSignal.timeout(5000)` (was infinite) (N-01).
- `isWhitelistedBot` split into `isWhitelistedBot` (UA check) + `isTrustedBot` (UA + DNS) (N-06).
- `DEFAULT_BOT_WHITELIST` reduced: removed `AhrefsBot`, `SemrushBot`, `FacebookExternalHit` → `facebookexternalhit` (N-06).
