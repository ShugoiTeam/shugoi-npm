import { describe, it, expect, vi, afterEach } from "vitest";

describe("verifyBotIp", () => {
  afterEach(() => vi.resetModules());

  it("renvoie null pour un UA non robot", async () => {
    const { verifyBotIp } = await import("../src/verify-bot");
    expect(await verifyBotIp("Mozilla/5.0", "1.2.3.4")).toBeNull();
  });

  it("refuse un faux Googlebot dont le PTR ne colle pas", async () => {
    vi.doMock("dns", () => ({ promises: {
      reverse: async () => ["evil.attacker.com"],
      resolve: async () => [], resolve6: async () => [],
    }}));
    const { verifyBotIp } = await import("../src/verify-bot");
    expect(await verifyBotIp("Googlebot/2.1", "6.6.6.6")).toBe(false);
  });

  it("refuse un PTR googlebot.com dont le DNS direct ne revient pas à l'IP", async () => {
    vi.doMock("dns", () => ({ promises: {
      reverse: async () => ["crawl-1.googlebot.com"],
      resolve: async () => ["9.9.9.9"],
      resolve6: async () => [],
    }}));
    const { verifyBotIp } = await import("../src/verify-bot");
    expect(await verifyBotIp("Googlebot/2.1", "6.6.6.6")).toBe(false);
  });

  it("accepte un Googlebot dont l'aller-retour DNS est cohérent", async () => {
    vi.doMock("dns", () => ({ promises: {
      reverse: async () => ["crawl-66-249-66-1.googlebot.com"],
      resolve: async () => ["66.249.66.1"],
      resolve6: async () => [],
    }}));
    const { verifyBotIp } = await import("../src/verify-bot");
    expect(await verifyBotIp("Googlebot/2.1", "66.249.66.1")).toBe(true);
  });
});
