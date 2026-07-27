import type { ShugoiCoreOptions, BlockPageContext } from './types'
import { ensureGuardsReady, fetchConfigForSiteKey } from './render'
import { buildCsp, originOf } from './csp'
import { resolveLocale, type Locale, MESSAGES } from './locales'
import { verifyBotIp } from './verify-bot'

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
  "|  - contact: support@shugoi.com -            |",
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
}

export interface BlockDecision {
  block: true;
  status: number;
  contentType: string;
  body: string;
}

export interface ShugoiCore {
  csp: string;
  cspEnabled: boolean;
  ensureValidated(): Promise<void>;
  isAllowlisted(path: string): boolean;
  isWhitelistedBot(ua: string): boolean;
  isTrustedBot(ua: string, ip: string): Promise<boolean>;
  evaluate(ctx: EvaluateCtx): Promise<BlockDecision | null>;
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
  return '<!DOCTYPE html><html lang="' + htmlLang + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:\\x27Alex Brush\\x27;src:url(/alex-brush.woff2) format(\\x27woff2\\x27);font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\'Segoe UI\',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\'Alex Brush\',Georgia,"Times New Roman",serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=/favicon.png alt class=l><img src=/brand.png alt class=b><div class=bdg>' + htmlBadge + '</div><h2>' + htmlTitle + '</h2><p class=desc>' + htmlDesc + '</p><p class=ft>' + htmlHost + ' \u00b7 Shugoi</p></div>' + countdownScript + '</body></html>'
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

    // Sec-Fetch + Accept-Language check for fake browsers
    if (headlessEnabled && /Mozilla/i.test(ctx.ua) && !(await isTrustedBot(ctx.ua, ctx.ip))) {
      const sfd = ctx.secFetchDest ?? ''
      const sfm = ctx.secFetchMode ?? ''
      const al = ctx.acceptLanguage ?? ''
      if (!al || (!sfd && !sfm)) {
        log('fake browser block:', ctx.ua.slice(0, 40))
        fetch(baseUrl + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteKey: options.siteKey, reason: 'headless' }), signal: AbortSignal.timeout(2000) }).catch(() => {})
        return { block: true, status: blockStatus, contentType: 'text/plain', body: BLOCK_PAGE }
      }
    }

    return null
  }

  return { csp, cspEnabled, ensureValidated, isAllowlisted, isWhitelistedBot, isTrustedBot, evaluate, log }
}
