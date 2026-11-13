import { rehydrate } from './evolve';
import { computeSla, type Sla } from './sla';
import type { Ticket, TicketEvent, TicketId, Timestamp } from './types';

/** Modèle de lecture d'un ticket : état courant + informations calculées. */
export type TicketView = Ticket & {
  /** Référence lisible (HD-0001), attribuée selon l'ordre de création dans le journal. */
  readonly reference: string;
  readonly deleted: boolean;
  readonly deletedAt: Timestamp | null;
  readonly sla: Sla;
};

export const formatReference = (n: number) => `HD-${String(n).padStart(4, '0')}`;

/**
 * Regroupe un flux global d'événements par agrégat, en préservant l'ordre.
 * (La Map est un accumulateur local : la fonction reste pure vue de l'extérieur.)
 */
export const groupByTicket = (events: readonly TicketEvent[]): ReadonlyMap<TicketId, readonly TicketEvent[]> => {
  const streams = new Map<TicketId, TicketEvent[]>();
  for (const event of events) {
    const stream = streams.get(event.ticketId);
    if (stream) stream.push(event);
    else streams.set(event.ticketId, [event]);
  }
  return streams;
};

/** Projection de TOUS les tickets (y compris supprimés), dans l'ordre de création. */
export const projectTickets = (events: readonly TicketEvent[], now: Timestamp): readonly TicketView[] =>
  [...groupByTicket(events).values()].flatMap((stream, index): TicketView[] => {
    const state = rehydrate(stream);
    if (state.kind === 'NotFound') return [];
    return [
      {
        ...state.ticket,
        reference: formatReference(index + 1),
        deleted: state.kind === 'Deleted',
        deletedAt: state.kind === 'Deleted' ? state.deletedAt : null,
        sla: computeSla(state.ticket, now),
      },
    ];
  });

/** Projection « tickets actifs » : non supprimés, le plus récemment modifié en premier. */
export const projectActiveTickets = (events: readonly TicketEvent[], now: Timestamp): readonly TicketView[] =>
  projectTickets(events, now)
    .filter((t) => !t.deleted)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
