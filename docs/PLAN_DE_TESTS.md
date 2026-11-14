# Plan de tests – HelpDesk Express

**217 tests automatisés** (187 Vitest + 30 Playwright) · couverture du code métier > 95 % (100 % du domaine)

| Niveau | Outil | Fichiers | Tests | Commande |
|---|---|---|---|---|
| Unitaires – domaine (tickets, SLA, accès, identité) | Vitest | `tests/unit/domain/*` | 81 | `npm test` |
| Unitaires – application (tickets, identité, portail) | Vitest | `tests/unit/application/*` | 29 | `npm test` |
| Architecture | Vitest | `tests/architecture.test.ts` | 4 | `npm test` |
| Intégration – Event Store & intégrité | Vitest | `tests/integration/eventStore.test.ts` | 16 | `npm test` |
| Intégration – sécurité (scrypt, sessions, cookies, anti-force brute, annuaire) | Vitest | `tests/integration/security.test.ts` | 8 | `npm test` |
| Intégration – API tRPC (back-office, authentification, rôles, portail) | Vitest | `tests/integration/api.test.ts` | 23 | `npm test` |
| Interface – logique | Vitest | `tests/ui/logic.test.ts` | 17 | `npm test` |
| Interface – composants React | Vitest + Testing Library (jsdom) | `tests/ui/components.test.tsx` | 9 | `npm test` |
| Bout en bout | Playwright (Chromium) | `e2e/*.spec.ts` | 30 | `npm run test:e2e` |

Les tests de bout en bout démarrent un serveur dédié (ports 3101 / 5174) sur un dossier de données jetable,
préalablement rempli par `npm run seed -- --force` (comptes et tickets de démonstration).

`npm run test:all` enchaîne vérification de types, tests unitaires/intégration et E2E.
`npm run test:coverage` produit le rapport de couverture.

Chaque scénario porte un identifiant repris dans le nom du test (ex. `DOM-U04`) : la traçabilité exigence → test est directe.

---

## 1. Règles métier – `decide` (domaine)

| ID | Scénario (Given / When / Then) | Exigence |
|---|---|---|
| DOM-C01 | Aucun ticket / Créer avec titre, description, étiquettes à normaliser / `TicketCreated` avec champs nettoyés, demandeur = acteur | UC1 |
| DOM-C02 | Aucun ticket / Créer avec demandeur explicite / demandeur conservé | UC1 |
| DOM-C03 | Aucun ticket / Créer avec titre vide, titre > 120, description > 5000, priorité ou catégorie inconnue, > 10 étiquettes, étiquette > 30, demandeur > 120 / `VALIDATION` (8 cas) | UC1 |
| DOM-C04 | Titre de 120 caractères exactement / accepté (valeur limite) | UC1 |
| DOM-C05 | Ticket existant (actif ou supprimé) / Recréer le même ID / `TICKET_ALREADY_EXISTS` | UC1 |
| DOM-U01 | Ticket ouvert / Modifier statut + priorité identique / seul le statut est dans l'événement | UC2 |
| DOM-U02 | Ticket ouvert / Modifier titre, description, catégorie, étiquettes / valeurs normalisées | UC2 |
| DOM-U03 | Ticket ouvert / Modification vide ou identique / `NO_CHANGES` (aucun événement inutile) | UC2 |
| DOM-U04 | Ticket **CLOSED** / Modifier / `TICKET_CLOSED` | UC2 – règle « fermé non modifiable » |
| DOM-U05 | Ticket **supprimé** / Modifier / `TICKET_DELETED` | UC2 – règle « supprimé non modifiable » |
| DOM-U06 | Aucun ticket / Modifier / `TICKET_NOT_FOUND` | UC2 |
| DOM-U07 | Statut inconnu, priorité inconnue, titre vide / `VALIDATION` | UC2 |
| DOM-U08 | Enchaînement OPEN → RESOLVED → OPEN → IN_PROGRESS → CLOSED / toutes acceptées | UC2 – cycle de vie |
| DOM-A01..A04 | Assignation, désassignation, réassignation identique refusée, refus si fermé/supprimé | Assignation |
| DOM-M01..M03 | Commentaire / note interne, vide ou trop long refusé, autorisé si RESOLVED, refusé si CLOSED | Conversation |
| DOM-D01 | Ticket actif (même CLOSED) / Supprimer / `TicketDeleted` | UC3 |
| DOM-D02 | Double suppression / ticket inexistant / refus | UC3 |
| DOM-P01 | Même état + même commande + même instant ⇒ même résultat | Pureté |

## 2. Rejeu de l'état – `evolve` / `rehydrate`

