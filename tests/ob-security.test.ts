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

  it('expose le jeton signé requis par le grant sans exécution dynamique', async () => {
    const token = 'sg_sk_test:' + Date.now() + ':nonce1234:' + 'f'.repeat(64);
    const html = await generateSkeleton('sg_sk_test', token, 'http://api.test/v1', false, [], undefined, 'en');
    expect(html).toContain('window.__sg_token=_D(');
    expect(html).not.toContain('eval(');
  });

  it('le skeleton nettoie les fonctions internes après exécution (_sgCl)', async () => {
    const token = 'sg_sk_test:' + Date.now() + ':nonce1234:' + 'f'.repeat(64);
    const html = await generateSkeleton('sg_sk_test', token, 'http://api.test/v1', false, [], undefined, 'en');
    expect(html).toContain('function _sgCl()');
  });

  it('neutralise les balises fermantes fournies par un guard', async () => {
    const token = 'sg_sk_live_' + 'a'.repeat(40);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ whitelistedMachines: [], detectionFlags: {} }),
      text: async () => 'window.x="</script><script>alert(1)</script>"',
    }));
    const html = await generateSkeleton('sg_sk_live_x', token, 'http://api.test/v1', false, [], undefined, 'en');
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
    expect(html).not.toContain('</script><script>');
  });
});
