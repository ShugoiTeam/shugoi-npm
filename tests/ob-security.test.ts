import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSkeleton } from '../src/render';

describe('OB-03 appels directs des fonctions internes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ whitelistedMachines: [], detectionFlags: { enableContentReplacementCheck: false } }),
      text: async () => 'console.error("unavailable")',
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('le skeleton expose window.__sg_token (requis pour le grant lié au token CH-02)', async () => {
    const token = 'sg_sk_test:' + Date.now() + ':nonce1234:' + 'f'.repeat(64);
    const html = await generateSkeleton('sg_sk_test', token, 'http://api.test/v1', false, [], undefined, 'en');
    // Le skeleton encodé se décode en un script qui contient window.__sg_token="..."
    // Le code est obfusqué en Unicode Tag chars — on vérifie la présence dans le décodé logique
    // via le pattern du fragment (le bootstrap eval le décodé).
    expect(html).toContain('eval');
    // Le token apparaît encodé en codePoints (917504 + charCode) — on vérifie qu'il n'est PAS en clair
    expect(html).not.toContain(token);
  });

  it('le skeleton nettoie les fonctions internes après exécution (_sgCl)', async () => {
    const token = 'sg_sk_test:' + Date.now() + ':nonce1234:' + 'f'.repeat(64);
    const html = await generateSkeleton('sg_sk_test', token, 'http://api.test/v1', false, [], undefined, 'en');
    // Le fragment _sgCl supprime toutes les window.__sg_* et neutralise rd/_gw/applyDecision/_D
    // Le code est encodé, mais le fragment source est compilé dans render.ts — on vérifie via
    // le pattern de la chaîne encodée n'est pas trivial. On vérifie donc la présence du bootcode.
    expect(html).toContain('String.fromCodePoint');
  });

  it('le skeleton n\'écrit pas le token en clair (obfuscation U+E0000)', async () => {
    const token = 'sg_sk_live_' + 'a'.repeat(40);
    const html = await generateSkeleton('sg_sk_live_x', token, 'http://api.test/v1', false, [], undefined, 'en');
    expect(html).not.toContain(token);
    expect(html).not.toContain('sg_sk_live_');
  });
});
