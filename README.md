# Shugoi - Node.js

[![npm version](https://img.shields.io/npm/v/shugoi)](https://npmjs.com/package/shugoi)

Hardware fingerprinting anti-abuse protection. One-line integration for Express, Fastify, Next.js.

```bash
npm install shugoi
```

Guard scripts (guard-detect + guard) are loaded dynamically from `https://shugoi.com/api/v1/*`.
This means updates on shugoi.com apply instantly to all sites without updating node_modules.

## Quick Start (Express)

```ts
import express from 'express';
import { createShugoiMiddleware } from 'shugoi';

const app = express();

// One line: CSP, anti-bot, guard injection, Tor protection, consent notice
app.use(createShugoiMiddleware({
  siteKey: 'sg_sk_live_xxx',
  allowlist: ['/legal', '/docs'],
}));

// Guard scripts are auto-injected into HTML - no manual tags needed
app.get('/', (req, res) => res.send('<h1>Protected by Shugoi</h1>'));
app.listen(3000);
```

### Vanilla Node.js

```ts
import http from 'http';
import { createShugoiMiddleware } from 'shugoi';

const mw = createShugoiMiddleware({ siteKey: 'sg_sk_live_xxx' });
http.createServer(async (req, res) => {
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });
  if (nextCalled) res.end('<h1>Protected</h1>');
}).listen(3000);
```

### Fastify (via @fastify/express)

```ts
import Fastify from 'fastify';
import expressPlugin from '@fastify/express';
import { createShugoiMiddleware } from 'shugoi';

const app = Fastify();
await app.register(expressPlugin);
app.use(createShugoiMiddleware({ siteKey: 'sg_sk_live_xxx' }));
```

### Next.js (App Router)

```ts
// next.config.ts
import { withShugoi } from 'shugoi/next';
export default withShugoi({ siteKey: 'sg_sk_live_xxx' }, nextConfig);
```

Add `src/proxy.ts` for anti-bot blocking (Next.js 16+):

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

## API

### `createShugoiMiddleware(options)`

Connect-compatible middleware. Sets up CSP, anti-bot (User-Agent + Sec-Fetch), and allowlist.

| Option | Type | Default | Description |
|---|---|---|---|
| `siteKey` | `string` | - | **Required.** Your Shugoi siteKey |
| `allowlist` | `string[]` | `['/legal']` | Paths that bypass anti-bot |
| `headlessPatterns` | `RegExp[]` | curl, wget, python, ... | User-Agent patterns to block |
| `botWhitelist` | `RegExp[]` | Googlebot, Bingbot, ... | Legitimate bots to allow |
| `baseUrl` | `string` | `https://shugoi.com/api/v1` | API base URL |
| `timeout` | `number` | `5000` | API timeout in ms |
| `debug` | `boolean` | `false` | Enable console logs |

### `checkLicense(options)`

Calls `POST /api/v1/check`. Returns `CheckResponse`.

```ts
const result = await checkLicense({
  siteKey: 'sg_sk_live_xxx',
  action: 'signup',
  machineId: window.machineId,
});

if (result.blocked) {
  // Blocked: Tor, VM, headless...
  redirect(`/blocked?reason=${result.blocked_reason}`);
}
if (!result.allowed) {
  // Rate limited: too many requests
  return { error: 'rate_limited', retryAfter: result.resetAt };
}
```

### `buildCsp(options)`

Generates a `Content-Security-Policy` header string with Shugoi directives.

### `scriptTags(options)`

Generates `<script>` tags for guard-detect and guard scripts.

## Error Handling

All errors are `ShugoiError` instances with a machine-readable code.

```ts
import { ShugoiError } from 'shugoi';

try {
  await checkLicense({ siteKey: 'invalid', action: 'signup', machineId: 'abc' });
} catch (err) {
  if (err instanceof ShugoiError) {
    switch (err.code) {
      case 'invalid_site_key':   // SiteKey invalid or expired
      case 'api_unreachable':    // Shugoi API unreachable
      case 'api_timeout':        // API request timed out
      case 'unexpected_api_response': // Unexpected response
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

## License

MIT