| ID | Scénario |
|---|---|
| EVO-01 | `TicketCreated` ⇒ ticket OPEN, version 1, non assigné |
| EVO-02 | Rejeu de 5 événements hétérogènes ⇒ état courant exact |
| EVO-03 | `resolvedAt` posé à RESOLVED, conservé à CLOSED, effacé à la réouverture |
| EVO-04 | Changer la priorité n'altère pas `resolvedAt` |
| EVO-05 | `TicketDeleted` ⇒ état `Deleted` (données, date, auteur conservés) |
| EVO-06 | Événement sur ticket inexistant / supprimé ignoré (robustesse) |
| EVO-07 | Pureté : ni l'état ni l'événement ne sont mutés (objets gelés) |
| EVO-08 | Rétro-compatibilité : ancien format d'événement relu avec valeurs par défaut |

## 3. SLA

| ID | Scénario |
|---|---|
| SLA-01 | Cibles HIGH 4 h / MEDIUM 24 h / LOW 72 h, échéance calculée |
| SLA-02 | 7 cas limites : dans les temps, à risque (< 25 %), pile à l'échéance, dépassé |
| SLA-03 | Temps restant négatif après échéance |
| SLA-04 | Résolu à temps ⇒ `MET`, figé même consulté plus tard |
| SLA-05 | Résolu en retard ⇒ `MISSED` |

## 4. Projections (lecture)

| ID | Scénario |
|---|---|
| PRJ-01 | Références HD-0001… stables selon l'ordre de création |
| PRJ-02 | Projection globale inclut les supprimés (marqués) |
| PRJ-03 | Vue active : supprimés exclus, tri par dernière activité (UC4) |
| PRJ-04 | SLA calculé à l'instant demandé |
| PRJ-05 | Regroupement par flux, ordre préservé |
| PRJ-06 | Journal vide ⇒ projection vide |
| DSH-01..07 | Tableau de bord : totaux, répartitions, temps moyen, taux SLA, charge par agent, tendance 14 j, priorités, cas sans résolution |

## 5. Use cases (application)

| ID | Scénario |
|---|---|
| APP-01 | Création attribuée à l'acteur, état renvoyé |
| APP-02 | Création + assignation = 2 événements distincts |
| APP-03 | **Commande refusée ⇒ aucun événement écrit** |
| APP-04 | Cycle complet assigner → commenter → résoudre → fermer (version 5) |
| APP-05 | Ticket fermé : modification, assignation et commentaire refusés, journal inchangé |
| APP-06 | Suppression logique : absent de la vue active, flux conservé (UC3) |
| APP-07 | Identifiants de commentaires uniques |
| APP-08 | Conflit de concurrence remonté sans écriture |
| APP-09 | Version attendue transmise à l'Event Store |
| APP-10 | Horloge injectée ⇒ dates déterministes |
| APP-11 | **Deux modifications simultanées : une seule réussit** (verrou optimiste) |
| QRY-01..02 | Détail d'un ticket avec historique complet ; ID inconnu |
| QRY-03 | Audit chronologique, attribué, chaîné (UC5) |
| QRY-04 | Audit : diff « avant → après » pour chaque type d'événement |
| QRY-05 | Audit trié même si le support renvoie le désordre |
| QRY-06 | Tableau de bord recalculé selon l'horloge (SLA qui expire) |
| QRY-07 | Vérification d'intégrité |

## 6. Infrastructure & sécurité

| ID | Scénario |
|---|---|
| INF-01 | Positions globales et versions de flux croissantes |
| INF-02 | Verrou optimiste : version incorrecte ⇒ `CONCURRENCY_CONFLICT` |
| INF-03 | 50 écritures concurrentes sérialisées sans perte, chaîne valide |
| INF-04 | Événements stockés gelés (toute mutation lève `TypeError`) |
| INF-05 | Copie défensive des événements fournis |
| INF-06 | Le port n'expose aucune opération de modification/suppression |
| INT-01 | Premier événement chaîné au bloc de genèse |
| INT-02 | Journal vide / intact ⇒ valide + sceau de tête |
| INT-03 | **Altération d'un contenu détectée à la bonne position** |
| INT-04 | **Suppression ou réorganisation d'événements détectée** |
| INT-05 | Sérialisation canonique indépendante de l'ordre des clés |
| JSL-01 | Fichier JSONL : création du dossier, une ligne par événement, rejeu au redémarrage |
| JSL-02 | Fichier jamais réécrit (append-only vérifié octet par octet) |
| JSL-03 | **Modification manuelle du fichier détectée au redémarrage** |
| JSL-04 | Lignes vides et fins de ligne Windows tolérées |
| JSL-05 | Accents, guillemets, emoji préservés et intégrité valide |

### Contrôle d'accès et identité (domaine + application)

