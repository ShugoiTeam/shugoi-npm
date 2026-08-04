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
  sgAuthorized?: string;
  forwardedPrefix?: string;
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
  // Audit #6 : difficulté configurable (SHUGOKI_POW_DIFF) au lieu d'une valeur en dur
  // à 10. Le défaut remonte à 12 (4× plus dur que 10) tout en restant imperceptible à
  // l'UX (~1-2k itérations crypto.subtle). Doit rester SYNCHRONE avec render.ts
  // (generateSkeleton → __sg_pow.difficulty) et whitelist.ts côté site.
  const POW_DIFF = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "14");
    return Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
  })();
  const POW_OK_TTL_MS = 30 * 24 * 3600 * 1000; // cookie __sg_ok valable 30 jours
  const powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || ''

  // ═══ Fenêtre de validité d'une preuve PoW (audit 2026-08-03 #7 : rejeu) ═══
  // Une preuve `sg_proof=ts:nonce` est acceptée si |now - ts| <= POW_TTL_MS. 120 s
  // laissait une fenêtre de rejeu confortable ; 60 s suffit pour une navigation
  // humaine (le solve est < 1 s) et réduit la durée de vie d'une preuve volée/rejouée.
  const POW_TTL_MS = 60_000;

  // ═══ Anti-scraping : rate-limit de l'émission du challenge (audit #6) ═══
  // Le 307 anti-curl est STATELESS : sans limite, un script résout 20 challenges en
  // série gratuitement (constaté par l'audit externe). On borne par IP :
  //   - SHUGOKI_CHALLENGE_LIMIT = nombre max de challenges par fenêtre (défaut 60)
  //   - SHUGOKI_CHALLENGE_WINDOW = fenêtre en secondes (défaut 60)
  // Un SPA légitime déclenche 1-3 challenges par session (navigations full-page),
  // 60/min ne le pénalise pas ; un scraper qui bourrine est freiné puis bloqué 429.
  const CHALLENGE_LIMIT = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_LIMIT || "60");
    return Number.isInteger(raw) && raw > 0 ? raw : 60;
  })();
  const CHALLENGE_WINDOW_MS = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_WINDOW || "60");
    return Number.isInteger(raw) && raw > 0 ? raw * 1000 : 60_000;
  })();
  const CHALLENGE_MAX_BLOCK_MS = 15 * 60 * 1000; // plafond du blocage progressif
  const _challengeLimits = new Map<string, { count: number; windowStart: number; blockedUntil: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of _challengeLimits) {
      if (now > e.blockedUntil && now - e.windowStart > CHALLENGE_WINDOW_MS * 2) _challengeLimits.delete(k);
    }
  }, CHALLENGE_WINDOW_MS).unref();

  // Retourne true si le challenge peut être émis pour cette IP. Au-delà du quota,
  // un backoff exponentiel (2^n minutes, plafonné) s'applique : un scraper est
  // ralenti à l'infini, un humain ne le ressent jamais (blocage ≥ 2^12 min).
  function allowChallenge(ip: string): boolean {
    if (!ip || ip === 'unknown') return true;
    const now = Date.now();
    let e = _challengeLimits.get(ip);
    if (!e || now - e.windowStart >= CHALLENGE_WINDOW_MS) {
      _challengeLimits.set(ip, { count: 1, windowStart: now, blockedUntil: 0 });
      return true;
    }
    e.count++;
    if (e.blockedUntil > now) return false;
    if (e.count > CHALLENGE_LIMIT) {
      const backoffMs = Math.min(60_000 * Math.pow(2, Math.min(e.count - CHALLENGE_LIMIT, 10)), CHALLENGE_MAX_BLOCK_MS);
      e.blockedUntil = now + backoffMs;
      e.count = 0;
      return false;
    }
    return true;
  }

  // ═══ Preuve PoW single-use (audit round 16, R2) ═══
  // Une preuve `sg_proof=ts:n` résolue ne doit servir QU'UNE fois (par IP) : sinon un
  // script résout une fois (0.07s à diff=12) et mint des cookies sur tous les chemins.
  // Clé = ip + ':' + proof ; entrées purgées après POW_TTL_MS (même fenêtre que la preuve).
  const _usedProofs = new Map<string, number>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of _usedProofs) {
      if (now - t > POW_TTL_MS) _usedProofs.delete(k);
    }
  }, POW_TTL_MS).unref();
  function consumeProof(proof: string, ip: string): boolean {
    const key = (ip || '0') + ':' + proof;
    if (_usedProofs.has(key)) return false;
    _usedProofs.set(key, Date.now());
    return true;
  }

  // ═══ Sanitisation du `path` du challenge (audit #5 : open redirect) ═══
  // Le `path` reflété dans l'URL du challenge finit dans un `location.replace()` côté
  // client. Un `//evil.com` (protocole-relatif) ou un backslash (`\evil.com`, traité
  // comme `/` par certains navigateurs) détournent la redirection vers un domaine
  // externe. On n'accepte qu'un chemin relatif commençant par UN SEUL `/`.
  function safeChallengePath(p: string): string {
    if (!p) return '/';
    if (p.charAt(0) !== '/' || p.charAt(1) === '/' || p.indexOf('\\') >= 0) return '/';
    for (let i = 0; i < p.length; i++) {
      const c = p.charCodeAt(i);
      if (c < 0x20 || c === 0x7f) return '/';
    }
    return p;
  }

  function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    const ba = Buffer.from(a, 'utf8')
    const bb = Buffer.from(b, 'utf8')
    return crypto.timingSafeEqual(ba, bb)
  }

  // ═══ Forteresse : sel RANDOM par challenge (nonce) + preuve ts:nonce:solution ═══
  // L'ancien sel HMAC(secret, ts) était DÉTERMINISTE par seconde : le même sel pour
  // tous les visiteurs de la seconde → un adversaire pouvait précalculer un lot de
  // solutions et les rejouer via une botnet/rotation d'IP (la preuve single-use ne
  // protège que d'un rejeu SAME-IP). Chaque challenge reçoit désormais un nonce
  // aléatoire 64 bits : la preuve `ts:nonce:solution` est liée à SA challenge, la
  // précomputation par lots devient impossible (chaque sollicitation = nouveau sel).
  function sgNonce(): string {
    return crypto.randomBytes(8).toString('hex')
  }

  // Bucket d'IP (sans ':' pour rester parseable dans le cookie). IPv4 → /24 (3 octets),
  // IPv6 → 4 hextets. Une rotation d'IP dans le même sous-réseau garde le cookie valide.
  function ipBucket(ip: string): string {
    if (!ip || ip === 'unknown') return '0'
    if (ip.includes('.')) {
      const m = ip.match(/^(\d+\.\d+\.\d+)(?:\.\d+)?$/)
      if (m) return m[1]
      return '0'
    }
    if (ip.includes(':')) {
      const segs = ip.split(':').filter(Boolean)
      return segs.slice(0, 4).join('.') || '0'
    }
    return '0'
  }

  // Empreinte UA (16 hex) — un changement de navigateur invalide le cookie → re-challenge.
  function uaFp(ua: string): string {
    return crypto.createHash('sha256').update(ua || '').digest('hex').slice(0, 16)
  }

  function isPowValid(proof: string): boolean {
    if (!proof || !powSecret) return false
    const parts = proof.split(':')
    if (parts.length !== 3) return false
    const [tsStr, nonce, sol] = parts
    if (!tsStr || !nonce || !sol) return false
    if (!/^[0-9a-f]{16}$/.test(nonce)) return false
    const ts = parseInt(tsStr, 10)
    if (isNaN(ts) || Math.abs(Date.now() - ts * 1000) > POW_TTL_MS) return false
    const salt = crypto.createHmac('sha256', powSecret).update(tsStr + ':' + nonce).digest('hex')
    const digest = crypto.createHash('sha256').update(salt + ':' + sol).digest('hex')
    // Vérifie POW_DIFFICULTY bits à zéro en tête (en hex, chaque nibble = 4 bits).
    // Audit 2026-08-03 : comptage CORRIGÉ — l'ancienne version sous-comptait les zéros
    // internes du premier nibble non-nul (`3` → '11' → 0 au lieu de 2), ce qui rendait
    // la difficulté effective ~2^12.5 au lieu de 2^14. Le comptage ci-dessous est exact
    // et DOIT rester synchrone avec render.ts (challenge JS), whitelist.ts et le guard.
    let leading = 0
    for (let i = 0; i < digest.length; i++) {
      const nib = parseInt(digest[i], 16)
      if (nib === 0) { leading += 4; continue }
      leading += (nib & 8) ? 0 : (nib & 4) ? 1 : (nib & 2) ? 2 : 3
      break
    }
    return leading >= POW_DIFF
  }

  // Forteresse : le cookie __sg_ok est lié au bucket IP + empreinte UA. Un cookie
  // volé/soustrait n'est plus rejouable depuis une autre IP (ou un autre navigateur) —
  // la signature inclut ipBucket + uaFp. Format : ts:ipBucket:uaFp:sig.
  function sgOkCookieValue(ip: string, ua: string): string {
    const ts = Math.floor(Date.now() / 1000)
    const bucket = ipBucket(ip)
    const fp = uaFp(ua)
    const sig = crypto.createHmac('sha256', powSecret).update('sg_ok:' + ts + ':' + bucket + ':' + fp).digest('hex')
    return ts + ':' + bucket + ':' + fp + ':' + sig
  }

  function isSgOkValid(cookieVal: string, ip: string, ua: string): boolean {
    if (!powSecret) return false
    const parts = cookieVal.split(':')
    if (parts.length !== 4) return false
    const [tsStr, bucket, fp, sig] = parts
    if (!tsStr || !bucket || !fp || !sig) return false
    const ts = parseInt(tsStr, 10)
    if (isNaN(ts) || Date.now() - ts * 1000 > POW_OK_TTL_MS || ts * 1000 > Date.now() + 60000) return false
    // Lier au bucket IP + UA courants : un cookie d'une autre IP/UA → invalide.
    if (bucket !== ipBucket(ip) || fp !== uaFp(ua)) return false
    const expected = crypto.createHmac('sha256', powSecret).update('sg_ok:' + tsStr + ':' + bucket + ':' + fp).digest('hex')
    return safeEqual(sig, expected)
  }

  // Cookie __sg_authorized posé par handleRender après un render réussi (grant valide).
  // Protège les assets à contenu (/assets/*.js, *.css) : sans lui, le bundle JS est
  // téléchargeable publiquement → extraction du contenu. TTL court (120s).
  const SG_AUTHORIZED_TTL_MS = 120_000;
  function isSgAuthorizedValid(cookieVal: string): boolean {
    if (!powSecret) return false
    const sep = cookieVal.indexOf(':')
    if (sep <= 0) return false
    const tsStr = cookieVal.slice(0, sep)
    const sig = cookieVal.slice(sep + 1)
    const ts = parseInt(tsStr, 10)
    if (isNaN(ts) || Date.now() - ts * 1000 > SG_AUTHORIZED_TTL_MS || ts * 1000 > Date.now() + 60000) return false
    const expected = crypto.createHmac('sha256', powSecret).update('sg_authorized:' + tsStr).digest('hex')
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

    // ═══ Protection des assets à contenu (/assets/*.js, *.css) ═══
    // Le bundle SPA contient les textes/structure de la page. Servi publiquement, il
    // permet d'extraire tout le contenu sans passer la whitelist (audit). On exige donc
    // le cookie __sg_authorized (posé par handleRender après un render réussi) pour le
    // télécharger. Un curl direct / un non-validé reçoit le tableau BLOCKED.
    // NB : on vérifie AVANT isAllowlisted (les assets sont allowlistés pour le split-render).
    if (/\/assets\/[^?#]+\.(js|css)(\?|$)/.test(ctx.path)) {
      const authOk = !!ctx.sgAuthorized && isSgAuthorizedValid(ctx.sgAuthorized)
      if (!authOk) {
        log('asset protégé refusé:', ctx.path.slice(0, 60))
        return { block: true, status: 403, contentType: 'text/plain', body: BLOCK_PAGE, headers: {} }
      }
    }

    if (isAllowlisted(ctx.path)) return null

    // ═══ Route du challenge JS (suit le 307 anti-curl) ═══
    // Le navigateur arrive ici après le 307. Body : le tableau ASCII dans un COMMENTAIRE
    // HTML (<!-- -->) — le view-source le montre, mais le navigateur ne le peint PAS :
    // pas de flash pendant la résolution PoW. Le JS de résolution est INLINE (économise
    // un aller-retour réseau : pas de <script src> externe → chargement plus rapide).
    if (ctx.path === '/__sg_challenge') {
      // Anti-scraping (audit #6) : la page de challenge est aussi bornée par IP —
      // un script peut la requêter directement sans passer par le 307.
      if (!allowChallenge(ctx.ip)) {
        const loc = resolveLocale(undefined, ctx.acceptLanguage)
        const lmsgs = MESSAGES[loc]
        return { block: true, status: 429, contentType: 'text/html', body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody('1 min'), lmsgs.rateLimitBadge, ctx.host || '', 60, loc) }
      }
      const js = `(function(){
var P=new URLSearchParams(location.search);
var salt=P.get('salt')||'', ts=P.get('ts')||'', nonce=P.get('nonce')||'', diff=parseInt(P.get('diff')||'14',10), path=P.get('path')||'/';
// Open redirect (audit #5) : un //evil.com (protocole-relatif) ou un backslash
// détourneraient le location.replace ci-dessous vers un domaine externe. On n'accepte
// qu'un chemin relatif commençant par UN SEUL '/', sans backslash ni contrôle.
if(path.charAt(0)!=='/'||path.charAt(1)==='/'||path.indexOf('\\\\')>=0)path='/';
var enc=new TextEncoder();
// Audit 2026-08-03 : comptage de bits CORRIGÉ (zéros internes du premier nibble
// non-nul comptés) — DOIT rester synchrone avec isPowValid serveur + guard + whitelist.
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

    // ═══ Pre-flight PoW challenge (anti-curl/view-source) ═══
    // Un 307 dont le corps est UNIQUEMENT le tableau ASCII : curl le voit en clair,
    // le navigateur suit la redirection vers /__sg_challenge (le JS qui résout le PoW).
    // Le challenge s'applique à TOUTE page sans sg_proof valide — même un navigateur avec
    // cookie : le view-source (qui n'exécute pas le JS) voit donc toujours le tableau.
    // Aucune exclusion d'extension : le catch-all SPA renvoie index.html pour TOUT chemin
    // (y compris /index.js, /app.js, /__shugoi.js) → ils doivent être challengés aussi,
    // sinon un curl les obtient sans PoW (fallback skeleton). Les vrais assets statiques
    // (/assets/*, /robots.txt...) sont allowlisted et ne passent pas par ici.
    const isPage = !ctx.path.includes('/__shugoi/') && !ctx.path.startsWith('/api/')

    if (isPage && powSecret && ctx.ua) {
      const proof = ctx.sgProof || ''
      const validProof = !!proof && isPowValid(proof)
      // Re-audit (résidu #3) : un cookie __sg_ok valide (HMAC serveur, 30 j) saute le
      // pre-flight PoW. Il est posé APRÈS une première résolution réussie (middleware).
      // Bénéfices :
      //   - UX : 1 PoW par navigateur/30 j au lieu d'un par chargement de page ;
      //   - anti-DoS NAT : un IP partagé (entreprise/VPN) ne consomme plus le quota de
      //     challenge à chaque utilisateur — seuls les visiteurs sans cookie challengent.
      // Un script doit de toute façon résoudre le PoW une première fois pour obtenir le
      // cookie, puis le vrai verrou reste le render-grant (wlc + raw + mid).
      const validCookie = !!ctx.sgOk && isSgOkValid(ctx.sgOk, ctx.ip, ctx.ua)
      // Round 16 (R2) : la preuve est SINGLE-USE (par IP). Une seule résolution ne doit
      // pas permettre de mint des cookies sur plusieurs chemins/sessions. Une preuve
      // valide est CONSOMMÉE à sa 1re utilisation ; un rejeu (sans cookie) → 307.
      const proofFresh = validProof ? consumeProof(proof, ctx.ip) : false
      const canProceed = validCookie || proofFresh
      if (!canProceed) {
        // Anti-scraping (audit #6) : on refuse d'émettre le challenge à un IP qui
        // bourrine (solve en série). 429 shield au lieu du 307 — un humain ne le
        // ressent jamais (quota 60/fenêtre), un scraper est ralenti indéfiniment.
        if (!allowChallenge(ctx.ip)) {
          const loc = resolveLocale(undefined, ctx.acceptLanguage)
          const lmsgs = MESSAGES[loc]
          log('challenge rate-limited:', ctx.ip.slice(0, 24), ctx.ua.slice(0, 40))
          return { block: true, status: 429, contentType: 'text/html', body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody('1 min'), lmsgs.rateLimitBadge, ctx.host || '', 60, loc) }
        }
        // 307 vers le challenge : body = tableau ASCII SEUL (curl le voit tel quel).
        // Le navigateur suit la redirection → /__sg_challenge?ts=&salt=&diff=&path=
        // Le prefix X-Forwarded-Prefix (ex. /express derrière un reverse proxy) est
        // préfixé pour que la redirection reste dans le sous-chemin de la démo.
        const tsNow = Math.floor(Date.now() / 1000)
        // Forteresse : sel RANDOM par requête (nonce 64 bits) — plus de sel déterministe
        // par seconde (précomputation par lots impossible). La preuve devient ts:nonce:n.
        const nonce = sgNonce()
        const salt = crypto.createHmac('sha256', powSecret).update(tsNow + ':' + nonce).digest('hex')
        const prefix = ctx.forwardedPrefix && ctx.forwardedPrefix !== '/' ? ctx.forwardedPrefix.replace(/\/$/, '') : ''
        // Sanitisation open redirect (audit #5) : on ne reflète jamais un path brut.
        const path = safeChallengePath(ctx.path.startsWith('/') ? ctx.path : '/' + ctx.path)
        const chalUrl = prefix + '/__sg_challenge?ts=' + tsNow + '&salt=' + salt + '&nonce=' + nonce + '&diff=' + POW_DIFF + '&path=' + encodeURIComponent(prefix + path)
        log('pow challenge (307):', ctx.ua.slice(0, 40))
        return { block: true, status: 307, contentType: 'text/plain', body: BLOCK_PAGE, headers: { Location: chalUrl } }
      }
      // sgProof valide → on laisse passer (le middleware posera le cookie).
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
    sgOkCookie(proof: string, ip: string, ua: string): string | null {
      if (!proof || !isPowValid(proof)) return null
      return '__sg_ok=' + sgOkCookieValue(ip, ua) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(POW_OK_TTL_MS / 1000) + (process.env.NODE_ENV === 'production' ? '; Secure' : '')
    }
  }
}
