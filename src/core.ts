import type { ShugoiCoreOptions, BlockPageContext } from './types'
import { ensureGuardsReady, fetchConfigForSiteKey } from './render'
import { buildCsp, originOf } from './csp'
import { resolveLocale, type Locale, MESSAGES } from './locales'
import { verifyBotIp } from './verify-bot'
import crypto from 'node:crypto'

export const DEFAULT_HEADLESS_PATTERNS = [
  /^curl/i, /^wget/i, /^python/i, /^Go-http-client/i, /^Java\//,
  /HTTPie/i, /^node-fetch/i, /axios/i, /^okhttp/i, /^scrapy/i,
  /PowerShell/i, /WinHttp/i,
];

export const BLOCK_PAGE = [
  "+---------------------------------------------+",
  "|           BLOCKED BY SHUGOI                 |",
  "+---------------------------------------------+",
  "|  Bots, scrapers and headless clients        |",
  "|  are blocked by Shugoi protection.          |",
  "|                                             |",
  "|  Use a standard browser to access           |",
  "|  this site.                                 |",
  "|                                             |",
  "|  - web: https://shugoi.com -                |",
  "+---------------------------------------------+",
].join('\n') + '\n';

export const DEFAULT_BOT_WHITELIST = [
  /Googlebot/i, /Bingbot/i, /Slurp/i, /DuckDuckBot/i, /YandexBot/i, /Applebot/i,
  /facebookexternalhit/i, /Twitterbot/i, /LinkedInBot/i, /Discordbot/i, /Slackbot/i,
  /WhatsApp/i, /TelegramBot/i,
];

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EvaluateCtx {
  path: string;
  ua: string;
  ip: string;
  host?: string;
  acceptLanguage?: string;
  secFetchDest?: string;
  secFetchMode?: string;
  sgProof?: string;
  sgOk?: string;
}

export interface BlockDecision {
  block: true;
  status: number;
  contentType: string;
  body: string;
  headers?: Record<string, string>;
}

export interface ShugoiCore {
  csp: string;
  cspEnabled: boolean;
  ensureValidated(): Promise<void>;
  isAllowlisted(path: string): boolean;
  isWhitelistedBot(ua: string): boolean;
  isTrustedBot(ua: string, ip: string): Promise<boolean>;
  evaluate(ctx: EvaluateCtx): Promise<BlockDecision | null>;
  isProofValid(proof: string): boolean;
  sgOkCookie(proof: string): string | null;
  log(...args: unknown[]): void;
}

function shieldPage(title: string, msg: string, badge: string, host: string, remainSecs: number, locale: Locale): string {
  const msgs = MESSAGES[locale]
  const prefix = msg ? msg.replace(/Il reste \d+ seconde?s?.*$/, '').replace(/Retry in \d+s?.*$/, '').trim() : ''
  const countdownScript = remainSecs > 0
    ? '<script>var s=' + remainSecs + ';var i=setInterval(function(){s--;var e=document.getElementById("cd");if(e){if(s<=0){e.innerHTML="0s";clearInterval(i);setTimeout(function(){location.reload()},500)}else{e.innerHTML=s+"s"}}},1000)</script>'
    : ''
  const desc = remainSecs > 0
    ? prefix + ' ' + msgs.retryInSeconds(remainSecs)
    : (msg || '')
  const htmlTitle = escapeHtml(title || msgs.blockedTitle)
  const htmlBadge = escapeHtml(badge || msgs.blockedBadge)
  const htmlHost = escapeHtml((host || 'shugoi.com').slice(0, 120))
  const htmlDesc = escapeHtml(desc)
  const htmlLang = locale === 'fr' ? 'fr' : 'en'
  return '<!DOCTYPE html><html lang="' + htmlLang + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:\'Alex Brush\';src:url(https://shugoi.com/alex-brush.woff2?v=2) format(\'woff2\');font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\'Segoe UI\',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\'Alex Brush\',Georgia,"Times New Roman",serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon.png alt class=l><img src=https://shugoi.com/brand.png alt class=b><div class=bdg>' + htmlBadge + '</div><h2>' + htmlTitle + '</h2><p class=desc>' + htmlDesc + '</p><p class=ft>' + htmlHost + ' \u00b7 Shugoi</p></div>' + countdownScript + '</body></html>'
}