| ID | Scénario |
|---|---|
| ACC-01 | Rôles : seuls AGENT et ADMIN appartiennent à la DSI ; seul ADMIN administre |
| ACC-02 | **Un employé ne voit que les tickets dont il est le demandeur** (lien par identifiant, pas par nom) |
| ACC-03 | La DSI voit tous les tickets |
| ACC-04 | **Les notes internes sont retirées de la vue demandeur** |
| ACC-05 | Actions du demandeur par statut : répondre ; confirmer / rouvrir seulement si RÉSOLU ; rien si FERMÉ |
| IDN-01..03 | Validation d'un compte (normalisation e-mail, rôle, longueurs) et politique de mot de passe |
| ID-01 | Authentification : succès, mauvais mot de passe, compte inconnu (même erreur) |
| ID-02 | **Compte désactivé : connexion refusée et session existante invalidée** |
| ID-03 | Mot de passe jamais stocké en clair (empreinte scrypt), jamais renvoyé par l'API |
| ID-04 | Réinitialisation par l'admin, changement par l'utilisateur (ancien mot de passe exigé) |
| ID-05 | **Un administrateur ne peut ni se rétrograder ni se désactiver** |
| ID-06 | Recherche d'un collaborateur par nom insensible à la casse |
| POR-01 | La demande est rattachée au compte de l'employé, qui en est l'auteur |
| POR-02 | **Isolation : chaque employé ne liste et n'ouvre que ses demandes** |
| POR-03 | Un ticket supprimé disparaît du portail |
| POR-04 | Réouverture uniquement après résolution, motif obligatoire publié dans la conversation |
| POR-05 | Aucune action possible sur la demande d'un collègue |

### Sécurité technique

| ID | Scénario |
|---|---|
| SEC-01 | scrypt : bon mot de passe accepté, variantes refusées, sel unique |
| SEC-02 | Jeton de session émis puis reconnu |
| SEC-03 | **Jeton falsifié (identifiant usurpé), autre secret ou jeton malformé ⇒ rejeté** |
| SEC-04 | Jeton expiré ⇒ rejeté |
| SEC-05 | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS, effacement par `Max-Age=0` |
| SEC-06 | Limitation des tentatives : blocage après N échecs, levée après la fenêtre ou un succès |
| USR-01 | Annuaire JSON : persistance au redémarrage, écriture atomique, e-mail insensible à la casse |
| USR-02 | Annuaire : objets renvoyés par copie |

## 7. API tRPC

| ID | Scénario |
|---|---|
| API-01 | Valeurs par défaut + **acteur = utilisateur authentifié** |
| API-02 | Validation de forme zod ⇒ `BAD_REQUEST` |
| API-03 | Erreur métier ⇒ message français + `domainCode` |
| API-04 | Ticket inconnu ⇒ 404 ; fermé / supprimé ⇒ 412 |
| API-05 | Parcours multi-agents complet visible dans détail, audit, dashboard, intégrité |
| API-06 | `byId` inconnu ⇒ 404 |
| API-07 | Équipe DSI exposée (agents actifs, sans les employés) |
| API-08 | `listActive` exclut les supprimés |
| API-09 | Entrées surdimensionnées rejetées à la frontière |
| API-10 | Demande saisie par la DSI pour un collaborateur ⇒ visible dans **son** portail |
| AUTH-01 | Connexion : session ouverte, aucune empreinte de mot de passe renvoyée |
| AUTH-02 | Identifiants incorrects ⇒ 401, message identique que le compte existe ou non |
| AUTH-03 | **Force brute : après N échecs, même le bon mot de passe est refusé (429)** |
| AUTH-04 | Compte désactivé ⇒ connexion refusée |
| AUTH-05 | Déconnexion : session fermée ; `auth.me` |
| AUTH-06 | **Sans session : toutes les données ⇒ 401** |
| AUTH-07 | **Employé : tout le back-office ⇒ 403** (liste, fiche, modification, note interne, dashboard, audit, annuaire, admin) |
| AUTH-08 | Agent DSI : administration des comptes ⇒ 403 |
| AUTH-09 | Admin : création de compte, e-mail unique (409), mot de passe faible refusé, auto-rétrogradation interdite |
| POR-API-01 | **Portail : seulement ses demandes, sans notes internes ni étiquettes ; demande d'un collègue ⇒ 404** |
| POR-API-02 | Cycle déclaration → résolution DSI → confirmation ; confirmation prématurée ⇒ 403 ; ticket fermé ⇒ 412 |

## 8. Architecture

| ID | Scénario |
|---|---|
| ARC-01 | Le domaine n'importe rien d'extérieur |
| ARC-02 | L'application n'importe que le domaine |
| ARC-03 | L'UI n'importe de l'infrastructure que des types |
| ARC-04 | Le domaine ne lit ni l'horloge ni l'aléatoire |

