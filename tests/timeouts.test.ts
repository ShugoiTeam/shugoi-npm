import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function walk(d: string, o: string[] = []): string[] {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (e.name.endsWith(".ts")) o.push(p);
  }
  return o;
}

describe("tous les fetch Node ont un délai d'expiration", () => {
  it("aucun fetch sans AbortSignal.timeout ni AbortController", () => {
    const bad: string[] = [];
    for (const f of walk(join(__dirname, "..", "src"))) {
      const lines = readFileSync(f, "utf-8").split("\n");
      lines.forEach((l, i) => {
        if (!/\bfetch\(/.test(l)) return;
        if (/fragments\.push|^\s*['"`]/.test(l)) return;
        const block = lines.slice(i, i + 14).join("\n");
        if (!/AbortSignal\.timeout/.test(block) && !/controller\.signal/.test(block) && !/signal:\s*abort/.test(block)) {
          bad.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
