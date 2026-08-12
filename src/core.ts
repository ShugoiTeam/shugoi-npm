import type { JsonObject, ShugoiCoreOptions } from './types'
import { ensureGuardsReady, fetchConfigForSiteKey } from './render'
import { buildCsp, originOf } from './csp'
import { resolveLocale, type Locale, MESSAGES } from './locales'
import { verifyBotIp, VERIFIABLE_BOTS } from './verify-bot'
import { BLOCK_PAGE } from './block-page'
import { safeChallengePath } from './security-utils'
import { createPowNonce, verifyPow } from './pow-utils'
import { ChallengeLimiter } from './challenge-limiter'
import { createOkCookieValue, isAuthorizedCookieValid, isOkCookieValid } from './cookie-security'
export { BLOCK_PAGE } from './block-page'
import crypto from 'node:crypto'

export const DEFAULT_HEADLESS_PATTERNS = [
  /^curl/i, /^wget/i, /^python/i, /^Go-http-client/i, /^Java\//,
  /HTTPie/i, /^node-fetch/i, /axios/i, /^okhttp/i, /^scrapy/i,
  /PowerShell/i, /WinHttp/i,
];

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
  host?: string | undefined;
  acceptLanguage?: string | undefined;
  secFetchDest?: string | undefined;
  secFetchMode?: string | undefined;
  sgProof?: string | undefined;
  sgOk?: string | undefined;
  sgAuthorized?: string | undefined;
  forwardedPrefix?: string | undefined;
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
  sgOkCookie(proof: string, ip: string, ua: string): string | null;
  log(...args: string[]): void;
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
  const siteSecret = options.signingSecret || options.secret
  const blockStatus = options.blockStatus ?? 403
  const blockPage = options.blockPage ?? null
  const cspEnabled = options.csp ?? true
  const verifyBots = options.verifyBots !== false
  let _validationValid = false
  let _validationFailed = false
  let _validationFailedReason = ''
  let _validationWarnedAt = 0
  const VALIDATION_WARN_INTERVAL = 3_600_000

  const apiOrigin = originOf(baseUrl)
  const csp = buildCsp({
    siteKey: options.siteKey,
    extraDirectives: options.extraDirectives || {},
    splitRender: options.splitRender ?? true,
    ...(apiOrigin === null ? {} : { apiOrigin }),
  })

  function log(...args: string[]) { if (debug) console.log('[shugoi]', ...args) }

  const POW_DIFF = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "14");
    return Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
  })();
  const POW_OK_TTL_MS = 30 * 24 * 3600 * 1000;
  const powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || ''

  const POW_TTL_MS = 60_000;

  const CHALLENGE_LIMIT = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_LIMIT || "60");
    return Number.isInteger(raw) && raw > 0 ? raw : 60;
  })();
  const CHALLENGE_WINDOW_MS = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_WINDOW || "60");
    return Number.isInteger(raw) && raw > 0 ? raw * 1000 : 60_000;
  })();
  const CHALLENGE_MAX_BLOCK_MS = 15 * 60 * 1000;
  const challengeLimiter = new ChallengeLimiter({ limit: CHALLENGE_LIMIT, windowMs: CHALLENGE_WINDOW_MS, maxBlockMs: CHALLENGE_MAX_BLOCK_MS })

  const _usedProofs = new Map<string, number>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of _usedProofs) {
      if (now - t > POW_TTL_MS) _usedProofs.delete(k);
    }
  }, POW_TTL_MS).unref();
  function consumeProof(proof: string): boolean {
    if (_usedProofs.has(proof)) return false;
    _usedProofs.set(proof, Date.now());
    return true;
  }

  const isPowValid = (proof: string): boolean => verifyPow(proof, { secret: powSecret, difficulty: POW_DIFF, ttlMs: POW_TTL_MS })

  const cookieSecurity = { secret: powSecret, okTtlMs: POW_OK_TTL_MS, authorizedTtlMs: 120_000 }
  const sgOkCookieValue = (ip: string, ua: string): string => createOkCookieValue(ip, ua, cookieSecurity)
  const isSgOkValid = (value: string, ip: string, ua: string): boolean => isOkCookieValid(value, ip, ua, cookieSecurity)
  const isSgAuthorizedValid = (value: string): boolean => isAuthorizedCookieValid(value, cookieSecurity)

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
          const data = await res.json() as JsonObject
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
  const botIpList = new Set((process.env.SHUGOKI_BOT_IPS || '').split(',').map(s => s.trim()).filter(Boolean))
  async function botBypass(ua: string, ip: string): Promise<boolean> {
    if (!isWhitelistedBot(ua)) return false
    if (options.logBotIps !== false) {
      console.log('[shugoi] bot_ua ip=' + ip + ' ua=' + String(ua).slice(0, 50))
    }
    if (VERIFIABLE_BOTS.some(p => p.test(ua))) return await isTrustedBot(ua, ip)
    return true
  }

  async function isTrustedBot(ua: string, ip: string): Promise<boolean> {
    if (!isWhitelistedBot(ua)) return false
    if (!verifyBots) return true
    if (botIpList.has(ip)) return true
    const verified = await verifyBotIp(ua, ip)
    if (verified === null) return false
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

    if (/\/assets\/[^?#]+\.(js|css)(\?|$)/.test(ctx.path)) {
      const authOk = !!ctx.sgAuthorized && isSgAuthorizedValid(ctx.sgAuthorized)
      if (!authOk) {
        log('asset protégé refusé:', ctx.path.slice(0, 60))
        return { block: true, status: 403, contentType: 'text/plain', body: BLOCK_PAGE, headers: {} }
      }
    }

    if (isAllowlisted(ctx.path)) return null

    if (ctx.path === '/__sg_challenge') {
       if (!challengeLimiter.allow(ctx.ip)) {
        const loc = resolveLocale(undefined, ctx.acceptLanguage)
        const lmsgs = MESSAGES[loc]
        return { block: true, status: 429, contentType: 'text/html', body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody('1 min'), lmsgs.rateLimitBadge, ctx.host || '', 60, loc) }
      }
      const js = `(function(){
var P=new URLSearchParams(location.search);
var salt=P.get('salt')||'', ts=P.get('ts')||'', nonce=P.get('nonce')||'', diff=parseInt(P.get('diff')||'14',10), path=P.get('path')||'/';
if(path.charAt(0)!=='/'||path.charAt(1)==='/'||path.indexOf('\\\\')>=0)path='/';
var enc=new TextEncoder();
function bits(d){var l=0;for(var i=0;i<d.length;i++){var b=parseInt(d[i],16);if(b===0){l+=4;continue}l+=(b&8)?0:(b&4)?1:(b&2)?2:3;break}return l}
var n=0;
function step(){
  crypto.subtle.digest('SHA-256',enc.encode(salt+':'+n.toString(16))).then(function(buf){
    var h=Array.from(new Uint8Array(buf)).map(function(v){return v.toString(16).padStart(2,'0')}).join('');
    if(bits(h)>=diff){var base=path;var q=(base.indexOf('?')>=0?'&':'?')+'sg_proof='+ts+':'+nonce+':'+n.toString(16);location.replace(base+q)}
    else{n++;if(n<300000)step()}
  }).catch(function(){location.reload()});
}
step();
})();`
      const html = '<!--\n' + BLOCK_PAGE + '-->\n' + '<script>' + js + '</script>'
      return { block: true, status: 200, contentType: 'text/html', body: html }
    }

    const isPage = !ctx.path.includes('/__shugoi/') && !ctx.path.startsWith('/api/')

    if (isPage && powSecret && ctx.ua) {
      if (/Mozilla/i.test(ctx.ua) && !(await botBypass(ctx.ua, ctx.ip))) {
        const sfd = ctx.secFetchDest ?? ''
        const sfm = ctx.secFetchMode ?? ''
        const al = ctx.acceptLanguage ?? ''
        if (!al && !sfd && !sfm) {
          log('fake browser (Accept-Language + Sec-Fetch absents) → 403 block page:', ctx.ua.slice(0, 40))
          const bloc = resolveLocale(undefined, ctx.acceptLanguage)
          const lmsgs = MESSAGES[bloc]
          return { block: true, status: 403, contentType: 'text/html', body: shieldPage(lmsgs.fakeBrowserTitle, lmsgs.fakeBrowserBody, lmsgs.fakeBrowserBadge, ctx.host || '', 0, bloc) }
        }
      }
      const proof = ctx.sgProof || ''
      const validProof = !!proof && isPowValid(proof)
      const validCookie = !!ctx.sgOk && isSgOkValid(ctx.sgOk, ctx.ip, ctx.ua)
      const proofFresh = validProof ? consumeProof(proof) : false
      const canProceed = validCookie || proofFresh
      if (!canProceed && !(await botBypass(ctx.ua, ctx.ip))) {
         if (!challengeLimiter.allow(ctx.ip)) {
          const loc = resolveLocale(undefined, ctx.acceptLanguage)
          const lmsgs = MESSAGES[loc]
          log('challenge rate-limited:', ctx.ip.slice(0, 24), ctx.ua.slice(0, 40))
          return { block: true, status: 429, contentType: 'text/html', body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody('1 min'), lmsgs.rateLimitBadge, ctx.host || '', 60, loc) }
        }
        const tsNow = Math.floor(Date.now() / 1000)
        const nonce = createPowNonce()
        const salt = crypto.createHmac('sha256', powSecret).update(tsNow + ':' + nonce).digest('hex')
        const prefix = ctx.forwardedPrefix && ctx.forwardedPrefix !== '/' ? ctx.forwardedPrefix.replace(/\/$/, '') : ''
        const path = safeChallengePath(ctx.path.startsWith('/') ? ctx.path : '/' + ctx.path)
        const chalUrl = prefix + '/__sg_challenge?ts=' + tsNow + '&salt=' + salt + '&nonce=' + nonce + '&diff=' + POW_DIFF + '&path=' + encodeURIComponent(prefix + path)
        log('pow challenge (307):', ctx.ua.slice(0, 40))
        return { block: true, status: 307, contentType: 'text/plain', body: BLOCK_PAGE, headers: { Location: chalUrl } }
      }
    }

    const flags = await fetchConfigForSiteKey(options.siteKey, baseUrl, options.signingSecret || options.secret)

    const headlessEnabled = flags.enableHeadlessCheck !== false

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
      const rlData = await rlRes.json() as JsonObject
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

    if (headlessEnabled && ctx.ua && !(await botBypass(ctx.ua, ctx.ip)) && headlessPatterns.some(p => p.test(ctx.ua))) {
      log('headless block:', ctx.ua.slice(0, 40))
      fetch(baseUrl + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteKey: options.siteKey, reason: 'headless' }), signal: AbortSignal.timeout(2000) }).catch(() => {})
      return { block: true, status: blockStatus, contentType: 'text/plain', body: BLOCK_PAGE }
    }

    return null
  }

  return { csp, cspEnabled, ensureValidated, isAllowlisted, isWhitelistedBot, isTrustedBot, evaluate, log,
    isProofValid: isPowValid,
    sgOkCookie(proof: string, ip: string, ua: string): string | null {
      if (!proof || !isPowValid(proof)) return null
      return '__sg_ok=' + sgOkCookieValue(ip, ua) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(POW_OK_TTL_MS / 1000) + (process.env.NODE_ENV === 'production' ? '; Secure' : '')
    }
  }
}
