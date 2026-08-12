import { promises as dns } from 'dns';

const BOT_DOMAINS: Array<{ pattern: RegExp; suffixes: string[] }> = [
  { pattern: /Googlebot|Google-InspectionTool|Storebot-Google/i, suffixes: ['.googlebot.com', '.google.com'] },
  { pattern: /Bingbot|adidxbot|BingPreview/i, suffixes: ['.search.msn.com'] },
  { pattern: /Slurp/i, suffixes: ['.crawl.yahoo.net'] },
  { pattern: /DuckDuckBot/i, suffixes: ['.duckduckgo.com'] },
  { pattern: /YandexBot/i, suffixes: ['.yandex.ru', '.yandex.net', '.yandex.com'] },
  { pattern: /Applebot/i, suffixes: ['.applebot.apple.com'] },
  { pattern: /Discordbot/i, suffixes: ['.discord.gg', '.discord.com', '.discordapp.com'] },
];

export const VERIFIABLE_BOTS: RegExp[] = BOT_DOMAINS.map((b) => b.pattern);

const VERIFY_TTL = 3_600_000;
const MAX_ENTRIES = 5_000;
const _cache = new Map<string, { ok: boolean; at: number }>();

export async function verifyBotIp(ua: string, ip: string): Promise<boolean | null> {
  const entry = BOT_DOMAINS.find((b) => b.pattern.test(ua));
  if (!entry) return null;
  if (!ip || ip === 'unknown') return false;

  const key = ip + '|' + entry.suffixes[0];
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < VERIFY_TTL) return hit.ok;

  let ok = false;
  try {
    const names = await dns.reverse(ip);
    const name = names.find((n) => entry.suffixes.some((s) => n.toLowerCase().endsWith(s)));
    if (name) {
      const forward = await dns.resolve(name).catch(() => [] as string[]);
      const forward6 = await dns.resolve6(name).catch(() => [] as string[]);
      ok = forward.includes(ip) || forward6.includes(ip);
    }
  } catch { ok = false; }

  if (_cache.size >= MAX_ENTRIES) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) _cache.delete(oldest[0]);
  }
  _cache.set(key, { ok, at: Date.now() });
  return ok;
}
