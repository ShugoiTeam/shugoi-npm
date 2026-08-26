import type { JsonObject, ShugoiCoreOptions } from './types'
import { ensureGuardsReady, fetchConfigForSiteKey } from './render'
import { buildCsp, originOf } from './csp'
import { resolveLocale, type Locale, MESSAGES } from './locales'
import { verifyBotIp, VERIFIABLE_BOTS } from './verify-bot'
import { BLOCK_PAGE } from './block-page'
import { safeChallengePath } from './security-utils'
import { createPowNonce, verifyPow } from './pow-utils'
import { ChallengeLimiter } from './challenge-limiter'
import { createOkCookieValue, isAuthorizedCookieValid, isMidAnchorValid, isOkCookieValid } from './cookie-security'
import { ProofReplayStore } from './proof-replay-store'
import type { EvaluateContext } from './evaluate-context'
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

export type EvaluateCtx = EvaluateContext

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
   close(): void;
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
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "12");
    return Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
  })();
  const POW_OK_TTL_MS = 24 * 3600 * 1000;
  const powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || ''

  const POW_TTL_MS = 120_000;

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

   const proofReplayStore = new ProofReplayStore({ ttlMs: POW_TTL_MS })

  const isPowValid = (proof: string): boolean => verifyPow(proof, { secret: powSecret, difficulty: POW_DIFF, ttlMs: POW_TTL_MS })

  const cookieSecurity = { secret: powSecret, okTtlMs: POW_OK_TTL_MS, authorizedTtlMs: 120_000 }
  const sgOkCookieValue = (ip: string, ua: string): string => createOkCookieValue(ip, ua, cookieSecurity)
  const isSgOkValid = (value: string, ip: string, ua: string): boolean => isOkCookieValid(value, ip, ua, cookieSecurity)
  const isSgAuthorizedValid = (value: string): boolean => isAuthorizedCookieValid(value, cookieSecurity)
  const isSgMidAnchorValid = (value: string, ip: string, ua: string, mid: string): boolean => isMidAnchorValid(value, ip, ua, mid, cookieSecurity)

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
// Bots sociaux non vérifiables par reverse DNS : rate-limit par IP.
const LENIENT_WINDOW_MS = 60_000
const LENIENT_MAX_PER_WINDOW = 20
const LENIENT_MAX_IPS = 5_000
const _lenientHits = new Map<string, number[]>()
function lenientBotAllow(ip: string): boolean {
  const now = Date.now()
  if (_lenientHits.size > LENIENT_MAX_IPS && !_lenientHits.has(ip)) {
    let oldestKey: string | null = null
    let oldestAt = Infinity
    for (const [k, v] of _lenientHits) {
      const at = v[0] ?? 0
      if (at < oldestAt) { oldestAt = at; oldestKey = k }
    }
    if (oldestKey) _lenientHits.delete(oldestKey)
  }
  let hits = _lenientHits.get(ip)
  if (!hits) { hits = []; _lenientHits.set(ip, hits) }
  while (hits.length) {
    const first = hits[0]
    if (first === undefined || now - first > LENIENT_WINDOW_MS) hits.shift()
    else break
  }
  if (hits.length >= LENIENT_MAX_PER_WINDOW) return false
  hits.push(now)
  return true
}

  async function botBypass(ua: string, ip: string): Promise<boolean> {
    if (!isWhitelistedBot(ua)) return false
    if (options.logBotIps !== false) {
      console.log('[shugoi] bot_ua ip=' + ip + ' ua=' + String(ua).slice(0, 50))
    }
    if (VERIFIABLE_BOTS.some(p => p.test(ua))) return await isTrustedBot(ua, ip)
    // Bots sociaux non vérifiables par reverse DNS (facebookexternalhit,
    // Twitterbot, LinkedInBot, Slackbot, WhatsApp…) : l'UA seul est falsifiable.
    // Rate-limit par IP — les aperçus de liens légitimes sont bas volume ; le
    // scraping de masse via un UA forgé devient impraticable. Au-delà de la
    // borne, le trafic repasse dans le flux normal (PoW + challenge).
    return lenientBotAllow(ip)
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

    // Ancre serveur : si une ancre __sg_mid_anchor existe (machine déjà vue) et qu'un mid est
    // fourni dans le contexte, tout mid qui ne matche pas l'ancre → block anchor_mismatch.
    // NB : dans le flux actuel, le contexte de navigation (createEvaluateContext) ne transporte
    // JAMAIS de mid (c'est un paramètre de /wlc et /__shugoi/render, traités hors evaluate).
    // La vérification d'ancre réelle est donc faite côté site dans wlCheckHandler ; cette règle
    // est un filet de sécurité si un jour un contexte porte un mid.
    if (ctx.sgMidAnchor && ctx.mid && !isSgMidAnchorValid(ctx.sgMidAnchor, ctx.ip, ctx.ua, ctx.mid)) {
      log('anchor_mismatch:', ctx.ip.slice(0, 24), ctx.mid.slice(0, 8))
      return { block: true, status: 403, contentType: 'text/plain', body: BLOCK_PAGE, headers: {} }
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
var salt=P.get('salt')||'', ts=P.get('ts')||'', nonce=P.get('nonce')||'', diff=parseInt(P.get('diff')||'12',10), path=P.get('path')||'/';
if(path.charAt(0)!=='/'||path.charAt(1)==='/'||path.indexOf('\\\\')>=0)path='/';
var msg=document.createElement('div');msg.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-family:sans-serif;text-align:center;color:#333';msg.innerHTML='<div style="font-size:14px;margin-bottom:8px">V\u00e9rification en cours...</div><div style="font-size:11px;color:#888" id="__sg_pow_progress"></div>';try{document.documentElement.appendChild(msg)}catch(e){}
var enc=(typeof TextEncoder!=='undefined'?new TextEncoder():{encode:function(s){var a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a}});
function bits(d){var l=0;for(var i=0;i<d.length;i++){var b=parseInt(d[i],16);if(b===0){l+=4;continue}l+=(b&8)?0:(b&4)?1:(b&2)?2:3;break}return l}
function sha256hex(s){var K=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];var H=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];var W=new Array(64);function rotr(n,x){return (x>>>n)|(x<<(32-n));}var m=s;var ml=m.length;var len=ml*8;var pad=new Uint8Array(((ml+9+63)>>6<<6));for(var i=0;i<ml;i++)pad[i]=m.charCodeAt(i);pad[ml]=128;var dv=new DataView(pad.buffer);dv.setUint32(pad.length-8,Math.floor(len/0x100000000),false);dv.setUint32(pad.length-4,len,false);for(var i2=0;i2<pad.length;i2+=64){for(var j=0;j<16;j++)W[j]=dv.getUint32(i2+j*4,false);for(var jj=16;jj<64;jj++){var s0=rotr(7,W[jj-15])^rotr(18,W[jj-15])^(W[jj-15]>>>3);var s1=rotr(17,W[jj-2])^rotr(19,W[jj-2])^(W[jj-2]>>>10);W[jj]=(W[jj-16]+s0+W[jj-7]+s1)|0;}var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];for(var j3=0;j3<64;j3++){var S1=rotr(6,e)^rotr(11,e)^rotr(25,e);var ch=(e&f)^(~e&g);var temp1=(h+S1+ch+K[j3]+W[j3])|0;var S0=rotr(2,a)^rotr(13,a)^rotr(22,a);var maj=(a&b)^(a&c)^(b&c);var temp2=(S0+maj)|0;h=g;g=f;f=e;e=(d+temp1)|0;d=c;c=b;b=a;a=(temp1+temp2)|0;}for(var j4=0;j4<8;j4++)H[j4]=(H[j4]+[a,b,c,d,e,f,g,h][j4])|0;}var out="";for(var k=0;k<8;k++)out+=(H[k]>>>0).toString(16).padStart(8,"0");return out;}
var n=0;
function done(h){if(bits(h)>=diff){var base=path;var q=(base.indexOf('?')>=0?'&':'?')+'sg_proof='+ts+':'+nonce+':'+n.toString(16);location.replace(base+q);return true}return false}
function updateProgress(){try{var el=document.getElementById('__sg_pow_progress');if(el)el.textContent=n+' essais...'}catch(e){}}
if(typeof sha256hex==='function'){
  // Pur-JS batché en PRIORITÉ : ~200 hachages/tick sans IPC crypto.subtle
  // (subtle 1-hachage-par-appel ≈ 500/s sur mobile → plusieurs secondes pour diff 12).
  function stepSync(){
    for(var batch=0;batch<200;batch++){
      if(n>=300000){location.reload();return}
      try{var h2=sha256hex(salt+':'+n.toString(16));if(done(h2))return}catch(e){location.reload();return}
      n++;
    }
    updateProgress();
    setTimeout(stepSync,0);
  }
  stepSync();
} else if(typeof crypto!=='undefined'&&crypto.subtle&&crypto.subtle.digest){
  function stepSubtle(){
    if(n>=300000){location.reload();return}
    if(n%500===0)updateProgress();
    crypto.subtle.digest('SHA-256',enc.encode(salt+':'+n.toString(16))).then(function(buf){
      var h=Array.from(new Uint8Array(buf)).map(function(v){return v.toString(16).padStart(2,'0')}).join('');
      if(!done(h)){n++;setTimeout(stepSubtle,0)}
    }).catch(function(){location.reload()});
  }
  stepSubtle();
} else {
  location.reload();
}
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
       const proofFresh = validProof ? proofReplayStore.consume(proof) : false
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
    close(): void {
      challengeLimiter.close()
      proofReplayStore.close()
    },
    isProofValid: isPowValid,
    sgOkCookie(proof: string, ip: string, ua: string): string | null {
      if (!proof || !isPowValid(proof)) return null
      return '__sg_ok=' + sgOkCookieValue(ip, ua) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(POW_OK_TTL_MS / 1000) + (process.env.NODE_ENV === 'production' ? '; Secure' : '')
    }
  }
}
