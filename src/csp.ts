export interface CspOptions {
  siteKey: string;
  extraDirectives?: Record<string, string[]>;
  splitRender?: boolean;
  apiOrigin?: string;
}

export function originOf(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.protocol + '//' + u.host;
  } catch { return null; }
}

const SHUGOI_ORIGIN = 'https://shugoi.com';

function baseDirectives(apiOrigin: string): Record<string, string[]> {
  const api = [...new Set([SHUGOI_ORIGIN, apiOrigin].filter(Boolean))];
  return {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...api, 'blob:'],
    'worker-src': ["'self'", 'blob:', ...api],
    'connect-src': ["'self'", ...api],
    'style-src': ["'self'", "'unsafe-inline'", ...api],
    'font-src': ["'self'", ...api, 'data:'],
    'img-src': ["'self'", ...api, 'data:', 'blob:'],
    'frame-ancestors': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
}

export function buildCsp(options: CspOptions): string {
  const apiOrigin = options.apiOrigin ?? SHUGOI_ORIGIN;
  const merged: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(baseDirectives(apiOrigin))) merged[k] = [...v];

  if (options.extraDirectives) {
    for (const [key, values] of Object.entries(options.extraDirectives)) {
      merged[key] = [...new Set([...(merged[key] ?? []), ...values])];
    }
  }

  if (options.splitRender === false && merged['script-src']) {
    merged['script-src'] = merged['script-src'].filter((v) => v !== "'unsafe-eval'");
  }

  return Object.entries(merged)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

export function mergeCsp(existing: string | undefined, added: string): string {
  if (!existing) return added;
  const parse = (s: string): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>();
    for (const part of s.split(';')) {
      const [name, ...vals] = part.trim().split(/\s+/);
      if (!name) continue;
      const set = m.get(name) ?? new Set<string>();
      vals.forEach((v) => set.add(v));
      m.set(name, set);
    }
    return m;
  };
  const base = parse(existing);
  for (const [k, v] of parse(added)) {
    const set = base.get(k) ?? new Set<string>();
    v.forEach((x) => set.add(x));
    base.set(k, set);
  }
  // Spec CSP : le mot-clé 'none' doit être SEUL dans une directive — sinon il est ignoré
  // par le navigateur (warning + comportement ambigu). Lors d'un merge (ex. un site client
  // définit frame-ancestors 'none' et le module ajoute 'self'), on garde uniquement 'none'
  // (le plus restrictif) → CSP toujours valide, quelle que soit la CSP préexistante.
  for (const [, set] of base) {
    if (set.has("'none'") && set.size > 1) {
      set.clear();
      set.add("'none'");
    }
  }
  return [...base.entries()].map(([k, v]) => `${k} ${[...v].join(' ')}`).join('; ');
}
