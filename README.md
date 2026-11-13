# ⚡ HelpDesk Express

**Le ticketing IT traçable et inaltérable.**
Outil de support informatique pour PME et ESN, bâti sur l'**Event Sourcing** : chaque action est un
événement immuable, scellé par une chaîne d'empreintes SHA-256. Rien n'est jamais écrasé ni effacé.

![Tableau de bord](docs/screenshots/dashboard.png)

## Documents

| Document | Lien |
|---|---|
| Stack technique et architecture (PDF) | [`docs/presentations/HelpDesk-Express-Stack-technique.pdf`](docs/presentations/HelpDesk-Express-Stack-technique.pdf) · [version Canva](https://canva.link/czzaffl6xzz04r9) |
| Plan de tests | [`docs/PLAN_DE_TESTS.md`](docs/PLAN_DE_TESTS.md) |
| Captures d'écran | [`docs/screenshots/`](docs/screenshots) |

## Démarrage rapide

```bash
npm install
npm run seed      # données de démonstration réalistes (21 tickets sur 14 jours)
npm run dev       # API http://localhost:3001  +  interface http://localhost:5173
```

| Commande | Rôle |
|---|---|
| `npm run dev` | API tRPC + front Vite en mode développement |
| `npm run seed -- --force` | Réinitialise le journal avec les données de démo |
| `npm test` | 139 tests unitaires, d'intégration, d'architecture et de composants |
| `npm run test:e2e` | 20 scénarios de bout en bout Playwright (Chromium) |
| `npm run test:all` | Types + tous les tests |
| `npm run test:coverage` | Rapport de couverture |
| `npm run build` | Build de production |

## Fonctionnalités

| | |
|---|---|
| **Tableau de bord** | Tickets en file, SLA dépassés, non assignés, temps moyen de résolution, tendance 14 jours, taux de respect des SLA, charge par agent, tickets à traiter en priorité |
| **Tickets** | Vues enregistrées (En file, Mes tickets, Non assignés, SLA en danger…), recherche sans accents, filtres, tris, références lisibles `HD-0001` |
| **Kanban** | Glisser-déposer entre statuts, confirmation avant fermeture, cartes verrouillées une fois fermées |
| **Fiche ticket** | Édition en place, assignation, catégorie, priorité, étiquettes, conversation (réponses + notes internes), SLA |
| **Voyage dans le temps** | Curseur pour revoir l'état exact du ticket à n'importe quelle version (rejeu des événements côté navigateur) |
| **Journal d'audit** | Flux brut de l'Event Store, diff avant → après, acteur, empreinte SHA-256, **vérification d'intégrité**, export CSV / JSON |
| **SLA** | Haute 4 h · Moyenne 24 h · Basse 72 h ; statuts dans les temps / à risque / dépassé / respecté / manqué |
| **UX** | Palette de commandes `Ctrl+K`, raccourcis `N` (nouveau ticket) et `/` (recherche), thème clair/sombre, mobile, mises à jour en temps réel, notifications |
| **Traçabilité** | Chaque action est attribuée à un agent (sélecteur en bas de la barre latérale) |

## Règles métier

- Création : titre obligatoire (≤ 120 car.), priorité `LOW | MEDIUM | HIGH`, catégorie, demandeur (vous par défaut), étiquettes normalisées.
- Un ticket **`CLOSED` ou supprimé ne peut plus être modifié**, assigné ni commenté.
- Une modification sans effet est refusée (pas d'événement « vide »).
- Suppression **logique** (`TicketDeleted`) : le ticket quitte les vues actives, son historique reste.
- Un ticket `RESOLVED` peut être rouvert ; la date de résolution est alors effacée.
- Deux modifications simultanées du même ticket : la seconde est rejetée (verrou optimiste).

## Architecture

```
src/
├── domain/          Cœur métier pur — 0 dépendance (vérifié par test)
│   ├── result.ts                Result<E, A> : erreurs métier = valeurs
│   └── ticket/
│       ├── types.ts             Value objects, commandes, événements, état, erreurs
│       ├── decide.ts            decide(state, command, now) → events | error
│       ├── evolve.ts            evolve(state, event) → state ; rehydrate = replay
│       ├── sla.ts               computeSla(ticket, now)
│       ├── projections.ts       projectTickets / projectActiveTickets
│       └── dashboard.ts         computeDashboard(events, now)
├── application/     Use cases + ports — dépend uniquement du domaine
│   ├── ports.ts                 EventStoreRepository, Clock, IdGenerator
│   ├── commands.ts              create / update / assign / comment / delete
│   ├── queries.ts               list / byId / dashboard / audit / integrity
│   └── auditLog.ts              projection d'audit avec diff
├── infrastructure/  Détails techniques interchangeables
│   ├── eventStore/              mémoire, fichier JSONL append-only, chaîne SHA-256
│   ├── trpc/router.ts           validation zod, mapping erreurs → HTTP
│   ├── config/team.ts           équipe support
│   ├── scripts/seed.ts          données de démo (via les vrais use cases)
│   └── server.ts                composition root
└── ui/              React — n'importe de l'infrastructure que des TYPES
    ├── lib/                     client tRPC, hooks TanStack Query, filtres, formatage, CSV
    ├── components/              Layout, palette Ctrl+K, badges, graphiques SVG, modales
    └── pages/                   Dashboard, Tickets, Kanban, Fiche, Audit
```

**Flux d'une commande** : `React → tRPC (zod + acteur) → use case → readStream → rehydrate → decide (pur) → append (verrou optimiste + hash) → invalidation des projections`.

**Intégrité** : `hash = SHA256(hashPrécédent + JSON canonique de l'événement)`. Modifier, supprimer ou réordonner
une ligne de `data/events.jsonl` rompt la chaîne ; le journal d'audit l'affiche (« Altération détectée ! »).

## Qualité

- **159 tests automatisés**, 97 % de couverture du code métier, 100 % du domaine.
- Plan de tests détaillé (identifiants, scénarios Given/When/Then, traçabilité exigences) : [`docs/PLAN_DE_TESTS.md`](docs/PLAN_DE_TESTS.md).

## Stack

TypeScript strict · Node.js · tRPC v11 · zod · React 18 · React Router · TanStack Query · Vite · Lucide ·
Vitest · Testing Library · Playwright.

## Feuille de route (version SaaS)

Event Store PostgreSQL / EventStoreDB · authentification SSO (OIDC, Azure AD) · notifications WebSocket ·
multi-tenant · snapshots pour gros volumes · e-mail entrant → ticket · intégrations Teams / Slack.
