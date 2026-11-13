import { makeTicketCommands, makeTicketQueries } from '../../src/application';
import type { TicketChanges, TicketEvent } from '../../src/domain';
import { createInMemoryEventStore } from '../../src/infrastructure/eventStore/inMemoryEventStore';

/** Date de référence + h heures (UTC). */
export const T = (hours: number) => new Date(Date.UTC(2026, 0, 5, 8, 0, 0) + hours * 3_600_000).toISOString();

export const AGENT = 'Sarah Benali';
export const OTHER = 'Lucas Martin';

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

/** Application complète branchée sur un Event Store en mémoire, horloge et IDs déterministes. */
export const setupApp = (eventStore = createInMemoryEventStore()) => {
  let now = Date.parse(T(0));
  let id = 0;
  const clock = () => new Date(now).toISOString();
  const app = {
    eventStore,
    commands: makeTicketCommands({ eventStore, clock, newId: () => `id-${++id}` }),
    queries: makeTicketQueries({ eventStore, clock }),
    /** Avance l'horloge de h heures. */
    advance: (hours: number) => {
      now += hours * 3_600_000;
    },
  };
  return app;
};

export const newTicket = { title: 'VPN KO', description: 'Erreur auth', priority: 'MEDIUM', category: 'NETWORK' } as const;