## 9. Interface

| ID | Scénario |
|---|---|
| UI-F01..F05 | Vues enregistrées, compteurs, recherche sans accents, filtres combinés, tris |
| UI-T01..T05 | Durées, temps relatif, libellés SLA, traductions, avatars |
| UI-C01 | Export CSV : échappement RFC 4180 + **protection contre l'injection de formules** |
| UI-C02 | Export CSV : BOM, en-têtes, modifications lisibles |
| CMP-01..04 | Formulaire de création : bouton désactivé, soumission complète, SLA affiché, annulation |
| CMP-05..06 | Saisie d'étiquettes : ajout, normalisation, doublons, retrait, lecture seule |
| CMP-07..08 | Badges statut/priorité/SLA |
| CMP-09 | Boîte de confirmation : confirmer, Échap |

## 10. Bout en bout (Playwright – vrai serveur, vrai navigateur)

| ID | Parcours utilisateur |
|---|---|
| E2E-01 | Navigation entre les écrans du back-office, redirection vers le tableau de bord |
| E2E-02 | Création complète via la modale (raccourci **N**), visible dans la liste avec référence |
| E2E-03 | Création impossible sans titre ; Échap ferme la modale |
| E2E-04 | Modifier statut, priorité, « M'assigner » ; version incrémentée |
| E2E-05 | Édition en place du titre et de la description, persistance après rechargement |
| E2E-06 | Réponse publique + note interne (Ctrl+Entrée) |
| E2E-07 | **Fermer un ticket ⇒ tous les champs deviennent non modifiables** |
| E2E-08 | Résoudre puis rouvrir |
| E2E-09 | **Suppression : disparaît des vues, reste dans l'audit, fiche marquée supprimée** |
| E2E-10 | Ticket inconnu ⇒ page « introuvable » |
| E2E-11 | **Kanban : glisser-déposer change le statut ; fermeture avec confirmation ; carte verrouillée** |
| E2E-12 | **Voyage dans le temps : état passé reconstitué, différences surlignées** |
| E2E-13 | Palette Ctrl+K : recherche et ouverture d'un ticket |
| E2E-14 | Recherche sans accents et vues « Mes tickets » / « Non assignés » |
| E2E-15 | Traçabilité : les actions sont attribuées à l'agent connecté |
| E2E-16 | Badge « Journal intègre », sceau SHA-256, téléchargement CSV |
| E2E-17 | Indicateur du tableau de bord mis à jour après création |
| E2E-18 | Thème sombre mémorisé après rechargement |
| E2E-19 | Mobile (390 px) : aucun débordement horizontal sur les 4 écrans |
| E2E-20 | Accessibilité clavier : ouverture d'un ticket avec Entrée |
| E2E-21 | Connexion : erreur sur mauvais mot de passe, puis redirection selon le profil (employé ⇒ portail) |
| E2E-22 | Page protégée sans session ⇒ connexion, puis retour à la page demandée |
| E2E-23 | **Employé : les 5 écrans DSI le renvoient au portail ; l'API répond 403** |
| E2E-24 | **Déconnexion : session détruite côté serveur (401), écrans protégés inaccessibles** |
| E2E-25 | **Parcours complet à deux navigateurs : déclaration → prise en charge, note interne, réponse, résolution → l'employée voit la réponse (jamais la note) et confirme → ticket fermé, tracé à son nom** |
| E2E-26 | « Le problème persiste » : réouverture avec motif visible dans la conversation |
| E2E-27 | **Isolation : un employé ne peut pas ouvrir la demande d'un collègue** |
| E2E-28 | L'administrateur crée un compte, qui peut aussitôt se connecter |
| E2E-29 | Compte désactivé ⇒ connexion refusée ; un agent n'accède pas à l'administration |
| E2E-30 | Portail et connexion sur mobile (390 px) : aucun débordement horizontal |

## Recette manuelle complémentaire

1. `npm run seed -- --force` puis `npm run dev`.
2. Vérifier l'affichage sur Chrome, Firefox, Edge et Safari (iPad).
3. Modifier une ligne de `data/events.jsonl` à la main, redémarrer : le journal d'audit doit afficher « Altération détectée ! ».
4. Ouvrir deux navigateurs (un employé, un agent) : une demande déclarée au portail apparaît dans le back-office en moins de 5 s, et la réponse de l'agent dans le portail.
5. Copier le cookie `hdx_session` d'un employé et en modifier un caractère : l'API doit répondre 401.
6. Ouvrir l'export CSV dans Excel : accents et colonnes corrects.
