# Changelog

## [0.5.8] - 2026-10-07

### Fixed
- Enforce a fresh protected document navigation when an SPA leaves an excluded path, for both Express and Fastify middleware.
- Keep browser timing diagnostics disabled by default and make them explicitly opt-in with `timingLogs` across middleware, Next.js proxy, and script-tag APIs.

## [0.5.7] - 2026-10-06

### Fixed
- Align browser-rendered and server-rendered block page backgrounds with the detected browser family in light and dark mode.
- Use the current Shugoi block card styling for Node SDK fallbacks.

### Added
- Add palette coverage for Chrome, Edge, Firefox, WebKit, and Opera.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.29] - 2026-08-09

### Added
- **Allowlist IP empirique `SHUGOKI_BOT_IPS`** (env, virgules) : les embeds Discord
  fetch depuis des IP Google Cloud (reverse-DNS non Discord) → on autorise les IP
  observées dans les logs `[shugoi] bot_ua ip=…`. Vérif : UA whitelisté + IP dans la liste.

## [0.4.28] - 2026-08-09

### Added
- **Journalisation des IP des bots whitelistés** (`logBotIps`, actif par défaut) :
  chaque requête bot logue `[shugoi] bot_ua ip=… ua=…` pour construire une allowlist
  IP empirique (Discord, Twitter…).

## [0.4.27] - 2026-08-09

### Security
- **Bots STRICT (UA + IP vérifiée)** : les bots dont l'IP est vérifiable par
  reverse-DNS (Google, Bing, Slurp, DuckDuckGo, Yandex, Apple, Discord) exigent une
  IP confirmée pour le bypass (F1 + challenge). Un curl qui imite l'UA Discord depuis
  une IP aléatoire est traité comme un visiteur normal (403), pas bypassé.
- `facebookexternalhit` / `Twitterbot` restent lenient (UA seul), à durcir ensuite.

## [0.4.26] - 2026-08-09

### Fixed
- **F1 (anti-faux-navigateur) exempte les bots whitelistés** : l'UA réel de Discord
  est `Mozilla/5.0 (compatible; Discordbot/2.0; …)` → il contient "Mozilla" et était
  403 (pas de Sec-Fetch). Les embeds Discord lisent maintenant les og:meta.

## [0.4.25] - 2026-08-08

### Added
- **Bypass challenge pour les bots whitelistés (SEO / embeds)** : les crawlers
  (Googlebot, facebookexternalhit, Twitterbot, LinkedInBot, Discordbot…) reçoivent le
  HTML brut (og:image, indexation) au lieu du skeleton split-render qu'ils ne peuvent
  pas exécuter. Le vrai verrou reste le render-grant + la whitelist.

## [0.4.2] - 2026-08-02

### Fixed
- **La popup notice ne peut plus être supprimée.** Le MutationObserver posé sur
  `__sg_o` ne signalait jamais le retrait de `__sg_o` lui-même du DOM — on pouvait
  supprimer l'overlay librement. Désormais `document.documentElement` est aussi
  observé en `childList` SEUL (léger, sans subtree/attributes → pas de freeze SPA) :
  toute suppression de `__sg_o` recrée immédiatement l'overlay. Le style de l'overlay
  (`_OVERLAY_CSS`) est aussi restauré, en plus de la carte.

## [0.4.1] - 2026-08-02

### Fixed
- **Notice obligatoire** : retrait du bouton « Non merci » — la notice ne peut plus
  être refusée, seul le bouton OK (ack serveur) la ferme.
- **MutationObserver renforcé et ciblé** : observe désormais `__sg_o` en `subtree`
  avec `attributes` (style/class/id) + `childList` + `characterData`. Toute
  modification DANS la popup (suppression de la carte, innerHTML, style) est
  restaurée. Le reste du document n'est jamais observé → la page reste interactive.

## [0.4.0] - 2026-08-02

### Fixed
- **Notice de consentement : la page ne gèle plus.** Le MutationObserver anti-tampering
  observait `document.documentElement` en `subtree:true` → chaque mutation de
  style/class n'importe où dans la page (SPA React, animations) déclenchait la
  restauration de la notice et le blocage du scroll, rendant la page inutilisable.
  Il n'observe désormais QUE la popup (`__sg_o` / `__sg_cd`) : seule la suppression
  ou modification de la carte est restaurée, tant que la notice n'a pas été fermée.
- **Bouton « Non merci »** ajouté : l'utilisateur peut accepter (OK → ack serveur)
  ou refuser (ferme la popup sans ack). Plus de blocage global scroll/touch/wheel.

## [0.3.9] - 2026-08-02

### Security
- **PoW configurable (audit #6)** : la difficulté du proof-of-work était codée en dur à
  10. Désormais `SHUGOKI_POW_DIFF` (env, défaut 12) la pilote, synchronisée entre
  `core.ts` (challenge 307), `render.ts` (`__sg_pow.difficulty`) et `whitelist.ts` côté
  site. Plus de constante faible en dur.

## [0.3.8] - 2026-08-02

### Security
- **Protection des assets à contenu** : le bundle SPA (`/assets/*.js`, `*.css`) contient
  les textes et la structure des pages. Servi publiquement, il permettait d'extraire
  tout le contenu sans passer la whitelist (audit). Désormais, `handleRender` pose un
  cookie `__sg_authorized` (HMAC signé, TTL 120s) quand le render réussit (grant valide),
  et le middleware refuse `/assets/*.js|css` sans ce cookie (403 tableau). Un curl direct
  ou un client non validé ne peut plus télécharger le bundle.

## [0.3.7] - 2026-08-02

### Security
- **Notice de consentement anti-tampering** : le script de la notice (injecté dans le
  HTML rendu) restaure désormais INTÉGRALEMENT son style (`cssText`) et son contenu
  (`innerHTML`) s'ils sont modifiés via les devtools ou une manipulation JS. L'overlay
  est reconstruit si la card (`__sg_cd`) est supprimée. Le MutationObserver observe aussi
  `characterData` (modification du texte). Anti-boucle par comparaison exacte (convergence).
- Parité avec le guard client (`guard.src.js`) : la même logique `enforce()` est appliquée.

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
