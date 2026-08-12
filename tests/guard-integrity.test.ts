import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyObfuscation } from "../src/obfuscate";

const GUARD_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../shugoi-platform/shugoi.com/scripts",
);
const SOURCES = ["guard.src.js", "guard-detect.src.js"];

function isParseable(code: string): { ok: boolean; error?: string } {
  try { new Function(code); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e) }; }
}

const available = SOURCES.every((f) => existsSync(join(GUARD_DIR, f)));

describe.skipIf(!available)("intégrité des guards", () => {
  for (const file of SOURCES) {
    const src = readFileSync(join(GUARD_DIR, file), "utf-8");

    it(`${file} : la source est du JavaScript valide`, () => {
      const r = isParseable(src);
      expect(r.ok, r.error).toBe(true);
    });

    const seeds = ["a", "zzz", "1", "999999", Date.now().toString(36), "0", "ffff"];
    for (const seed of seeds) {
      it(`${file} : l'obfuscation reste valide avec la graine "${seed}"`, () => {
        const out = applyObfuscation(src, seed);
        const r = isParseable(out);
        expect(r.ok, `graine ${seed} : ${r.error}\n---\n${out.slice(0, 600)}`).toBe(true);
      });
    }

    it(`${file} : l'obfuscation ne laisse aucun marqueur de développement`, () => {
      const out = applyObfuscation(src, "seed");
      for (const marker of ["_sgLogCP", "_SG_TRACE", "_sgErr", "debugger", "TODO", "FIXME"]) {
        expect(out, `marqueur "${marker}" présent`).not.toContain(marker);
      }
    });

    it(`${file} : l'obfuscation ne laisse aucune balise fermante brute`, () => {
      const out = applyObfuscation(src, "seed");
      expect(out).not.toMatch(/<\/script/i);
      expect(out).not.toMatch(/<\/style/i);
    });

    it(`${file} : aucun secret ni clé de production`, () => {
      expect(src).not.toMatch(/sg_sk_(live|test)_[A-Za-z0-9]/);
      expect(src).not.toMatch(/sk_(live|test)_/);
      expect(src).not.toMatch(/[A-Fa-f0-9]{64}/);
    });

    it(`${file} : n'écrit pas de données sensibles dans le stockage du navigateur`, () => {
      expect(src).not.toContain("sessionStorage");
      expect(src).not.toContain("document.cookie");
    });
  }
});
