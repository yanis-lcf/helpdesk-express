/**
 * Génère un jeu de données de démonstration réaliste (14 derniers jours) en passant
 * par les VRAIS use cases : chaque donnée est un événement valide et chaîné.
 * Crée aussi les comptes de démonstration (DSI + employés).
 *
 *   npm run seed            (refuse d'écraser des données existantes)
 *   npm run seed -- --force (repart de zéro)
 */
import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  makeIdentityService,
  makePortalService,
  makeTicketCommands,
  makeTicketQueries,
  type CommandResult,
} from '../../application';
import type { Category, Priority, Status, User } from '../../domain';
import { DEMO_EMPLOYEES, DEMO_PASSWORD, DEMO_STAFF } from '../config/demoUsers';
import { createJsonlFileEventStore } from '../eventStore/jsonlFileEventStore';
import { createScryptHasher } from '../security/passwordHasher';
import { createJsonUserRepository } from '../users/userRepositories';

const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');
const FILE = resolve(process.env.EVENT_STORE_FILE ?? `${DATA_DIR}/events.jsonl`);
const USERS_FILE = resolve(process.env.USERS_FILE ?? `${DATA_DIR}/users.json`);
const force = process.argv.includes('--force');

const nonEmpty = (path: string) => stat(path).then((s) => s.size > 0, () => false);
if (((await nonEmpty(FILE)) || (await nonEmpty(USERS_FILE))) && !force) {
  console.error(`[seed] Des données existent déjà dans ${DATA_DIR}. Relancez avec --force pour repartir de zéro.`);
  process.exit(1);
}
await rm(FILE, { force: true });
await rm(USERS_FILE, { force: true });

// ---------- Comptes ----------

const identity = makeIdentityService({ users: await createJsonUserRepository(USERS_FILE), hasher: createScryptHasher(), newId: randomUUID });
const accounts = new Map<string, User>();
for (const input of [...DEMO_STAFF, ...DEMO_EMPLOYEES]) {
  const created = await identity.createUser({ ...input, password: DEMO_PASSWORD });
  if (!created.ok) throw new Error(`[seed] compte ${input.email} : ${JSON.stringify(created.error)}`);
  accounts.set(created.value.name, created.value);
}

// ---------- Tickets ----------

const eventStore = await createJsonlFileEventStore(FILE);
let cursor = Date.now();
const clock = () => new Date(cursor).toISOString();
const commands = makeTicketCommands({ eventStore, clock, newId: randomUUID });
const portal = makePortalService({ commands, queries: makeTicketQueries({ eventStore, clock }) });

const HOUR = 3_600_000;
const agents = DEMO_STAFF.map((m) => m.name);

type Step = { status?: Status; comment?: string; internal?: boolean; priority?: Priority; byRequester?: boolean };
type Scenario = {
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  requester: string;
  tags: string[];
  /** Il y a combien d'heures le ticket a été créé. */
  ageHours: number;
  assignee?: string;
  /** Étapes : [délai en heures après création, action]. */
  steps?: [number, Step][];
  deleted?: boolean;
};

