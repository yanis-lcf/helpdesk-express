/**
 * Génère un jeu de données de démonstration réaliste (14 derniers jours) en passant
 * par les VRAIS use cases : chaque donnée est un événement valide et chaîné.
 *
 *   npm run seed            (refuse d'écraser un journal existant)
 *   npm run seed -- --force (repart d'un journal vide)
 */
import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { makeTicketCommands, type CommandResult } from '../../application';
import type { Category, Priority, Status } from '../../domain';
import { TEAM } from '../config/team';
import { createJsonlFileEventStore } from '../eventStore/jsonlFileEventStore';

const FILE = resolve(process.env.EVENT_STORE_FILE ?? 'data/events.jsonl');
const force = process.argv.includes('--force');

const exists = await stat(FILE).then((s) => s.size > 0, () => false);
if (exists && !force) {
  console.error(`[seed] ${FILE} contient déjà des événements. Relancez avec --force pour repartir de zéro.`);
  process.exit(1);
}
if (exists) await rm(FILE);

const eventStore = await createJsonlFileEventStore(FILE);
let cursor = Date.now();
const commands = makeTicketCommands({ eventStore, clock: () => new Date(cursor).toISOString(), newId: randomUUID });

const HOUR = 3_600_000;
const agents = TEAM.map((m) => m.name);

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
  steps?: [number, { status?: Status; comment?: string; internal?: boolean; priority?: Priority }][];
  deleted?: boolean;
};

