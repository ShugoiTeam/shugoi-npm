export type Locale = 'fr' | 'en';

export const MESSAGES = {
  fr: {
    rateLimitTitle: 'Trop de requêtes',
    rateLimitBody: (t: string) => `Vous avez effectué trop de requêtes en peu de temps. Il reste ${t} avant de pouvoir réessayer.`,
    rateLimitBadge: 'Rate Limit',
    blockedTitle: 'Accès bloqué',
    blockedBadge: 'Blocage',
    tamperTitle: 'Remplacement de contenu client détecté',
    tamperBody: "Nous avons remarqué que vous avez tenté de modifier manuellement le rendu client côté navigateur via les DevTools. Cette pratique est évidemment bloquée par nos services.",
    devtoolsBody: "L'utilisation des DevTools pour remplacer le contenu ou modifier les requêtes réseau a été détectée. L'intégrité de la page est protégée et toute altération est immédiatement bloquée.",
    fakeBrowserTitle: 'Requête non navigateur',
    fakeBrowserBody: "Votre requête ne provient pas d'un navigateur standard. Utilisez un navigateur (Chrome, Firefox, Safari, Edge) pour accéder à ce site.",
    fakeBrowserBadge: 'Accès restreint',
    retryInSeconds: (s: number) => `Il reste ${s}s avant de pouvoir réessayer.`,
  },
  en: {
    rateLimitTitle: 'Too Many Requests',
    rateLimitBody: (t: string) => `You have made too many requests in a short time. ${t} remaining before you can try again.`,
    rateLimitBadge: 'Rate Limit',
    blockedTitle: 'Access Blocked',
    blockedBadge: 'Blocked',
    tamperTitle: 'Client Content Replacement Detected',
    tamperBody: "We noticed you attempted to manually modify the client-side rendering via DevTools. This practice is obviously blocked by our services.",
    devtoolsBody: "Using DevTools to replace content or modify network requests has been detected. Page integrity is protected and any alteration is immediately blocked.",
    fakeBrowserTitle: 'Non-browser request',
    fakeBrowserBody: 'Your request did not come from a standard browser. Please use a browser (Chrome, Firefox, Safari, Edge) to access this site.',
    fakeBrowserBadge: 'Restricted access',
    retryInSeconds: (s: number) => `Retry in ${s}s.`,
  },
} as const;

export function resolveLocale(explicit: Locale | undefined, acceptLanguage?: string): Locale {
  if (explicit) return explicit;
  if (acceptLanguage && /^fr\b|,\s*fr\b/i.test(acceptLanguage)) return 'fr';
  return 'en';
}
