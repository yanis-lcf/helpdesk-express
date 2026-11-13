import {
  computeDashboard,
  err,
  ok,
  projectActiveTickets,
  projectTickets,
  DomainErrors,
  type DomainError,
  type Result,
  type TicketId,
  type TicketView,
} from '../domain';
import { buildAuditLog, type AuditEntry } from './auditLog';
import type { Clock, EventStoreRepository, StoredEvent } from './ports';

export type TicketDetails = {
  readonly ticket: TicketView;
  /** Flux complet de l'agrégat : permet l'historique et le « voyage dans le temps ». */
  readonly history: readonly AuditEntry[];
};

/** Use cases de lecture (Queries) : de simples projections du journal d'événements. */
export const makeTicketQueries = ({ eventStore, clock }: { readonly eventStore: EventStoreRepository; readonly clock: Clock }) => {
  const allEvents = async () => (await eventStore.readAll()).map((s: StoredEvent) => s.event);

  return {
    listActiveTickets: async (): Promise<readonly TicketView[]> => projectActiveTickets(await allEvents(), clock()),

    getTicket: async (ticketId: TicketId): Promise<Result<DomainError, TicketDetails>> => {
      const stored = await eventStore.readAll();
      const ticket = projectTickets(
        stored.map((s) => s.event),
        clock(),
      ).find((t) => t.id === ticketId);
      if (!ticket) return err(DomainErrors.notFound(ticketId));
      const history = buildAuditLog(stored).filter((e) => e.ticketId === ticketId);
      return ok({ ticket, history });
    },

    getDashboard: async () => computeDashboard(await allEvents(), clock()),

    getAuditLog: async (): Promise<readonly AuditEntry[]> => buildAuditLog(await eventStore.readAll()),

    verifyIntegrity: () => eventStore.verifyIntegrity(),
  };
};

export type TicketQueries = ReturnType<typeof makeTicketQueries>;
