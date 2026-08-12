# Architecture du SDK Node

- `core.ts` orchestre l’évaluation et produit des décisions indépendantes d’Express.
- `middleware.ts` adapte ces décisions aux runtimes Express et Fastify.
- `render.ts` gère les tokens, les grants et le rendu différé.
- `csp.ts`, `obfuscate.ts` et `scripts.ts` sont des services de transformation isolés.
- `next/` contient uniquement l’adaptation Next.js.
- `tests/` couvre les invariants de sécurité, de rendu et de compatibilité.

Le contrat public est limité aux exports de `src/index.ts`. Les caches sont bornés et les accès réseau sont centralisés afin de réduire les allocations et les requêtes répétées.
