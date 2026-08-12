import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "src", "render.ts");

interface MockElement {
  style: Record<string, string>;
  id: string;
  innerHTML: string;
  cssText: string;
  appendChild: (child: MockElement) => MockElement;
  parentNode: MockElement | null;
}

type RuntimeGlobal = object | string | number | Function;

function getNoticeJs(): string {
  const src = readFileSync(SRC, "utf-8");
  const i = src.indexOf("const NOTICE_SCRIPT");
  const start = src.indexOf("`", i) + 1;
  const end = src.indexOf("`;", start);
  const content = src.slice(start, end);
  const rendered = new Function("return `" + content + "`")();
  return rendered.replace(/^\s*<script>\s*/, "").replace(/\s*<\/script>\s*$/, "");
}

describe("notice (consentement) — exécution réelle", () => {
  it("le script notice s'exécute sans ReferenceError (desktop + mobile) et enforce() passe", () => {
    const jsStr = getNoticeJs();

    expect(jsStr).toMatch(/_CARD_HTML_DESK=/);
    expect(jsStr).toMatch(/_CARD_HTML_MOB=/);
    expect(/_CARD_HTML(?!_DESK|_MOB)/.test(jsStr)).toBe(false);

    for (const mobile of [false, true]) {
      let resizeCb: (() => void) | null = null;
      function mkEl() {
        const el: MockElement = {
          style: {},
          id: "",
          innerHTML: "",
          cssText: "",
          appendChild: (child: MockElement) => child,
          parentNode: null,
        };
        return el;
      }
      const docEl = mkEl();
      const globals: Record<string, RuntimeGlobal> = {
        window: {
          __sg_mid: "mid", __sg_siteKey: "sk", __sg_baseUrl: "https://site.com/api/v1",
          matchMedia: () => ({ matches: mobile }),
        },
        navigator: {},
        document: { createElement: () => mkEl(), documentElement: docEl, body: mkEl(), getElementById: () => null },
        location: { hostname: "site.com" },
        fetch: () => Promise.resolve({ json: () => Promise.resolve({ acknowledged: true }) }),
        AbortSignal: { timeout: () => ({}) },
        MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; this.takeRecords = () => []; },
        addEventListener: (evt: string, cb: () => void) => { if (evt === "resize") resizeCb = cb; },
        setTimeout: () => 0,
      };
      const keys = Object.keys(globals);
      const vals = keys.map((k) => globals[k]);

      let threw: Error | null = null;
      try {
        const fn = new Function(...keys, jsStr);
        fn(...vals);
        if (typeof resizeCb === "function") resizeCb();
      } catch (e) { threw = e as Error; }
      expect(threw, `erreur runtime (mobile=${mobile}): ${threw?.message ?? ""}`).toBeNull();
    }
  });
});