const scenarios: Scenario[] = [
  { title: 'Imprimante du 2e étage hors service', description: 'Bourrage papier récurrent sur la HP LaserJet du plateau commercial.', priority: 'MEDIUM', category: 'HARDWARE', requester: 'Claire Dubois', tags: ['impression', 'plateau-2'], ageHours: 310, assignee: agents[2], steps: [[1, { status: 'IN_PROGRESS', comment: 'Je passe vérifier le bac 2 dans la matinée.' }], [5, { status: 'RESOLVED', comment: 'Galet d’entraînement remplacé. Merci de confirmer.' }], [30, { status: 'CLOSED' }]] },
  { title: 'Accès VPN impossible depuis le domicile', description: 'Erreur « authentification échouée » sur FortiClient depuis ce matin.', priority: 'HIGH', category: 'NETWORK', requester: 'Marc Leroy', tags: ['vpn', 'télétravail'], ageHours: 290, assignee: agents[3], steps: [[0.5, { status: 'IN_PROGRESS', comment: 'Certificat expiré côté poste, renouvellement en cours.', internal: true }], [2, { status: 'RESOLVED', comment: 'Certificat renouvelé, la connexion fonctionne.' }], [20, { status: 'CLOSED' }]] },
  { title: 'Création de compte pour une nouvelle arrivante', description: 'Arrivée de Julie Bernard (RH) lundi : compte AD, messagerie, accès SIRH.', priority: 'MEDIUM', category: 'ACCESS', requester: 'Service RH', tags: ['onboarding'], ageHours: 260, assignee: agents[4], steps: [[6, { status: 'IN_PROGRESS' }], [20, { status: 'RESOLVED', comment: 'Comptes créés, identifiants remis en main propre.' }]] },
  { title: 'Outlook se ferme au démarrage', description: 'Plantage systématique après la mise à jour de mardi.', priority: 'MEDIUM', category: 'SOFTWARE', requester: 'Nadia Haddad', tags: ['outlook', 'office365'], ageHours: 230, assignee: agents[1], steps: [[3, { status: 'IN_PROGRESS', comment: 'Lancement en mode sans échec : un complément PDF est en cause.', internal: true }], [30, { status: 'RESOLVED', comment: 'Complément désactivé et mis à jour.' }]] },
  { title: 'Wi-Fi instable en salle de réunion B', description: 'Déconnexions toutes les 10 minutes pendant les visios.', priority: 'HIGH', category: 'NETWORK', requester: 'Paul Girard', tags: ['wifi', 'salle-b'], ageHours: 200, assignee: agents[3], steps: [[1, { status: 'IN_PROGRESS' }], [6, { status: 'RESOLVED', comment: 'Borne remplacée et canal reconfiguré.' }], [40, { status: 'CLOSED' }]] },
  { title: 'Demande d’un second écran', description: 'Pour le poste de comptabilité n°4.', priority: 'LOW', category: 'HARDWARE', requester: 'Émilie Robert', tags: ['matériel', 'compta'], ageHours: 180, assignee: agents[2], steps: [[24, { status: 'IN_PROGRESS', comment: 'Commande passée chez le fournisseur.' }], [60, { status: 'RESOLVED', comment: 'Écran installé.' }]] },
  { title: 'Mot de passe expiré – compte bloqué', description: 'Compte verrouillé après 5 tentatives.', priority: 'HIGH', category: 'ACCESS', requester: 'Hugo Lambert', tags: ['mot-de-passe'], ageHours: 160, assignee: agents[2], steps: [[0.3, { status: 'RESOLVED', comment: 'Compte déverrouillé, mot de passe réinitialisé.' }], [10, { status: 'CLOSED' }]] },
  { title: 'Licence Adobe Acrobat expirée', description: 'Impossible de signer les contrats fournisseurs.', priority: 'MEDIUM', category: 'SOFTWARE', requester: 'Service Achats', tags: ['licence', 'adobe'], ageHours: 140, assignee: agents[0], steps: [[4, { status: 'IN_PROGRESS', comment: 'Bon de commande en validation.', internal: true }], [50, { status: 'RESOLVED' }]] },
  { title: 'Lenteurs sur l’ERP en fin de mois', description: 'Temps de réponse > 10 s sur les écrans de facturation.', priority: 'HIGH', category: 'SOFTWARE', requester: 'Direction financière', tags: ['erp', 'performance'], ageHours: 120, assignee: agents[4], steps: [[2, { status: 'IN_PROGRESS', comment: 'Analyse des index de la base en cours.', internal: true }], [9, { status: 'RESOLVED', comment: 'Index reconstruits, temps de réponse < 2 s.' }]] },
  { title: 'Clavier défectueux', description: 'Touches E et R inopérantes.', priority: 'LOW', category: 'HARDWARE', requester: 'Antoine Simon', tags: ['matériel'], ageHours: 100, assignee: agents[2], steps: [[30, { status: 'RESOLVED', comment: 'Clavier remplacé.' }]] },
  { title: 'Ancien ticket créé par erreur', description: 'Doublon.', priority: 'LOW', category: 'OTHER', requester: 'Lucas Martin', tags: [], ageHours: 90, deleted: true },
  { title: 'Partage réseau « Projets » inaccessible', description: 'Message « accès refusé » pour toute l’équipe Marketing.', priority: 'HIGH', category: 'ACCESS', requester: 'Équipe Marketing', tags: ['partage', 'droits'], ageHours: 70, assignee: agents[4], steps: [[1, { status: 'IN_PROGRESS' }], [3, { status: 'RESOLVED', comment: 'Groupe AD rétabli sur le partage.' }]] },
  { title: 'Téléphone IP sans tonalité', description: 'Poste 214, accueil.', priority: 'MEDIUM', category: 'NETWORK', requester: 'Accueil', tags: ['téléphonie'], ageHours: 50, assignee: agents[3], steps: [[5, { status: 'IN_PROGRESS', comment: 'Port PoE du switch à vérifier.', internal: true }]] },
  { title: 'Installation de Power BI Desktop', description: 'Pour l’analyste data de l’équipe commerciale.', priority: 'LOW', category: 'SOFTWARE', requester: 'Karim Mansour', tags: ['installation'], ageHours: 40, assignee: agents[1] },
  { title: 'Écran bleu au démarrage du portable', description: 'BSOD « INACCESSIBLE_BOOT_DEVICE » depuis ce matin.', priority: 'HIGH', category: 'HARDWARE', requester: 'Sophie Laurent', tags: ['bsod', 'portable'], ageHours: 6, assignee: agents[1], steps: [[0.5, { status: 'IN_PROGRESS', comment: 'Prêt d’un portable de remplacement en attendant.' }]] },
  { title: 'Serveur de fichiers à 95 % de capacité', description: 'Alerte de supervision sur FS-01.', priority: 'HIGH', category: 'OTHER', requester: 'Supervision', tags: ['stockage', 'serveur'], ageHours: 3.5 },
  { title: 'Accès à l’application de notes de frais', description: 'Nouveau manager, besoin du rôle « valideur ».', priority: 'MEDIUM', category: 'ACCESS', requester: 'Julien Fabre', tags: ['droits'], ageHours: 20, assignee: agents[0] },
  { title: 'Messagerie : pièces jointes bloquées', description: 'Les fichiers .zip des fournisseurs sont rejetés.', priority: 'MEDIUM', category: 'SOFTWARE', requester: 'Service Achats', tags: ['messagerie', 'sécurité'], ageHours: 26, steps: [[2, { comment: 'Politique de filtrage à revoir avec le RSSI.', internal: true }]] },
  { title: 'Projecteur de la salle A ne s’allume plus', description: 'Voyant orange clignotant.', priority: 'LOW', category: 'HARDWARE', requester: 'Paul Girard', tags: ['salle-a'], ageHours: 10 },
  { title: 'Lenteur de connexion Internet au 3e étage', description: 'Débit < 5 Mb/s depuis hier.', priority: 'MEDIUM', category: 'NETWORK', requester: 'Équipe Produit', tags: ['réseau', 'plateau-3'], ageHours: 2, assignee: agents[3] },
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

for (const s of scenarios) {
  const createdAt = now - s.ageHours * HOUR;
  const actor = agents[(scenarios.indexOf(s) * 3) % agents.length]!;
  actions.push({
    at: createdAt,
    run: async () => {
      const created = must(await commands.createTicket({ ...s, assignee: s.assignee ?? null }, actor), s.title);
      ids.set(s, created.ticketId);
    },
  });
  for (const [delay, step] of s.steps ?? []) {
    const at = createdAt + delay * HOUR;
    if (at > now) continue;
    const by = s.assignee ?? actor;
    actions.push({
      at,
      run: async () => {
        const ticketId = ids.get(s)!;
        if (step.comment) must(await commands.commentTicket({ ticketId, body: step.comment, internal: step.internal ?? false }, by), 'comment');
        if (step.status || step.priority)
          must(await commands.updateTicket({ ticketId, changes: { status: step.status, priority: step.priority } }, by), 'update');
      },
    });
  }
  if (s.deleted) actions.push({ at: createdAt + HOUR, run: async () => must(await commands.deleteTicket({ ticketId: ids.get(s)! }, actor), 'delete') });
}

for (const action of actions.sort((a, b) => a.at - b.at)) {
  cursor = action.at;
  await action.run();
}

const report = await eventStore.verifyIntegrity();
console.log(`[seed] ${scenarios.length} tickets, ${report.checkedEvents} événements écrits dans ${FILE}`);
