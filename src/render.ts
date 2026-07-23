import crypto from "node:crypto";

interface TokenEntry {
  html: string;
  consumed: boolean;
  createdAt: number;
}

interface GuardCache {
  detect: string;
  guard: string;
}

const _tokenStore = new Map<string, TokenEntry>();
const _consumedTokens = new Set<string>();
let _guardCache: GuardCache = { detect: "", guard: "" };
let _cachePromise: Promise<void> | null = null;

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _tokenStore) {
    if (now - val.createdAt > 30000) _tokenStore.delete(key);
  }
  for (const key of _consumedTokens) {
    const ts = parseInt(key.split(":")[1] || "0", 10);
    if (now - ts > 60000) _consumedTokens.delete(key);
  }
}, 10000).unref();

async function fetchGuardScripts(baseUrl: string, siteKey?: string): Promise<void> {
  if (_cachePromise) return _cachePromise;
  const sk = siteKey || "cache";
  _cachePromise = (async () => {
    try {
      const cb = Date.now();
      const [dRes, gRes] = await Promise.all([
        fetch(`${baseUrl}/guard-detect?key=${sk}&cb=${cb}`),
        fetch(`${baseUrl}/guard?key=${sk}&cb=${cb}`),
      ]);
      _guardCache = {
        detect: await dRes.text(),
        guard: await gRes.text(),
      };
    } catch {
      // Keep previous cache on failure
    }
  })();
  return _cachePromise;
}

export async function ensureGuardsFetched(baseUrl: string, siteKey?: string): Promise<void> {
  await fetchGuardScripts(baseUrl, siteKey);
}

export function signToken(
  siteKey: string,
  timestamp: number,
  secretOverride?: string
): { token: string } {
  const secret =
    secretOverride ||
    process.env.SHUGOKI_SIGNING_SECRET ||
    process.env.SHUGOKI_SECRET ||
    "dev-secret-do-not-use-in-prod";
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return { token: payload + ":" + sig };
}

export function storeHtml(token: string, html: string): void {
  _tokenStore.set(token, {
    html,
    consumed: false,
    createdAt: Date.now(),
  });
}

export interface RenderResponse {
  html?: string;
  blocked?: boolean;
  reason?: string;
  message?: string;
  title?: string;
  error?: string;
}

export function renderResponseData(token: string): RenderResponse {
  const entry = _tokenStore.get(token);
  if (!entry) {
    const parts = token.split(":");
    if (parts.length === 4 && !_consumedTokens.has(token)) {
      return {
        blocked: true,
        reason: "manual_modification",
        message:
          "Remplacement de contenu client détecté. L'intégrité de la page est protégée.",
        title: "Remplacement de contenu client détecté",
      };
    }
    return { error: "not_found" };
  }
  if (entry.consumed) return { error: "not_found" };
  entry.consumed = true;
  _consumedTokens.add(token);
  return { html: entry.html };
}

export function renderResponseJson(token: string): string {
  return JSON.stringify(renderResponseData(token));
}

export function generateSkeleton(
  siteKey: string,
  token: string,
  baseUrl: string,
  whitelist?: string[],
  restrictedAccess?: boolean,
  renderUrl?: string
): string {
  const rurl = renderUrl || './__shugoi/render';

  const fragments: string[] = [];
  if (whitelist) fragments.push('window.__sg_whitelist=' + JSON.stringify(whitelist));
  if (!restrictedAccess) fragments.push('window.__sg_disableRestrictedAccess=true');
  if (_guardCache.detect) fragments.push('try{' + _guardCache.detect + '}catch(e){window.__sg_blocked=true}');
  if (_guardCache.guard) fragments.push('try{' + _guardCache.guard + '}catch(e){window.__sg_blocked=true}');
  fragments.push('window.__sg_showBlock=function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><link href=https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap rel=stylesheet><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:Alex Brush,cursive;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon.png class=l><img src=https://shugoi.com/brand.png class=b><div class=bdg>"+(badge||"Blocage")+"</div><h2>"+(title||"Acces bloque")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push('var t="' + token + '"');
  fragments.push('var k="' + siteKey + '"');
  fragments.push('var b="' + baseUrl + '"');
  fragments.push('var r="' + rurl + '"');
  fragments.push('function rd(p,n){if(n>6){window.__sg_showBlock&&window.__sg_showBlock("L\\u0027utilisation des Devtools pour remplacer le contenu ou modifier les requ\\u00eates r\\u00e9seau a \\u00e9t\\u00e9 d\\u00e9tect\\u00e9e. L\\u0027int\\u00e9grit\\u00e9 de la page est prot\\u00e9g\\u00e9e et toute alt\\u00e9ration est imm\\u00e9diatement bloqu\\u00e9e. Eh oui ! On le d\\u00e9tecte aussi.","Remplacement de contenu client d\\u00e9tect\\u00e9");return}fetch(p).then(function(x){return x.json()}).then(function(d){if(d.html){document.body.innerHTML=d.html;var q=document.querySelectorAll("body script");for(var i=0;i<q.length;i++)q[i].remove()}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('if(!window.__sg_blocked){rd(r+"?token="+t,0)}');

  const combinedCode = fragments.join(';');
  let encStr = '';
  for (let i = 0; i < combinedCode.length; i++) {
    encStr += String.fromCodePoint(917504 + combinedCode.charCodeAt(i));
  }

  const bootCode = "eval([...'" + encStr + "'].map(x=>String.fromCodePoint(x.codePointAt(0)-917504)).join(''))";
  return '<script>' + bootCode + '</script>';
}

export function handleRender(token: string, res: any): void {
  const data = renderResponseData(token);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader("Content-Type", "application/json");
  if (res.send) res.send(json);
  else if (res.end) res.end(json);
}

export function injectAndStore(
  html: string,
  siteKey: string,
  baseUrl: string,
  whitelist?: string[],
  restrictedAccess?: boolean,
  signingSecret?: string,
  renderUrl?: string
): string {
  const ts = Date.now();
  const signed = signToken(siteKey, ts, signingSecret);
  storeHtml(signed.token, html);
  return generateSkeleton(
    siteKey,
    signed.token,
    baseUrl,
    whitelist,
    restrictedAccess,
    renderUrl
  );
}
