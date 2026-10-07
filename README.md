# Shugoi pour Node.js

[![npm version](https://img.shields.io/npm/v/shugoi)](https://www.npmjs.com/package/shugoi)

Middleware de protection Shugoi pour les applications Node.js. Les décisions d’accès restent vérifiées par le serveur Shugoi.

## Installation

```bash
npm install shugoi
```

## Express

```ts
import express from "express";
import { createShugoiMiddleware } from "shugoi";

const app = express();
app.use(createShugoiMiddleware({
  siteKey: process.env.SHUGOI_SITE_KEY!,
  secret: process.env.SHUGOI_SECRET!,
}));

app.get("/", (_req, res) => res.send("Protected page"));
app.listen(3000);
```

## Autres intégrations

Le paquet inclut des adaptateurs pour Node.js générique et Fastify, ainsi qu’une intégration proxy Next.js. Consultez la [documentation Shugoi](https://shugoi.com/docs) pour les exemples et les prérequis de chaque intégration.

## Configuration

Fournissez la clé du site et son secret côté serveur. Gardez le secret dans une variable d’environnement et ne l’envoyez jamais au navigateur.

Les mesures navigateur `[SHUGOI-TIMING]` sont désactivées par défaut. Pour les activer pendant un diagnostic, ajoutez `timingLogs: true` à la configuration du middleware ou de l’intégration Next.js.

Les options disponibles sont déclarées dans [`src/types.ts`](src/types.ts). La configuration par défaut peut évoluer entre versions ; consultez cette référence pour les détails à jour.

## Développement

```bash
npm test
npm run typecheck
npm run build
```

## Licence

MIT
