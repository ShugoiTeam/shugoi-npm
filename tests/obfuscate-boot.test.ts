import { describe, it, expect } from "vitest";
import { applyBootObfuscation, isValidJs } from "../src/obfuscate";

function execBoot(src: string, seed: string): Record<string, unknown> {
  const out = applyBootObfuscation(src, seed);
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
  const fn = new Function("window", out);
  fn(sandbox);
  return sandbox;
}

describe("applyBootObfuscation", () => {
  it("produit du JS valide et diffère l'exécution via _q", () => {
    const src =
      "window.__sg_siteKey='sk';window.__sg_baseUrl='https://x/v1';var t='tok';" +
      "var _gw=function(cb){cb()};function rd(p,n){window.out=p+'?'+t}var r='./r';" +
      "_gw(function(){rd(r,0)})";
    const out = applyBootObfuscation(src, "seed-123");
    expect(isValidJs(out)).toBe(true);
    expect(out).toContain("=[];");
  });

  it("préserve la sémantique (exécution dans une VM)", () => {
    const src =
      "window.__sg_siteKey='sk';window.__sg_baseUrl='https://x/v1';var t='tok';" +
      "var _gw=function(cb){cb()};function rd(p,n){window.out=p+'?'+t}var r='./r';" +
      "_gw(function(){rd(r,0)})";
    const sandbox = execBoot(src, "seed-999");
    expect(sandbox.out).toBe("./r?tok");
    expect(sandbox.__sg_siteKey).toBe("sk");
  });

  it("rotaté : deux seeds donnent des sorties différentes, même seed identique", () => {
    const src =
      "var t='tok';var _gw=function(cb){cb()};function rd(p,n){window.out=p+'?'+t}" +
      "_gw(function(){rd('./r',0)})";
    expect(applyBootObfuscation(src, "s1")).toBe(applyBootObfuscation(src, "s1"));
    expect(applyBootObfuscation(src, "s1")).not.toBe(applyBootObfuscation(src, "s2"));
  });

  it("le décodeur et nav ont des NOMS et POSITIONS différents par seed", () => {
    const src =
      "window.__sg_siteKey='sk';var _gw=function(cb){cb()};function rd(p,n){window.out=p}" +
      "_gw(function(){rd('./r')})";
    const a = applyBootObfuscation(src, "s1");
    const b = applyBootObfuscation(src, "s2");
    const m1 = a.match(/var (_\w+)=Object\.create\(null\),(_\w+)=function/);
    const m2 = b.match(/var (_\w+)=Object\.create\(null\),(_\w+)=function/);
    expect(m1?.[1]).not.toBe(m2?.[1]);
    expect(m1?.[2]).not.toBe(m2?.[2]);
    // position du décodeur différente
    expect(a.indexOf("Object.create(null)")).not.toBe(b.indexOf("Object.create(null)"));
  });

  it("nav masque l'usage direct des propriétés navigateur", () => {
    const src =
      "var _gw=function(cb){cb()};function rd(p,n){fetch(p).then(function(x){return x.json()})}" +
      "_gw(function(){rd('./r',0)})";
    const out = applyBootObfuscation(src, "seed");
    // plus d'appel direct `fetch(` : il est routé via nav[dec("...")]
    expect(out).not.toMatch(/(?<!\.)\bfetch\(/);
    expect(out).toMatch(/\[_\w+\(\"/); // nav[dec("enc")] pattern
  });

  it("hash les propriétés de TOUS les objets (config, R, window.__sg_*)", () => {
    const src =
      "var _bXJwJIg=window.__sg_config||{};var _NhFQkyv=_bXJwJIg.enableTorCheck!==false;" +
      "window.__sg_blocked=_NhFQkyv;var R={platform:'x'};window.__sg_plat=R.platform";
    const out = applyBootObfuscation(src, "seed-hashprops");
    // plus de `.enableTorCheck` ni `.platform` ni `.__sg_blocked` en clair
    expect(out).not.toMatch(/\.enableTorCheck/);
    expect(out).not.toMatch(/\.platform/);
    expect(out).not.toMatch(/\.__sg_blocked/);
    expect(out).toMatch(/\[_\w+\(\"/); // [dec("enc")] pattern
  });
});

describe("applyBootObfuscation — natives appelées via nav (Illegal invocation)", () => {
  it("setTimeout via nav est appelé (0, fn)(...) sans Illegal invocation", () => {
    const src =
      "var _gw=function(cb){cb()};function rd(p,n){setTimeout(function(){window.out='SET'},0)}" +
      "var r='./r';_gw(function(){rd(r,0)})";
    const out = applyBootObfuscation(src, "seed-illegal");
    const win: Record<string, unknown> = {};
    win.window = win;
    win.console = console;
    let called = false;
    const origSetTimeout = globalThis.setTimeout;
    (globalThis as Record<string, unknown>).setTimeout = (fn: () => void) => {
      called = true;
      fn();
      return 0;
    };
    try {
      new Function("window", out)(win);
      expect(called).toBe(true);
      expect(win.out).toBe("SET");
    } finally {
      (globalThis as Record<string, unknown>).setTimeout = origSetTimeout;
    }
  });

  it("btoa(unescape(encodeURIComponent(...))) reste fonctionnel (mid du guard)", () => {
    // reproduit l'encodage du mid du guard : btoa(unescape(encodeURIComponent(v)))
    // puis reverse. unescape/escape doivent rester des globaux appelables.
    const src =
      "function enc(v){try{return btoa(unescape(encodeURIComponent(String(v)))).replace(/=+$/,'').split('').reverse().join('')}catch(e){return 'ERR:'+e}}window.__enc=enc('shugoi.com')";
    const out = applyBootObfuscation(src, "seed-unescape");
    expect(out).not.toBe(src);
    const win: Record<string, unknown> = {
      console,
      btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),
      atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
      unescape: (s: string) => s,
      escape: (s: string) => s,
      encodeURIComponent,
      String,
    };
    win.window = win;
    win.globalThis = win;
    new Function("window", out)(win);
    // shugoi.com → base64 "c2h1Z29pLmNvbQ==" sans '=' → reverse
    expect(win.__enc).toBe("QbvNmLp92Z1h2c");
  });

  it("parseInt/parseFloat sont seedés dans nav (pow du guard)", () => {
    // la vérification de bits du pow utilise parseInt(hex,16) → routé via
    // (0, nav[dec("parseInt")])(...). Il DOIT être seedé dans nav sinon
    // (0, undefined)() → pow vide → hasPow:false → pow_required.
    const src =
      "function bits(h){var b=0;for(var i=0;i<h.length;i++){var n=parseInt(h[i],16);if(n===0){b+=4;continue}b+=n&8?0:n&4?1:n&2?2:3;break}return b}window.__bits=bits('0534c72b')";
    const out = applyBootObfuscation(src, "seed-parseint");
    const win: Record<string, unknown> = { console, parseInt, parseFloat };
    win.window = win;
    win.globalThis = win;
    win.crypto = {} as unknown;
    win.TextEncoder = globalThis.TextEncoder as unknown;
    win.Uint8Array = Uint8Array as unknown;
    new Function("window", out)(win);
    expect(win.__bits).toBe(5); // 0x0 (4 bits) + 0x5 (1 bit) = 5 bits
  });
});