const scenarios: Scenario[] = [
  { title: 'Imprimante du 2e étage hors service', description: 'Bourrage papier récurrent sur la HP LaserJet du plateau commercial.', priority: 'MEDIUM', category: 'HARDWARE', requester: 'Claire Dubois', tags: ['impression', 'plateau-2'], ageHours: 310, assignee: agents[2], steps: [[1, { status: 'IN_PROGRESS', comment: 'Je passe vérifier le bac 2 dans la matinée.' }], [5, { status: 'RESOLVED', comment: 'Galet d’entraînement remplacé. Merci de confirmer.' }], [30, { status: 'CLOSED', byRequester: true }]] },
  { title: 'Accès VPN impossible depuis le domicile', description: 'Erreur « authentification échouée » sur FortiClient depuis ce matin.', priority: 'HIGH', category: 'NETWORK', requester: 'Marc Leroy', tags: ['vpn', 'télétravail'], ageHours: 290, assignee: agents[3], steps: [[0.5, { status: 'IN_PROGRESS', comment: 'Certificat expiré côté poste, renouvellement en cours.', internal: true }], [2, { status: 'RESOLVED', comment: 'Certificat renouvelé, la connexion fonctionne.' }], [3, { comment: 'Parfait, merci pour la rapidité !', byRequester: true }], [20, { status: 'CLOSED' }]] },
  { title: 'Création de compte pour une nouvelle arrivante', description: 'Arrivée de Julie Bernard (RH) lundi : compte AD, messagerie, accès SIRH.', priority: 'MEDIUM', category: 'ACCESS', requester: 'Service RH', tags: ['onboarding'], ageHours: 260, assignee: agents[4], steps: [[6, { status: 'IN_PROGRESS' }], [20, { status: 'RESOLVED', comment: 'Comptes créés, identifiants remis en main propre.' }]] },
  { title: 'Outlook se ferme au démarrage', description: 'Plantage systématique après la mise à jour de mardi.', priority: 'MEDIUM', category: 'SOFTWARE', requester: 'Nadia Haddad', tags: ['outlook', 'office365'], ageHours: 230, assignee: agents[1], steps: [[3, { status: 'IN_PROGRESS', comment: 'Lancement en mode sans échec : un complément PDF est en cause.', internal: true }], [30, { status: 'RESOLVED', comment: 'Complément désactivé et mis à jour.' }]] },
  { title: 'Wi-Fi instable en salle de réunion B', description: 'Déconnexions toutes les 10 minutes pendant les visios.', priority: 'HIGH', category: 'NETWORK', requester: 'Paul Girard', tags: ['wifi', 'salle-b'], ageHours: 200, assignee: agents[3], steps: [[1, { status: 'IN_PROGRESS' }], [6, { status: 'RESOLVED', comment: 'Borne remplacée et canal reconfiguré.' }], [40, { status: 'CLOSED', byRequester: true }]] },
  { title: 'Demande d’un second écran', description: 'Pour le poste de comptabilité n°4.', priority: 'LOW', category: 'HARDWARE', requester: 'Émilie Robert', tags: ['matériel', 'compta'], ageHours: 180, assignee: agents[2], steps: [[24, { status: 'IN_PROGRESS', comment: 'Commande passée chez le fournisseur.' }], [60, { status: 'RESOLVED', comment: 'Écran installé.' }]] },
  { title: 'Mot de passe expiré – compte bloqué', description: 'Compte verrouillé après 5 tentatives.', priority: 'HIGH', category: 'ACCESS', requester: 'Hugo Lambert', tags: ['mot-de-passe'], ageHours: 160, assignee: agents[2], steps: [[0.3, { status: 'RESOLVED', comment: 'Compte déverrouillé, mot de passe réinitialisé.' }], [10, { status: 'CLOSED' }]] },
  { title: 'Licence Adobe Acrobat expirée', description: 'Impossible de signer les contrats fournisseurs.', priority: 'MEDIUM', category: 'SOFTWARE', requester: 'Service Achats', tags: ['licence', 'adobe'], ageHours: 140, assignee: agents[0], steps: [[4, { status: 'IN_PROGRESS', comment: 'Bon de commande en validation.', internal: true }], [50, { status: 'RESOLVED' }]] },
  { title: 'Lenteurs sur l’ERP en fin de mois', description: 'Temps de réponse > 10 s sur les écrans de facturation.', priority: 'HIGH', category: 'SOFTWARE', requester: 'Direction financière', tags: ['erp', 'performance'], ageHours: 120, assignee: agents[4], steps: [[2, { status: 'IN_PROGRESS', comment: 'Analyse des index de la base en cours.', internal: true }], [9, { status: 'RESOLVED', comment: 'Index reconstruits, temps de réponse < 2 s.' }]] },
  { title: 'Clavier défectueux', description: 'Touches E et R inopérantes.', priority: 'LOW', category: 'HARDWARE', requester: 'Antoine Simon', tags: ['matériel'], ageHours: 100, assignee: agents[2], steps: [[30, { status: 'RESOLVED', comment: 'Clavier remplacé.' }]] },
  { title: 'Ancien ticket créé par erreur', description: 'Doublon.', priority: 'LOW', category: 'OTHER', requester: 'Lucas Martin', tags: [], ageHours: 90, deleted: true },
  { title: 'Partage réseau « Projets » inaccessible', description: 'Message « accès refusé » pour toute l’équipe Marketing.', priority: 'HIGH', category: 'ACCESS', requester: 'Équipe Marketing', tags: ['partage', 'droits'], ageHours: 70, assignee: agents[4], steps: [[1, { status: 'IN_PROGRESS' }], [3, { status: 'RESOLVED', comment: 'Groupe AD rétabli sur le partage.' }]] },
  { title: 'Téléphone IP sans tonalité', description: 'Poste 214, accueil.', priority: 'MEDIUM', category: 'NETWORK', requester: 'Léa Fontaine', tags: ['téléphonie'], ageHours: 50, assignee: agents[3], steps: [[5, { status: 'IN_PROGRESS', comment: 'Port PoE du switch à vérifier.', internal: true }], [6, { comment: 'Je suis passé à l’accueil, le téléphone redémarre en boucle. Pièce commandée.' }]] },
  { title: 'Installation de Power BI Desktop', description: 'Pour l’analyse des ventes de l’équipe commerciale.', priority: 'LOW', category: 'SOFTWARE', requester: 'Karim Mansour', tags: ['installation'], ageHours: 40, assignee: agents[1] },
  { title: 'Écran bleu au démarrage du portable', description: 'BSOD « INACCESSIBLE_BOOT_DEVICE » depuis ce matin.', priority: 'HIGH', category: 'HARDWARE', requester: 'Sophie Laurent', tags: ['bsod', 'portable'], ageHours: 6, assignee: agents[1], steps: [[0.5, { status: 'IN_PROGRESS', comment: 'Prêt d’un portable de remplacement en attendant.' }], [1, { comment: 'Merci, je récupère le portable à la DSI.', byRequester: true }]] },
  { title: 'Serveur de fichiers à 95 % de capacité', description: 'Alerte de supervision sur FS-01.', priority: 'HIGH', category: 'OTHER', requester: 'Supervision', tags: ['stockage', 'serveur'], ageHours: 3.5 },
  { title: 'Accès à l’application de notes de frais', description: 'Nouveau manager, besoin du rôle « valideur ».', priority: 'MEDIUM', category: 'ACCESS', requester: 'Paul Girard', tags: ['droits'], ageHours: 20, assignee: agents[0] },
  { title: 'Messagerie : pièces jointes bloquées', description: 'Les fichiers .zip des fournisseurs sont rejetés.', priority: 'MEDIUM', category: 'SOFTWARE', requester: 'Service Achats', tags: ['messagerie', 'sécurité'], ageHours: 26, steps: [[2, { comment: 'Politique de filtrage à revoir avec le RSSI.', internal: true }]] },
  { title: 'Projecteur de la salle A ne s’allume plus', description: 'Voyant orange clignotant.', priority: 'LOW', category: 'HARDWARE', requester: 'Claire Dubois', tags: ['salle-a'], ageHours: 10 },
  { title: 'Lenteur de connexion Internet au 3e étage', description: 'Débit < 5 Mb/s depuis hier.', priority: 'MEDIUM', category: 'NETWORK', requester: 'Marc Leroy', tags: ['réseau', 'plateau-3'], ageHours: 2, assignee: agents[3] },
  { title: 'Demande de badge d’accès parking', description: 'Badge perdu.', priority: 'LOW', category: 'OTHER', requester: 'Léa Fontaine', tags: [], ageHours: 1 },
];

