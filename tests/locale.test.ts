import { describe, it, expect, vi } from 'vitest';
import { resolveLocale } from '../src/locales';

describe('resolveLocale', () => {
  it('defaults to en when no hint', () => {
    expect(resolveLocale(undefined, undefined)).toBe('en');
  });

  it('detects French from Accept-Language', () => {
    expect(resolveLocale(undefined, 'fr-FR,en;q=0.9')).toBe('fr');
    expect(resolveLocale(undefined, 'en-US,fr;q=0.8')).toBe('fr');
  });

  it('defaults to en for non-French Accept-Language', () => {
    expect(resolveLocale(undefined, 'en-US,en;q=0.9')).toBe('en');
    expect(resolveLocale(undefined, 'de-DE')).toBe('en');
  });

  it('respects explicit locale override', () => {
    expect(resolveLocale('fr', 'en-US')).toBe('fr');
    expect(resolveLocale('en', 'fr-FR')).toBe('en');
  });
});

describe("page de blocage injectée", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('guard-detect') || url.includes('guard?')) {
        return Promise.resolve({ ok: true, text: async () => '(function(){})()' });
      }
      return Promise.resolve({ ok: true, json: async () => ({ whitelistedMachines: [], detectionFlags: {} }) });
    });
  });

  it("ne contient aucun texte français en dur non accentué", async () => {
    const { generateSkeleton } = await import("../src/render");
    const html = await generateSkeleton("k", "t".repeat(40), "http://api.test/v1", false, [], undefined, "en");
    expect(html).not.toContain("Acces bloque");
  });

  it("utilise les messages de la locale demandée", async () => {
    const { generateSkeleton } = await import("../src/render");
    const fr = await generateSkeleton("k", "t".repeat(40), "http://api.test/v1", false, [], undefined, "fr");
    const en = await generateSkeleton("k", "t".repeat(40), "http://api.test/v1", false, [], undefined, "en");
    expect(fr).not.toBe(en);
  });

  it("survit à un message contenant un guillemet double", async () => {
    const { generateSkeleton, __clearConfigCache } = await import("../src/render");
    const { MESSAGES } = await import("../src/locales");
    __clearConfigCache();
    const englishMessages = MESSAGES.en;
    const saved = englishMessages.tamperTitle;
    englishMessages.tamperTitle = 'He said "stop"';
    try {
      const html = await generateSkeleton("k", "t".repeat(40), "http://api.test/v1", false, [], undefined, "en");
      expect(html.startsWith("<script>")).toBe(true);
      expect(html.endsWith("</script>")).toBe(true);
    } finally { englishMessages.tamperTitle = saved; }
  });
});
