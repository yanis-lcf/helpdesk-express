import type { Status, Ticket, TicketEvent, TicketState, Timestamp } from './types';

export const initialState: TicketState = { kind: 'NotFound' };

const isResolution = (status: Status) => status === 'RESOLVED' || status === 'CLOSED';

/** Date de résolution : posée au premier passage RESOLVED/CLOSED, effacée à la réouverture. */
const nextResolvedAt = (ticket: Ticket, status: Status | undefined, at: Timestamp): Timestamp | null => {
  if (status === undefined) return ticket.resolvedAt;
  if (!isResolution(status)) return null;
  return ticket.resolvedAt ?? at;
};

/** Applique un événement à un ticket existant (champs communs : version, date de modification). */
const touch = (ticket: Ticket, at: Timestamp, patch: Partial<Ticket>): Ticket => ({
  ...ticket,
  ...patch,
  updatedAt: at,
  version: ticket.version + 1,
});

/**
 * Reducer pur : (state, event) => newState.
 * Un événement est un fait déjà validé : evolve ne refuse jamais rien.
 */
export const evolve = (state: TicketState, event: TicketEvent): TicketState => {
  switch (event.type) {
    case 'TicketCreated':
      return {
        kind: 'Active',
        ticket: {
          id: event.ticketId,
          title: event.payload.title,
          description: event.payload.description,
          priority: event.payload.priority,
          category: event.payload.category ?? 'OTHER',
          status: 'OPEN',
          requester: event.payload.requester ?? event.actor,
          requesterId: event.payload.requesterId ?? null,
          assignee: null,
          tags: event.payload.tags ?? [],
          comments: [],
          createdBy: event.actor,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          resolvedAt: null,
          satisfaction: null,
          version: 1,
        },
      };

    case 'TicketUpdated': {
      if (state.kind !== 'Active') return state;
      const { ticket } = state;
      return {
        kind: 'Active',
        ticket: touch(ticket, event.occurredAt, {
          ...event.payload,
          resolvedAt: nextResolvedAt(ticket, event.payload.status, event.occurredAt),
        }),
      };
    }

    case 'TicketAssigned':
      return state.kind === 'Active'
        ? { kind: 'Active', ticket: touch(state.ticket, event.occurredAt, { assignee: event.payload.assignee }) }
        : state;

    case 'TicketCommented':
      return state.kind === 'Active'
        ? {
            kind: 'Active',
            ticket: touch(state.ticket, event.occurredAt, {
              comments: [
                ...state.ticket.comments,
                {
                  id: event.payload.commentId,
                  body: event.payload.body,
                  internal: event.payload.internal,
                  author: event.actor,
                  createdAt: event.occurredAt,
                },
              ],
            }),
          }
        : state;

    case 'TicketRated':
      return state.kind === 'Active'
        ? {
            kind: 'Active',
            ticket: touch(state.ticket, event.occurredAt, {
              satisfaction: {
                rating: event.payload.rating,
                comment: event.payload.comment,
                ratedBy: event.actor,
                ratedAt: event.occurredAt,
              },
            }),
          }
        : state;

    case 'TicketDeleted':
      return state.kind === 'Active'
        ? {
            kind: 'Deleted',
            ticket: { ...state.ticket, version: state.ticket.version + 1 },
            deletedAt: event.occurredAt,
            deletedBy: event.actor,
          }
        : state;
  }
};

/** Reconstitue l'état d'un ticket en rejouant son flux d'événements. */
export const rehydrate = (events: readonly TicketEvent[]): TicketState => events.reduce(evolve, initialState);
