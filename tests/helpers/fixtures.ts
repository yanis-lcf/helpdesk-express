import {
  makeIdentityService,
  makeKnowledgeService,
  makePortabilityService,
  makePortalService,
  makeTicketCommands,
  makeTicketQueries,
} from '../../src/application';
import { createInMemoryArticleRepository } from '../../src/infrastructure/knowledge/articleRepositories';
import type { TicketChanges, TicketEvent, User } from '../../src/domain';
import { createInMemoryEventStore } from '../../src/infrastructure/eventStore/inMemoryEventStore';
import { createScryptHasher } from '../../src/infrastructure/security/passwordHasher';
import { createInMemoryUserRepository } from '../../src/infrastructure/users/userRepositories';

/** Date de référence + h heures (UTC). */
export const T = (hours: number) => new Date(Date.UTC(2026, 0, 5, 8, 0, 0) + hours * 3_600_000).toISOString();

export const AGENT = 'Sarah Benali';
export const OTHER = 'Lucas Martin';

/** Utilisateurs types (identifiants stables). */
export const USERS = {
  admin: { id: 'u-admin', name: 'Yanis Loucif', email: 'admin@test.fr', role: 'ADMIN', department: 'DSI', jobTitle: 'Responsable', active: true },
  agent: { id: 'u-agent', name: AGENT, email: 'agent@test.fr', role: 'AGENT', department: 'DSI', jobTitle: 'Technicienne N2', active: true },
  other: { id: 'u-other', name: OTHER, email: 'other@test.fr', role: 'AGENT', department: 'DSI', jobTitle: 'Technicien N1', active: true },
  claire: { id: 'u-claire', name: 'Claire Dubois', email: 'claire@test.fr', role: 'EMPLOYEE', department: 'Commercial', jobTitle: '', active: true },
  marc: { id: 'u-marc', name: 'Marc Leroy', email: 'marc@test.fr', role: 'EMPLOYEE', department: 'Commercial', jobTitle: '', active: true },
} as const satisfies Record<string, User>;

export const PASSWORD = 'secret123';

/** Hachage scrypt allégé : mêmes garanties fonctionnelles, tests rapides. */
export const fastHasher = createScryptHasher({ N: 1024 });

/** Fabriques d'événements (Given). */
export const ev = {
  created: (ticketId = 't1', at = T(0), overrides: Partial<Extract<TicketEvent, { type: 'TicketCreated' }>['payload']> = {}): TicketEvent => ({
    type: 'TicketCreated',
    ticketId,
    occurredAt: at,
    actor: AGENT,
    payload: { title: 'Imprimante HS', description: '2e étage', priority: 'HIGH', category: 'HARDWARE', requester: 'Claire', tags: [], ...overrides },
  }),
  updated: (changes: TicketChanges, at = T(1), ticketId = 't1', actor = AGENT): TicketEvent => ({
    type: 'TicketUpdated',
    ticketId,
    occurredAt: at,
    actor,
    payload: changes,
  }),
  assigned: (assignee: string | null, at = T(1), ticketId = 't1'): TicketEvent => ({
    type: 'TicketAssigned',
    ticketId,
    occurredAt: at,
    actor: AGENT,
    payload: { assignee },
  }),
  commented: (body: string, internal = false, at = T(1), ticketId = 't1'): TicketEvent => ({
    type: 'TicketCommented',
    ticketId,
    occurredAt: at,
    actor: AGENT,
    payload: { commentId: `c-${body.length}`, body, internal },
  }),
  deleted: (at = T(2), ticketId = 't1'): TicketEvent => ({ type: 'TicketDeleted', ticketId, occurredAt: at, actor: AGENT, payload: {} }),
};

/** Application complète branchée sur un Event Store et un annuaire en mémoire, horloge et IDs déterministes. */
export const setupApp = (eventStore = createInMemoryEventStore()) => {
  let now = Date.parse(T(0));
  let id = 0;
  const clock = () => new Date(now).toISOString();
  const newId = () => `id-${++id}`;
  const commands = makeTicketCommands({ eventStore, clock, newId });
  const queries = makeTicketQueries({ eventStore, clock });
  const users = createInMemoryUserRepository();
  const articles = createInMemoryArticleRepository();
  const identity = makeIdentityService({ users, hasher: fastHasher, newId });
  const knowledge = makeKnowledgeService({ articles, clock, newId });
  const app = {
    eventStore,
    commands,
    queries,
    users,
    articles,
    identity,
    knowledge,
    portal: makePortalService({ commands, queries }),
    portability: makePortabilityService({ eventStore, identity, knowledge, clock }),
    /** Avance l'horloge de h heures. */
    advance: (hours: number) => {
      now += hours * 3_600_000;
    },
    /** Enregistre les utilisateurs types dans l'annuaire (mot de passe : PASSWORD). */
    seedUsers: async () => {
      const passwordHash = await fastHasher.hash(PASSWORD);
      for (const user of Object.values(USERS)) await users.save({ ...user, passwordHash });
    },
  };
  return app;
};

export const newTicket = { title: 'VPN KO', description: 'Erreur auth', priority: 'MEDIUM', category: 'NETWORK' } as const;
