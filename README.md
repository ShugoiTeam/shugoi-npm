# Shugoi — Node.js

[![npm version](https://img.shields.io/npm/v/shugoi)](https://npmjs.com/package/shugoi)

Protection anti-abus par fingerprinting matériel. Une ligne d'intégration pour Express, Fastify, Next.js.

```bash
npm install shugoi
```

## Quick Start

### Express

```ts
import express from 'express';
import { createShugoiMiddleware } from 'shugoi';

const app = express();
app.use(createShugoiMiddleware({
  siteKey: 'sg_sk_live_xxx',
  allowlist: ['/legal', '/docs'],
}));

app.get('/', (req, res) => res.send('<h1>Protégé par Shugoi</h1>'));
app.listen(3000);
```

### Next.js (App Router)

```ts
// next.config.ts
import { withShugoi } from 'shugoi/next';

export default withShugoi(
  { siteKey: 'sg_sk_live_xxx' },
  { reactStrictMode: true }
);
```

Ajoutez aussi `src/proxy.ts` pour le blocage anti-bot :

```ts
import { NextResponse } from 'next/server';
const ALLOWLIST = (process.env.ALLOWLIST_PATHS || '/legal').split(',').map(s => s.trim());
const HEADLESS = [/^curl/i, /^wget/i, /^python/i, /^Go-http-client/i];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/_next/') || path.startsWith('/api/')) return NextResponse.next();
  if (ALLOWLIST.some(p => path === p || path.startsWith(p + '/'))) return NextResponse.next();
  const ua = request.headers.get('user-agent') || '';
  if (HEADLESS.some(r => r.test(ua)))
    return new NextResponse('BLOCKED BY SHUGOI', { status: 200 });
  return NextResponse.next();
}
export const config = { matcher: '/((?!_next/static|_next/image|favicon.ico).*)' };
```

### Scripts HTML

```ts
import { scriptTags } from 'shugoi';

const { guardDetect, guard } = scriptTags({ siteKey: 'sg_sk_live_xxx' });
// guardDetect → <head> (beforeInteractive)
// guard → fin de <body> (afterInteractive)
```

## API

### `createShugoiMiddleware(options)`

Connect-compatible middleware. Configure CSP, anti-bot (User-Agent + Sec-Fetch), et allowlist.

| Option | Type | Défaut | Description |
|---|---|---|---|
| `siteKey` | `string` | — | **Requis.** Votre siteKey Shugoi |
| `allowlist` | `string[]` | `['/legal']` | Chemins qui bypassent l'anti-bot |
| `headlessPatterns` | `RegExp[]` | curl, wget, python, ... | Patterns User-Agent à bloquer |
| `botWhitelist` | `RegExp[]` | Googlebot, Bingbot, ... | Bots légitimes à ne pas bloquer |
| `baseUrl` | `string` | `https://shugoi.com/api/v1` | URL de base API |
| `timeout` | `number` | `5000` | Timeout API en ms |
| `debug` | `boolean` | `false` | Logs console |

### `checkLicense(options)`

Appelle `POST /api/v1/check`. Retourne `CheckResponse`.

```ts
const result = await checkLicense({
  siteKey: 'sg_sk_live_xxx',
  action: 'signup',
  machineId: window.machineId,
});

if (result.blocked) {
  // Bloquer : Tor, VM, headless...
  redirect(`/blocked?reason=${result.blocked_reason}`);
}
if (!result.allowed) {
  // Rate limit : trop de requêtes
  return { error: 'rate_limited', retryAfter: result.resetAt };
}
```

### `buildCsp(options)`

Génère la chaîne `Content-Security-Policy` avec les directives Shugoi.

### `scriptTags(options)`

Génère les balises `<script>` pour guard-detect et guard.

## Error Handling

Toutes les erreurs sont des `ShugoiError` avec un code machine-readable.

```ts
import { ShugoiError } from 'shugoi';

try {
  await checkLicense({ siteKey: 'invalid', action: 'signup', machineId: 'abc' });
} catch (err) {
  if (err instanceof ShugoiError) {
    switch (err.code) {
      case 'invalid_site_key':   // SiteKey invalide ou expirée
      case 'api_unreachable':    // API Shugoi injoignable
      case 'api_timeout':        // Timeout sur l'appel API
      case 'unexpected_api_response': // Réponse inattendue
        console.error('Shugoi:', err.message);
    }
  }
}
```

## Tests

```bash
npm test        # 38 tests, 8 test files
npm run build   # ESM + CJS + types
npm run typecheck
```

## Licence

MIT
