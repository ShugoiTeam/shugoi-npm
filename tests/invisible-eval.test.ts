import { describe, it, expect } from "vitest";
import { applyInvisibleEval, applyBootObfuscation, isValidJs } from "../src/obfuscate";

const SHIFT = 0xe0000;

function execInvisible(src: string, seed: string): Record<string, unknown> {
  const obf = applyBootObfuscation(src, seed);
  const wrapped = applyInvisibleEval(obf, seed);
  const sandbox: Record<string, unknown> = {
    setTimeout: () => 0,
    fetch: async () => ({}),
    JSON, Object, String, Math, Date, console, Promise,
    document: {}, location: {}, history: {}, navigator: {}, screen: {}, performance: {},
    crypto: {}, encodeURIComponent, decodeURIComponent, TextEncoder, Uint8Array,
    AbortSignal: {}, Error, RegExp, Array, Number, Boolean, Blob, URL,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  };
  (sandbox as Record<string, unknown>).window = sandbox;
  new Function("window", wrapped)(sandbox);
  return sandbox;
}

describe("applyInvisibleEval", () => {
  it("produit du JS valide (isValidJs)", () => {
    const src = "window.x='ok';var t='tok';";
    const wrapped = applyInvisibleEval(applyBootObfuscation(src, "seed"), "seed");
    expect(isValidJs(wrapped)).toBe(true);
  });

  it("décode et exécute le code original dans une VM (eval direct)", () => {
    const src = "window.x='ok';window.__sg_siteKey='sk';";
    const sandbox = execInvisible(src, "seed-vm");
    expect(sandbox.x).toBe("ok");
    expect(sandbox.__sg_siteKey).toBe("sk");
  });

  it("exécute du code avec strings/regex obfusquées par applyBootObfuscation", () => {
    const src =
      "function enc(v){return String(v).replace(/=+$/,'').split('').reverse().join('')}window.__enc=enc('shugoi.com')";
    const sandbox = execInvisible(src, "seed-regex");
    expect(sandbox.__enc).toBe("moc.ioguhs");
  });

  it("rotation : deux seeds donnent des wrappers différents, même seed identique", () => {
    const src = "window.x='ok';var t='tok';";
    const obf = applyBootObfuscation(src, "seed");
    expect(applyInvisibleEval(obf, "s1")).toBe(applyInvisibleEval(obf, "s1"));
    expect(applyInvisibleEval(obf, "s1")).not.toBe(applyInvisibleEval(obf, "s2"));
    expect(applyInvisibleEval(obf, "seed")).not.toBe(applyInvisibleEval(obf, "seed-other"));
  });

  it("le code encodé ne contient AUCUN caractère ASCII imprimable (tous > U+E0000)", () => {
    const src = "window.x='ok';var t='tok';var q=\"<script></script>\";";
    const obf = applyBootObfuscation(src, "seed-invisible");
    const wrapped = applyInvisibleEval(obf, "seed-invisible");
    // toutes les string literals simples du wrapper = la charge encodée
    const literals = [...wrapped.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThan(0);
    const joined = literals.join("");
    for (const ch of joined) {
      expect(ch.codePointAt(0)!).toBeGreaterThan(SHIFT);
    }
    // le décodage (décalage inverse) restitue exactement le code obfusqué
    const decoded = [...joined].map((ch) => String.fromCodePoint(ch.codePointAt(0)! - SHIFT)).join("");
    expect(decoded).toBe(obf);
  });

  it("le wrapper appelle eval() et décode via String.fromCodePoint", () => {
    const wrapped = applyInvisibleEval("window.x='ok';", "seed-eval");
    expect(wrapped).toMatch(/\beval\(/);
    expect(wrapped).toContain("String.fromCodePoint");
    expect(wrapped).toContain("codePointAt(0)");
  });

  it("aucune séquence </script> dans le wrapper ni le payload encodé", () => {
    const src = "window.x='</script><script>' + '</style>';";
    const obf = applyBootObfuscation(src, "seed-closing");
    const wrapped = applyInvisibleEval(obf, "seed-closing");
    expect(obf).not.toMatch(/<\/script/); // déjà neutralisé par escapeClosingTags
    expect(wrapped).not.toContain("</script>");
    expect(wrapped).not.toContain("</style>");
    const sandbox = execInvisible(src, "seed-closing");
    expect(sandbox.x).toBe("</script><script></style>");
  });

  it("gros payload réaliste (type bootcode prod) : valide, invisible et exécutable", () => {
    // reproduit la taille/le contenu du rawBootCode de generateSkeleton :
    // accents, backslashes, <, >, ' " et fonctions de boot.
    const src =
      "window.__sg_siteKey='sg_sk_live_abc';window.__sg_baseUrl='https://shugoi.com/v1';" +
      "window.__sg_config={enableDevtoolsCheck:true,enableContentReplacementCheck:true};" +
      "window.__sg_pow={ts:123,nonce:'a\\'b\"c\\n',salt:'<salt>',difficulty:14};" +
      "window.__sg_ntp=1234567;window.__sg_serverTime=1234567;" +
      "var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};" +
      "function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);" +
      "var _g=(window.__sg_grant||\"\");if(_g){p=p+(\"&grant=\"+encodeURIComponent(_g))}fetch(p).then(function(x){return x.json()})}" +
      "var msg='Vérifiez que vous êtes un humain. Cette page est protégée contre les bots.';" +
      "window.__sg_showBlock=function(m,t,b){document.open(\"text/html\");document.write('<div>'+m+'</div>');document.close()};" +
      "window.__sg_guardsReady=true;_gw(function(){rd('./__shugoi/render?token=abc',0);window.__sg_done='OK'})";
    const seed = "variant-seed-::e0";
    const obf = applyBootObfuscation(src, seed);
    const wrapped = applyInvisibleEval(obf, seed);
    expect(isValidJs(wrapped)).toBe(true);
    expect(wrapped).not.toContain("</script>");
    // la charge encodée est entièrement > U+E0000
    const literals = [...wrapped.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!);
    const joined = literals.join("");
    for (const ch of joined) expect(ch.codePointAt(0)!).toBeGreaterThan(SHIFT);
    const sandbox = execInvisible(src, seed);
    expect(sandbox.__sg_done).toBe("OK");
    expect(sandbox.__sg_siteKey).toBe("sg_sk_live_abc");
  });
});