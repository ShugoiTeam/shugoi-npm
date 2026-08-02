# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.6] - 2026-08-02

### Fixed
- **Sous-chemins (reverse proxy)** : le challenge PoW 307 honore le header
  `X-Forwarded-Prefix`. Un site servi derrière nginx sous `/express/` (démo) recevait
  un `Location: /__sg_challenge` à la racine (502) au lieu de `/express/__sg_challenge`.
  Le prefix est désormais préfixé dans la Location ET dans le `path` de retour du PoW.

## [0.3.5] - 2026-08-02

### Security (audit anti-bypass curl/view-source)
- **307 + tableau ASCII seul** : toute page HTML sans `sg_proof` valide reçoit un 307 dont
  le corps est UNIQUEMENT le tableau `BLOCKED BY SHUGOI` (text/plain). curl (même avec
  headers navigateur parfaits) ne voit plus aucun HTML/JS. Le view-source non plus.
- **Challenge JS inline** : le navigateur suit le 307 vers `/__sg_challenge` — page au
  body minimal (tableau dans un commentaire HTML, invisible à l'écran → pas de flash)
  avec le JS PoW INLINE (économie d'un aller-retour réseau). Le tableau reste visible
  dans le view-source.
- **Plus d'exclusion d'extension dans `isPage`** : `/index.js`, `/app.js`, `/__shugoi.js`
  (catch-all SPA qui sert `index.html`) sont désormais challengés au lieu de servir le
  fallback skeleton sans PoW.
- **Le cookie `__sg_ok` ne bypass plus le challenge** : le view-source de `/` renvoie
  toujours le tableau, même avec un cookie valide présent.
- **Email retiré du tableau** : plus de réécriture Cloudflare (email-protection) dans le
  tableau de blocage.

### Performance (chargement 2-5s → ~1s)
- **PoW pre-flight diff 14 → 10** (~16k itérations → ~1k, ~50ms au lieu de ~0.6s+).
- **PoW wlc diff 15 → 10** : le double PoW (pre-flight + wlc) était le goulot
  (~32k itérations crypto.subtle ≈ 1-3s dans un vrai navigateur).
- **Timeout codecs guard 2s → 300ms** : le machineId n'attend plus 2s si les codecs
  mediaCapabilities ne répondent pas.
- **`__clearConfigCache()` supprimé du render** : le flag `contentReplace` est lu via le
  cache config (TTL 30s), plus de fetch réseau (~300-400ms) à chaque render.
- **`sg_proof` conservé au challenge** : le query existant (`?sg_probe_debug=1`) est
  préservé dans l'URL de redirection et dans le nettoyage `history.replaceState`.

## [0.3.4] - 2026-08-01

### Security
- **PoW anti-curl** : le skeleton fournit un challenge `{salt=HMAC(secret,ts), difficulty:15}` ;
  le wlc refuse tout `/wlc` sans la preuve de calcul résolue en JS (`pow=ts:nonce`). Un bot
  curl qui simule les headers navigateur ne peut plus obtenir de grant (il n'exécute pas le JS).
- **Notice de consentement** : la popup est injectée DANS le HTML rendu (après le split-render)
  au lieu du skeleton — elle ne disparaît plus quand le render remplace le document. L'ack est
  UNIQUEMENT serveur, lié au machineId (stable par machine), plus de localStorage/cookie client.
- **Fix Tor** : un navigateur légitime sans `Sec-Fetch-*` (ex. Tor Browser) ne reçoit plus de 403
  texte brut — le guard client affiche la page de blocage dédiée (card "Tor détecté").

## [0.3.3] - 2026-08-01

### Security
- **Anti-bypass render "token-only"** : le wlc émet un `render-grant` HMAC (`signRenderGrant`) ;
  le render (`verifyRenderGrant`) refuse de livrer le HTML sans `mid` + `grant` valides.
- Grant lié au **token + IP + TTL 120 s** (`mid:token:ip:timestamp`) — rejeu cross-token,
  cross-IP ou expiré refusé (CH-01/02/03).
- `verifyRenderGrant` factorisé et partagé par les adapters **Express / Next / Fastify** (parité).
- **Pas d'oracle token** : réponses `not_found` uniformes (token mal formé, HMAC invalide ou
  timestamp invalide) (CH-05).
- Limite de **multi-lecture** du token renforcée (contentReplaceOn → 1 lecture) (CH-07).
- `generateSkeleton` expose `window.__sg_token` (requis pour le grant lié au token) ; le token
  reste obfusqué en clair (jamais en clair dans le HTML) (OB-03).

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
