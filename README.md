# Shugoi — Node.js

[![npm version](https://img.shields.io/npm/v/shugoi)](https://npmjs.com/package/shugoi)

Hardware fingerprinting anti-abuse protection. One-line integration for Express, Fastify, Next.js, and vanilla Node.

```bash
npm install shugoi
```

Guard scripts are loaded dynamically from the Shugoi API — updates apply instantly without updating `node_modules`.

---

## Quick Start

### Express

```ts
import express from "express";
import { createShugoiMiddleware } from "shugoi";

const app = express();
app.use(createShugoiMiddleware({ siteKey: "sg_sk_live_xxx" }));
// All HTML responses now get CSP + anti-bot + guard injection
app.get("/", (req, res) => res.send("<h1>Protected</h1>"));
app.listen(3000);
```

### Fastify (native plugin)

```ts
import Fastify from "fastify";
import { createShugoiPlugin } from "shugoi";

const app = Fastify();
app.register(createShugoiPlugin({ siteKey: "sg_sk_live_xxx" }));
app.get("/", async () => "<h1>Protected</h1>");
app.listen({ port: 3000 });
```

### Next.js (proxy middleware)

```ts
// src/proxy.ts
import { createShugoiProxy, SHUGOI_MATCHER } from "shugoi/next";

export const proxy = createShugoiProxy({ siteKey: "sg_sk_live_xxx" });
export const config = { matcher: SHUGOI_MATCHER };
```

## PHP / Laravel

A PHP port of the Shugoi middleware is available for Laravel applications. It's a full port of the Node.js middleware with the same security guarantees — browser fingerprinting, headless detection, rate limiting, CSP injection, and split-render.

### Installation

```bash
composer require shugoi/shugoi-php
```

### Quick Start

1. Publish the config:
```bash
php artisan vendor:publish --tag=shugoi-config
```

2. Set environment variables in `.env`:
```env
SHUGOI_SITE_KEY=sg_sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHUGOI_SECRET=your_site_secret
SHUGOI_INTERNAL_URL=http://127.0.0.1:8080
```

3. Register the middleware in `bootstrap/app.php`:
```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->append(\Shugoi\Laravel\ShugoiMiddleware::class);
    $middleware->excludeFrom(\Shugoi\Laravel\ShugoiMiddleware::class, ['__shugoi/*']);
})
```

4. Verify your setup:
```bash
php artisan shugoi:setup
```

### Documentation

See the [shugoi-php package](https://github.com/ShugoiTeam/shugoi-php) for full documentation, configuration reference, Blade directives, Artisan commands, and non-Laravel PSR-15 usage.

### Vanilla Node.js

```ts
import http from "http";
import { createShugoiMiddleware } from "shugoi";

const mw = createShugoiMiddleware({ siteKey: "sg_sk_live_xxx" });
http.createServer(async (req, res) => {
  let called = false;
  await mw(req, res, () => { called = true; });
  if (called) res.end("<h1>Protected</h1>");
}).listen(3000);
```

---

## Options Reference

All options are available for both `createShugoiMiddleware` and `createShugoiPlugin`.

| Option | Type | Default | Description |
|---|---|---|---|
| `siteKey` | `string` | **required** | Your Shugoi siteKey |
| `secret` | `string` | — | Site secret — enables key validation and token signing |
| `signingSecret` | `string` | `secret` | HMAC secret for token signing (defaults to `secret`) |
| `allowlist` | `string[]` | `['/api', '/legal']` | Paths that bypass all protection |
| `headlessPatterns` | `RegExp[]` | curl, wget, python, … | User-Agent patterns to block |
| `botWhitelist` | `RegExp[]` | Googlebot, Bingbot, … | Legitimate bots (exempt from blocking AND split-render) |
| `baseUrl` | `string` | `https://shugoi.com/api/v1` | Shugoi API base URL |
| `debug` | `boolean` | `false` | Enable console logs |
| `autoInject` | `boolean` | `true` | Auto-inject guard scripts into HTML |
| `restrictedAccess` | `boolean` | `false` | **Obsolète** — le blocage des machines non whitelistées est géré automatiquement par le endpoint `/api/v1/wlc` (`applyDecision(false)` → `window.__sg_blocked`). L'option n'est pas requise. |
| `extraDirectives` | `Record<string,string[]>` | — | Additional CSP sources **added** to defaults (union). To remove a source, use `csp: false` and set your own header. |
| `verifyBots` | `boolean` | `true` | Verify whitelisted bots (Googlebot, Bingbot…) via reverse DNS lookup against their official IP ranges. Set to `false` if outbound DNS is blocked. |
| `csp` | `boolean` | `true` | Set to `false` to disable CSP header entirely |
| `blockStatus` | `number` | `403` | HTTP status code for block pages |
| `locale` | `'fr' \| 'en'` | auto (Accept-Language) | Language for blocking pages |
| `blockPage` | `(ctx) => string` | — | Full override: custom blocking page HTML |
| `splitRender` | `boolean` | `true` | Set to `false` to disable skeleton injection |
| `multiProcess` | `boolean` | `false` | Enable disk-based HTML storage (required for PM2 cluster) |

---

## Split-Render: What It Implies

By default (`splitRender: true`), Shugoi replaces the HTML body with a minimal skeleton that:
1. Runs the guard detection script
2. Identifies the machine fingerprint
3. Verifies it against the whitelist
4. Only then loads the real page content via `fetch()` + `document.write()`

This means:
- **`unsafe-eval` is required** in production. The bootstrap obfuscates the bootcode as invisible characters (U+E0000+, Supplementary Private Use Area-B) and executes it via `eval()`. `buildCsp` adds `'unsafe-eval'` to `script-src` by default in production; set `bootEval: false` (or `enableDevtoolsCheck: false`) in `buildCsp` to opt out. In development the plain bootcode is emitted and no `unsafe-eval` is needed.
- **Bots get the original HTML**, not the skeleton (Googlebot, Bingbot, etc. — they exit before injection). No SEO impact.
- **First paint is the skeleton**, not your actual content. The real page loads ~100-300ms after.
- **Without JavaScript**, the page stays blank (skeleton). This is by design — it blocks non-JS scrapers, with the exception of verified search engine bots (Googlebot, Bingbot…) which receive the original HTML (see `verifyBots` option).

### Consequences of `document.write`

The split-render mechanism uses `document.open()` + `document.write()` + `document.close()`, which has side effects you should be aware of:

| Consequence | Detail |
|---|---|
| Back/forward cache (bfcache) is lost | Pages replaced by `document.write` are not eligible for bfcache. Navigating back reloads everything from scratch. |
| Scroll restoration is lost | Native scroll restoration stops working, hence the explicit `window.scrollTo(0,0)` call. |
| Scripts execute twice | Scripts in the skeleton run, then scripts in the real document run again. |
| `DOMContentLoaded` fires twice | Libraries listening for this event may initialize twice. |
| History API / client-side routing can break | An SPA that initializes in the skeleton and is then replaced loses its state. |
| Browser extensions see the skeleton first | Some extensions don't re-apply their modifications to the replacement document. |

### Should you disable split-render?

| Your case | Recommendation |
|---|---|
| Server-rendered site, classic pages | Keep enabled. This is the blocking mode. |
| SPA (React, Vue, Svelte) with client routing | **Test first.** The skeleton is replaced after SPA init: state may be lost. |
| Strict CSP without inline scripts | Disable split-render or provide your own nonce-based CSP. |
| First-paint-critical site (e-commerce, content) | Disable, or accept 100-300ms delay. |
| Internal app behind authentication | Disable: anti-scraper protection is unnecessary. |

With `splitRender: false`, guards are injected as plain `<script src="…">` tags. You keep Tor, VM, headless and anti-detect detection, plus rate limiting. You lose scraping protection against bots without JavaScript.

---

## CSP

Shugoi **merges** its CSP directives with any existing `Content-Security-Policy` header your app already sets (via Helmet, etc.). It does not overwrite.

Default directives injected:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://shugoi.com;
connect-src 'self' https://shugoi.com;
style-src 'self' 'unsafe-inline' https://shugoi.com;
font-src 'self' https://shugoi.com data:;
img-src 'self' https://shugoi.com data: blob:;
frame-ancestors 'self';
object-src 'none';
base-uri 'self';
form-action 'self'
```

Use `extraDirectives` to add sources (union with defaults). Use `csp: false` to disable the CSP header entirely.

If your `baseUrl` points to a self-hosted API, its origin is automatically added to `script-src`, `connect-src`, `style-src`, `font-src`, and `img-src`.

---

## CORS / CORP (cross-origin resources)

The Shugoi **guard runs in your visitors' browsers** and fetches resources (guard script, `/wlc` whitelist check, fonts, block-page images) from `baseUrl`. This is a **cross-origin** request from your site to the API server.

For these requests to succeed, the **API server** must respond with:

- `Access-Control-Allow-Origin: *` (or your site's origin)
- `Cross-Origin-Resource-Policy: cross-origin` — **not** `same-site`, otherwise the browser blocks the response with `ERR_BLOCKED_BY_RESPONSE.NotSameSite` and every visitor is shown the restricted block page.

**When using the hosted `https://shugoi.com/api/v1` endpoint, this is already configured.** If you self-host the API, add these headers on the routes that serve the guard (`/guard-detect`, `/guard`) and the whitelist check (`/wlc`, `/whitelist-check`).

Example (Express):

```js
app.use('/api/v1', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
```

> ⚠️ Do **not** set a global `Cross-Origin-Resource-Policy: same-site` on the API server: it will break the cross-origin guard fetch and block every visitor.

---

## Rate Limiting: Two Distinct Layers

| Layer | Discriminant | Role | Threshold |
|---|---|---|---|
| Middleware (this module) | Source IP | Anti-DoS. Coarse by nature: multiple users can share one IP (corporate NAT, CGNAT). | High, ~300 req/5 min |
| Guards (browser) | Machine fingerprint | Anti-fraud. Precise: identifies the physical device. | Per-action, configurable |

`enableRateLimit` controls only the first layer. It is **disabled by default** precisely because an IP-based threshold produces false positives behind NAT. Only enable it if you are experiencing automated traffic spikes.

---

## Error Handling

All errors are `ShugoiError` instances with a machine-readable code.

```ts
import { ShugoiError } from "shugoi";

try {
  await checkLicense({ siteKey: "invalid", action: "signup", machineId: "abc" });
} catch (err) {
  if (err instanceof ShugoiError) {
    switch (err.code) {
      case "invalid_site_key":
      case "api_unreachable":
      case "api_timeout":
      case "unexpected_api_response":
        console.error("Shugoi:", err.message);
    }
  }
}
```

---

## Tests

```bash
npm test          # suite complète (vitest)
npm run build     # ESM + CJS + types (tsup)
npm run typecheck # tsc --noEmit
```

---

## License

MIT — Copyright (c) 2026 Yohan SANNIER