export function createCore(options: ShugoiCoreOptions): ShugoiCore {
  const allowlist = options.allowlist ?? ['/api', '/legal']
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST
  const baseUrl = options.baseUrl ?? 'https://shugoi.com/api/v1'
  const debug = options.debug ?? false
  const siteSecret = options.secret
  const blockStatus = options.blockStatus ?? 403
  const blockPage = options.blockPage ?? null
  const cspEnabled = options.csp ?? true
  const verifyBots = options.verifyBots !== false
  let _validationValid = false
  let _validationFailed = false
  let _validationFailedReason = ''
  let _validationWarnedAt = 0
  const VALIDATION_WARN_INTERVAL = 3_600_000

  const csp = buildCsp({ siteKey: options.siteKey, extraDirectives: options.extraDirectives || {}, splitRender: options.splitRender ?? true, apiOrigin: originOf(baseUrl) ?? undefined })

  function log(...args: unknown[]) { if (debug) console.log('[shugoi]', ...args) }

  // ═══ PoW anti-curl helpers (définis ici, utilisés par evaluate ET l'interface) ═══
  const POW_DIFF = 14; // ~16k itérations ≈ 5-15ms
  const POW_OK_TTL_MS = 30 * 24 * 3600 * 1000; // cookie __sg_ok valable 30 jours
  const powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || ''

  function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    const ba = Buffer.from(a, 'utf8')
    const bb = Buffer.from(b, 'utf8')
    return crypto.timingSafeEqual(ba, bb)
  }

  function isPowValid(proof: string): boolean {
    if (!proof || !powSecret) return false
    const sep = proof.indexOf(':')
    if (sep <= 0) return false
    const tsStr = proof.slice(0, sep)
    const sol = proof.slice(sep + 1)
    const ts = parseInt(tsStr, 10)
    if (isNaN(ts) || Math.abs(Date.now() - ts * 1000) > 120000) return false
    const salt = crypto.createHmac('sha256', powSecret).update(tsStr).digest('hex')
    const digest = crypto.createHash('sha256').update(salt + ':' + sol).digest('hex')
    let leading = 0
    for (let i = 0; i < digest.length; i++) {
      const nib = parseInt(digest[i], 16)
      if (nib === 0) { leading += 4; continue }
      const bin = nib.toString(2)
      let z = 0; while (z < bin.length && bin[z] === '0') z++
      leading += z; break
    }
    return leading >= POW_DIFF
  }

  function sgOkCookieValue(): string {
    const ts = Math.floor(Date.now() / 1000)
    const sig = crypto.createHmac('sha256', powSecret).update('sg_ok:' + ts).digest('hex')
    return ts + ':' + sig
  }

  function isSgOkValid(cookieVal: string): boolean {
    if (!powSecret) return false
    const sep = cookieVal.indexOf(':')
    if (sep <= 0) return false
    const tsStr = cookieVal.slice(0, sep)
    const sig = cookieVal.slice(sep + 1)
    const ts = parseInt(tsStr, 10)
    if (isNaN(ts) || Date.now() - ts * 1000 > POW_OK_TTL_MS || ts * 1000 > Date.now() + 60000) return false
    const expected = crypto.createHmac('sha256', powSecret).update('sg_ok:' + tsStr).digest('hex')
    return safeEqual(sig, expected)
  }

  const validationPromise: Promise<void> = (async () => {
    if (siteSecret && baseUrl) {
      try {
        const res = await fetch(baseUrl + '/validate-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteKey: options.siteKey, secret: siteSecret }),
          signal: AbortSignal.timeout(5000)
        })
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>
          if (data.valid) {
            _validationValid = true
            if (debug) console.log('[shugoi] key validation OK')
          } else {
            _validationFailed = true
            _validationFailedReason = String(data.reason || 'invalid')
          }
        } else {
          _validationFailed = true
          _validationFailedReason = 'HTTP ' + res.status
        }
      } catch (e) {
        _validationFailed = true
        _validationFailedReason = 'réseau: ' + (e instanceof Error ? e.message : String(e))
      }
    } else if (debug) {
      console.log('[shugoi] no secret provided, skipping key validation')
    }
  })()

  ensureGuardsReady(baseUrl, siteSecret, options.siteKey).catch(() => {})

  async function ensureValidated(): Promise<void> {
    if (!siteSecret) return
    if (_validationValid || _validationFailed) return
    await Promise.race([
      validationPromise,
      new Promise<void>((r) => setTimeout(r, 500)),
    ])
  }

  function isAllowlisted(path: string): boolean {
    return allowlist.some(p => path === p || path.startsWith(p + '/'))
  }

  function isWhitelistedBot(ua: string): boolean {
    return botWhitelist.some(p => p.test(ua))
  }

  async function isTrustedBot(ua: string, ip: string): Promise<boolean> {
    if (!isWhitelistedBot(ua)) return false
    if (!verifyBots) return true
    const verified = await verifyBotIp(ua, ip)
    if (verified === null) return true
    return verified
  }

  async function evaluate(ctx: EvaluateCtx): Promise<BlockDecision | null> {
    await ensureValidated()
    if (siteSecret && _validationFailed && Date.now() - _validationWarnedAt > VALIDATION_WARN_INTERVAL) {
      _validationWarnedAt = Date.now()
      console.warn(
        '[shugoi] La validation de la clé a échoué (' + (_validationFailedReason || 'raison inconnue') + ').\n' +
        '[shugoi] La protection reste active, mais cette installation n\'est pas authentifiée.\n' +
        '[shugoi] Vérifiez `siteKey` et `secret` : https://shugoi.com/docs#validation'
      )
      fetch(baseUrl + '/event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey: options.siteKey, reason: 'validation_failed' }),
        signal: AbortSignal.timeout(2000),
      }).catch(() => {})
    }

    if (isAllowlisted(ctx.path)) return null

    // ═══ Route du challenge JS (suit le 307 anti-curl) ═══
    // Le navigateur arrive ici après le 307. Body MINIMAL : le tableau ASCII seul
    // + une balise <script src> (le JS PoW vit dans /__sg_challenge.js). Le view-source
    // montre uniquement le tableau, pas de wrapper HTML ni de JS inline.
    if (ctx.path === '/__sg_challenge') {
      const html = '<pre>' + BLOCK_PAGE + '</pre><script src="/__sg_challenge.js"></script>'
      return { block: true, status: 200, contentType: 'text/html', body: html }
    }

    // ═══ Route du JS de résolution PoW (chargé par /__sg_challenge) ═══
    // Le script lit ts/salt/diff/path depuis son propre query string, résout le PoW
    // puis redirige vers path?sg_proof=...
    if (ctx.path === '/__sg_challenge.js') {
      const js = `(function(){
var P=new URLSearchParams(location.search);
var salt=P.get('salt')||'', ts=P.get('ts')||'', diff=parseInt(P.get('diff')||'14',10), path=P.get('path')||'/';
var enc=new TextEncoder();
function bits(d){var l=0;for(var i=0;i<d.length;i++){var b=parseInt(d[i],16);if(b===0){l+=4;continue}var s=b.toString(2),z=0;while(z<s.length&&s[z]==='0')z++;l+=z;break}return l}
var n=0;
function step(){
  crypto.subtle.digest('SHA-256',enc.encode(salt+':'+n.toString(16))).then(function(buf){
    var h=Array.from(new Uint8Array(buf)).map(function(v){return v.toString(16).padStart(2,'0')}).join('');
    if(bits(h)>=diff){var base=path;var q=(base.indexOf('?')>=0?'&':'?')+'sg_proof='+ts+':'+n.toString(16);location.replace(base+q)}
    else{n++;if(n<300000)step()}
  }).catch(function(){location.reload()});
}
step();
})();`
      return { block: true, status: 200, contentType: 'text/plain', body: js, headers: { 'Content-Type': 'application/javascript; charset=utf-8' } }
    }

    // ═══ Pre-flight PoW challenge (anti-curl/view-source) ═══
    // Un 307 dont le corps est UNIQUEMENT le tableau ASCII : curl le voit en clair,
    // le navigateur suit la redirection vers /__sg_challenge (le JS qui résout le PoW).
    // Après un PoW validé, un cookie __sg_ok (signé) évite le challenge aux navigations
    // suivantes → chargement rapide pour les navigateurs réels.
    const isPage = !ctx.path.includes('/__shugoi/') && !ctx.path.startsWith('/api/')
      && !/\.[a-zA-Z0-9]{1,5}$/.test(ctx.path.split('?')[0])

    if (isPage && powSecret && ctx.ua && /Mozilla/i.test(ctx.ua)) {
      const proof = ctx.sgProof || ''
      const validProof = !!proof && isPowValid(proof)
      const alreadyOk = !!ctx.sgOk && isSgOkValid(ctx.sgOk)
      if (!validProof && !alreadyOk) {
        // 307 vers le challenge : body = tableau ASCII SEUL (curl le voit tel quel).
        // Le navigateur suit la redirection → /__sg_challenge?ts=&salt=&diff=&path=
        const tsNow = Math.floor(Date.now() / 1000)
        const salt = crypto.createHmac('sha256', powSecret).update(String(tsNow)).digest('hex')
        const path = (ctx.path.startsWith('/') ? ctx.path : '/' + ctx.path)
        const chalUrl = '/__sg_challenge?ts=' + tsNow + '&salt=' + salt + '&diff=' + POW_DIFF + '&path=' + encodeURIComponent(path)
        log('pow challenge (307):', ctx.ua.slice(0, 40))
        return { block: true, status: 307, contentType: 'text/plain', body: BLOCK_PAGE, headers: { Location: chalUrl } }
      }
      // sgProof ou cookie valide → on laisse passer (le middleware posera le cookie).
    }

    const flags = await fetchConfigForSiteKey(options.siteKey, baseUrl)

    // Le blocage headless est actif par défaut, y compris sans configuration chargée :
    // c'est la protection minimale attendue du produit.
    const headlessEnabled = flags.enableHeadlessCheck !== false

    // Rate limit check — activé uniquement si le flag est explicitement vrai
    if (flags.enableRateLimit === true) {
      try {
        const rlRes = await fetch(baseUrl + '/rate-limit-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteKey: options.siteKey,
            scope: 'edge_ip',
            ip: ctx.ip,
            metadata: { ip: ctx.ip, userAgent: ctx.ua || '', middleware: true },
          }),
          signal: AbortSignal.timeout(2000)
        })
        if (rlRes.ok) {
          const rlData = await rlRes.json() as Record<string, unknown>
          if (rlData.allowed === false) {
            const remain = Math.max(0, Math.ceil(((rlData.resetAt as number) - Date.now()) / 1000))
            const mins = Math.floor(remain / 60)
            const secs = remain % 60
            const timeStr = mins > 0 ? mins + ' min' + (mins > 1 ? 's' : '') + (secs > 0 ? ' ' + secs + ' s' : '') : secs + ' seconde' + (secs > 1 ? 's' : '')
            const loc = options.locale ?? resolveLocale(undefined, ctx.acceptLanguage)
            const msgs = MESSAGES[loc]
            if (blockPage) {
              return { block: true, status: 429, contentType: 'text/html', body: blockPage({ reason: 'rate_limit', title: msgs.rateLimitTitle, message: msgs.rateLimitBody(timeStr), badge: msgs.rateLimitBadge, host: ctx.host || '', remainingSeconds: remain, locale: loc }) }
            }
            return { block: true, status: 429, contentType: 'text/html', body: shieldPage(msgs.rateLimitTitle, msgs.rateLimitBody(timeStr), msgs.rateLimitBadge, ctx.host || '', remain, loc) }
          }
        }
      } catch {}
    }

    // Headless UA block
    if (headlessEnabled && ctx.ua && !(await isTrustedBot(ctx.ua, ctx.ip)) && headlessPatterns.some(p => p.test(ctx.ua))) {
      log('headless block:', ctx.ua.slice(0, 40))
      fetch(baseUrl + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteKey: options.siteKey, reason: 'headless' }), signal: AbortSignal.timeout(2000) }).catch(() => {})
      return { block: true, status: blockStatus, contentType: 'text/plain', body: BLOCK_PAGE }
    }

    // Sec-Fetch + Accept-Language check for fake browsers.
    // NE BLOQUE PLUS en 403 brut (audit Tor) : un navigateur légitime sans Sec-Fetch
    // (ex. Tor Browser) recevait un 403 texte au lieu de la page de blocage dédiée.
    // On laisse le guard CLIENT gérer la détection (Tor → card "Tor détecté", etc.).
    if (headlessEnabled && /Mozilla/i.test(ctx.ua) && !(await isTrustedBot(ctx.ua, ctx.ip))) {
      const sfd = ctx.secFetchDest ?? ''
      const sfm = ctx.secFetchMode ?? ''
      const al = ctx.acceptLanguage ?? ''
      if (!al || (!sfd && !sfm)) {
        log('fake browser (Sec-Fetch absent) → challenge client, pas de 403:', ctx.ua.slice(0, 40))
      }
    }

    return null
  }

  return { csp, cspEnabled, ensureValidated, isAllowlisted, isWhitelistedBot, isTrustedBot, evaluate, log,
    isProofValid: isPowValid,
    sgOkCookie(proof: string): string | null {
      if (!proof || !isPowValid(proof)) return null
      return '__sg_ok=' + sgOkCookieValue() + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(POW_OK_TTL_MS / 1000) + (process.env.NODE_ENV === 'production' ? '; Secure' : '')
    }
  }
}
