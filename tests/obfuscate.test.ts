import { describe, it, expect } from "vitest";
import { applyObfuscation, stripTrace } from "../src/obfuscate";

type EvaluatedValue = string | number | boolean | null | object

function run(code: string): EvaluatedValue {
  const fn = new Function("var out; " + code + "; return out;");
  return fn();
}

describe("obfuscation", () => {
  it("est déterministe pour une graine donnée", () => {
    const src = "(function(){var a='x';out=a})()";
    expect(applyObfuscation(src, "s1")).toBe(applyObfuscation(src, "s1"));
  });

  it("produit un résultat différent pour une graine différente", () => {
    const src = "(function(){var a='x';out=a})()";
    expect(applyObfuscation(src, "s1")).not.toBe(applyObfuscation(src, "s2"));
  });

  it("préserve le comportement : aller-retour des chaînes", () => {
    const cases = [
      "hello",
      "accès refusé",
      "l'apostrophe",
      'le "guillemet"',
      "anti\\slash",
      "retour\nligne",
      "</script>",
      "",
    ];
    for (const s of cases) {
      const src = "(function(){out=" + JSON.stringify(s) + "})()";
      expect(run(applyObfuscation(src, "seed")), `échec pour ${JSON.stringify(s)}`).toBe(s);
    }
  });

  it("neutralise les balises fermantes", () => {
    const out = applyObfuscation("(function(){out='</script>'})()", "seed");
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("</style>");
  });

  it("ne laisse aucun nom de fonction repérable", () => {
    const src = "(function(){function buildOverlay(){return 1}function hex(b){return 2}out=buildOverlay()+hex(0)})()";
    const out = applyObfuscation(src, "seed");
    expect(out).not.toContain("buildOverlay(");
    expect(out).not.toContain("hex(");
    expect(run(out)).toBe(3);
  });

  it("les propriétés calculées restent valides", () => {
    const src = "(function(){var o={'a':1,'b':2};out=o.a+o.b})()";
    expect(run(applyObfuscation(src, "seed"))).toBe(3);
  });
});

describe("retrait du traçage", () => {
  it("retire les appels et les définitions", () => {
    const src = `(function(){
var _SG_TRACE=false;
function _sgErr(ctx,e){if(_SG_TRACE)console.error('[sg] '+(ctx||''),e)}
function _sgLogCP(n){if(_SG_TRACE){try{window.__sg_lastCP=n}catch(e){}}}
_sgLogCP(1);
var a=1;
_sgLogCP(2)
out=a;
})()`;
    const r = stripTrace(src);
    expect(r).not.toContain("_sgLogCP");
    expect(r).not.toContain("_sgErr");
    expect(r).not.toContain("_SG_TRACE");
    expect(r).not.toContain("console.error");
  });

  it("le code reste exécutable après retrait", () => {
    const src = `(function(){
function _sgLogCP(n){}
_sgLogCP(1);
var a=2;
_sgLogCP(2)
out=a*3;
})()`;
    const fn = new Function("var out;" + stripTrace(src) + ";return out;");
    expect(fn()).toBe(6);
  });

  it("aucune trace ne survit à la chaîne complète", () => {
    const src = "(function(){var _SG_TRACE=false;function _sgLogCP(n){}_sgLogCP(1);out=1})()";
    const r = applyObfuscation(src, "seed");
    expect(r).not.toContain("_sgLogCP");
    expect(r).not.toContain("_SG_TRACE");
    expect(r).not.toContain("console");
  });

  it("retire _sgErr avec second argument chaîne vide", () => {
    const src = `(function(){
function _sgErr(ctx,e){}
_sgErr('wl error','');
out=1;
})()`;
    const r = stripTrace(src);
    expect(r).not.toContain("_sgErr");
    expect(r).not.toContain("wl error");
    const fn = new Function("var out;" + r + ";return out;");
    expect(fn()).toBe(1);
  });
});