const must = (r: CommandResult, label: string) => {
  if (!r.ok) throw new Error(`[seed] ${label} : ${JSON.stringify(r.error)}`);
  return r.value;
};

// Rejoue chaque scénario dans l'ordre chronologique global des actions.
type Action = { at: number; run: () => Promise<unknown> };
const actions: Action[] = [];
const ids = new Map<Scenario, string>();
const now = Date.now();

for (const [index, s] of scenarios.entries()) {
  const createdAt = now - s.ageHours * HOUR;
  const dispatcher = agents[(index * 3) % agents.length]!;
  const employee = accounts.get(s.requester);
  const isEmployeeAccount = employee?.role === 'EMPLOYEE';

  // Les collaborateurs ayant un compte déclarent eux-mêmes leur demande via le portail ;
  // les autres demandes (services, supervision) sont saisies par la DSI.
  actions.push({
    at: createdAt,
    run: async () => {
      const created = isEmployeeAccount
        ? must(await portal.submit({ title: s.title, description: s.description, category: s.category, priority: s.priority }, employee), s.title)
        : must(await commands.createTicket({ ...s, assignee: null }, dispatcher), s.title);
      ids.set(s, created.ticketId);
      if (isEmployeeAccount && s.tags.length > 0) must(await commands.updateTicket({ ticketId: created.ticketId, changes: { tags: s.tags } }, dispatcher), 'tags');
    },
  });
  if (s.assignee) actions.push({ at: createdAt + 0.15 * HOUR, run: async () => must(await commands.assignTicket({ ticketId: ids.get(s)!, assignee: s.assignee! }, dispatcher), 'assign') });

  for (const [delay, step] of s.steps ?? []) {
    const at = createdAt + delay * HOUR;
    if (at > now) continue;
    const by = step.byRequester ? s.requester : (s.assignee ?? dispatcher);
    actions.push({
      at,
      run: async () => {
        const ticketId = ids.get(s)!;
        if (step.byRequester && employee) {
          if (step.comment) must(await portal.reply(ticketId, step.comment, employee), 'reply');
          if (step.status === 'CLOSED') must(await portal.confirmResolution(ticketId, employee), 'confirm');
          return;
        }
        if (step.comment) must(await commands.commentTicket({ ticketId, body: step.comment, internal: step.internal ?? false }, by), 'comment');
        if (step.status || step.priority)
          must(await commands.updateTicket({ ticketId, changes: { status: step.status, priority: step.priority } }, by), 'update');
      },
    });
  }
  if (s.deleted) actions.push({ at: createdAt + HOUR, run: async () => must(await commands.deleteTicket({ ticketId: ids.get(s)! }, dispatcher), 'delete') });
}

for (const action of actions.sort((a, b) => a.at - b.at)) {
  cursor = action.at;
  await action.run();
}

const report = await eventStore.verifyIntegrity();
console.log(`[seed] ${accounts.size} comptes (mot de passe de démonstration : ${DEMO_PASSWORD}) → ${USERS_FILE}`);
console.log(`[seed] ${scenarios.length} tickets, ${report.checkedEvents} événements écrits dans ${FILE}`);
