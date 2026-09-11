import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWhitelistForSiteKey, fetchConfigForSiteKey, injectGuardScripts, __clearConfigCache } from "../src/render";

interface ConfigFetchResponse {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<{ whitelistedMachines: string[]; detectionFlags: { enableRateLimit: boolean } }>;
}

describe("cache de configuration", () => {
  let calls: string[];
  beforeEach(() => {
    __clearConfigCache();
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      const response: ConfigFetchResponse = {
        ok: true,
        text: async () => "(function(){})()",
        json: async () => ({ whitelistedMachines: ["a".repeat(64)], detectionFlags: { enableRateLimit: false } }),
      };
      return response;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("un rendu HTML ne provoque au plus qu'UN appel à /whitelist", async () => {
    await injectGuardScripts("<html><head></head><body>x</body></html>", "sg_sk_live_t", "http://api.test/v1");
    const wl = calls.filter((u) => u.includes("/whitelist"));
    expect(wl.length).toBeLessThanOrEqual(1);
  });

  it("deux rendus successifs ne rappellent pas /whitelist (cache)", async () => {
    await injectGuardScripts("<html><head></head><body>1</body></html>", "sg_sk_live_t", "http://api.test/v1");
    const after1 = calls.filter((u) => u.includes("/whitelist")).length;
    await injectGuardScripts("<html><head></head><body>2</body></html>", "sg_sk_live_t", "http://api.test/v1");
    const after2 = calls.filter((u) => u.includes("/whitelist")).length;
    expect(after2).toBe(after1);
  });

  it("aucune URL de whitelist ne contient de casse-cache", async () => {
    await fetchWhitelistForSiteKey("sg_sk_live_t", "http://api.test/v1");
    expect(calls.filter((u) => u.includes("/whitelist") && u.includes("&_="))).toEqual([]);
  });

  it("un échec réseau ne rejette pas et renvoie une valeur utilisable", async () => {
    __clearConfigCache();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    await expect(fetchConfigForSiteKey("sg_sk_live_t", "http://api.test/v1")).resolves.toEqual({});
  });

  it("pendant une panne d'API, evaluate() ne relance pas un fetch par requête", async () => {
    __clearConfigCache();
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { n++; throw new Error("down"); }));
    const { createCore } = await import("../src/core");
    const core = createCore({ siteKey: "sg_sk_live_t", signingSecret: "test-secret-32bytes-long!", baseUrl: "http://api.test/v1" });
    for (let i = 0; i < 20; i++) {
      await core.evaluate({ path: "/x", ua: "Mozilla/5.0", ip: "1.2.3.4", acceptLanguage: "fr", secFetchDest: "document" });
    }
    expect(n).toBeLessThan(20);
  });
});
