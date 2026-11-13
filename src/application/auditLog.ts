import {
  evolve,
  initialState,
  type Actor,
  type TicketEvent,
  type TicketEventType,
  type TicketId,
  type TicketState,
  type Timestamp,
} from '../domain';
import type { StoredEvent } from './ports';

export type FieldChange = {
  readonly field: string;
  readonly before: string | null;
  readonly after: string | null;
};

export type AuditEntry = {
  readonly position: number;
  readonly streamVersion: number;
  readonly ticketId: TicketId;
  readonly type: TicketEventType;
  readonly occurredAt: Timestamp;
  readonly actor: Actor;
  /** Payload brut, tel qu'enregistré. */
  readonly payload: TicketEvent['payload'];
  /** Détail lisible des données modifiées (avant → après), obtenu par rejeu. */
  readonly changes: readonly FieldChange[];
  readonly hash: string;
  readonly previousHash: string;
};

const snapshot = (state: TicketState): Record<string, string | null> =>
  state.kind === 'NotFound'
    ? {}
    : {
        title: state.ticket.title,
        description: state.ticket.description,
        priority: state.ticket.priority,
        category: state.ticket.category,
        status: state.ticket.status,
        requester: state.ticket.requester,
        assignee: state.ticket.assignee,
        tags: state.ticket.tags.join(', '),
        ...(state.kind === 'Deleted' ? { deleted: 'oui' } : {}),
      };

const diff = (before: TicketState, after: TicketState): readonly FieldChange[] => {
  const a = snapshot(before);
  const b = snapshot(after);
  return Object.keys(b)
    .filter((field) => (a[field] ?? null) !== (b[field] ?? null))
    .filter((field) => !(before.kind === 'NotFound' && (b[field] === null || b[field] === '')))
    .map((field) => ({ field, before: a[field] ?? null, after: b[field] ?? null }));
};

const describe = (event: TicketEvent, before: TicketState, after: TicketState): readonly FieldChange[] =>
  event.type === 'TicketCommented'
    ? [{ field: event.payload.internal ? 'internalNote' : 'comment', before: null, after: event.payload.body }]
    : diff(before, after);

/**
 * Projection « journal d'audit » : chaque événement brut, dans l'ordre chronologique
 * d'enregistrement, enrichi du diff calculé par rejeu des flux.
 */
export const buildAuditLog = (stored: readonly StoredEvent[]): readonly AuditEntry[] => {
  const states = new Map<TicketId, TicketState>();
  return [...stored]
    .sort((x, y) => x.position - y.position)
    .map(({ position, streamVersion, event, hash, previousHash }) => {
      const before = states.get(event.ticketId) ?? initialState;
      const after = evolve(before, event);
      states.set(event.ticketId, after);
      return {
        position,
        streamVersion,
        ticketId: event.ticketId,
        type: event.type,
        occurredAt: event.occurredAt,
        actor: event.actor,
        payload: event.payload,
        changes: describe(event, before, after),
        hash,
        previousHash,
      };
    });
};
