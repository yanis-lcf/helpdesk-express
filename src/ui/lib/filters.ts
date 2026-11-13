import type { Category, Priority, Status } from '../../domain';
import type { TicketDto } from './api';

export type TicketFilters = {
  readonly search: string;
  readonly view: ViewId;
  readonly category: Category | 'ALL';
  readonly assignee: string | 'ALL' | 'UNASSIGNED';
};

export type SortKey = 'updated' | 'created' | 'priority' | 'sla';

export const VIEWS = [
  { id: 'open', label: 'En file' },
  { id: 'mine', label: 'Mes tickets' },
  { id: 'unassigned', label: 'Non assignés' },
  { id: 'sla', label: 'SLA en danger' },
  { id: 'high', label: 'Haute priorité' },
  { id: 'resolved', label: 'Résolus & fermés' },
  { id: 'all', label: 'Tous' },
] as const;
export type ViewId = (typeof VIEWS)[number]['id'];

export const DEFAULT_FILTERS: TicketFilters = { search: '', view: 'open', category: 'ALL', assignee: 'ALL' };

const BACKLOG: readonly Status[] = ['OPEN', 'IN_PROGRESS'];
const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Prédicat d'une vue enregistrée. */
export const matchesView = (t: TicketDto, view: ViewId, me: string): boolean => {
  switch (view) {
    case 'open':
      return BACKLOG.includes(t.status);
    case 'mine':
      return t.assignee === me && BACKLOG.includes(t.status);
    case 'unassigned':
      return t.assignee === null && BACKLOG.includes(t.status);
    case 'sla':
      return BACKLOG.includes(t.status) && (t.sla.status === 'AT_RISK' || t.sla.status === 'BREACHED');
    case 'high':
      return t.priority === 'HIGH' && BACKLOG.includes(t.status);
    case 'resolved':
      return t.status === 'RESOLVED' || t.status === 'CLOSED';
    case 'all':
      return true;
  }
};

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Recherche plein texte (insensible aux accents) : référence, titre, description, demandeur, étiquettes. */
export const matchesSearch = (t: TicketDto, query: string): boolean => {
  const q = normalize(query.trim());
  if (!q) return true;
  return [t.reference, t.title, t.description, t.requester, t.assignee ?? '', ...t.tags].some((field) =>
    normalize(field).includes(q),
  );
};

export const applyFilters = (tickets: readonly TicketDto[], f: TicketFilters, me: string): TicketDto[] =>
  tickets.filter(
    (t) =>
      matchesView(t, f.view, me) &&
      matchesSearch(t, f.search) &&
      (f.category === 'ALL' || t.category === f.category) &&
      (f.assignee === 'ALL' || (f.assignee === 'UNASSIGNED' ? t.assignee === null : t.assignee === f.assignee)),
  );

export const sortTickets = (tickets: readonly TicketDto[], key: SortKey): TicketDto[] =>
  [...tickets].sort((a, b) => {
    switch (key) {
      case 'updated':
        return b.updatedAt.localeCompare(a.updatedAt);
      case 'created':
        return b.createdAt.localeCompare(a.createdAt);
      case 'priority':
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sla.remainingMs - b.sla.remainingMs;
      case 'sla': {
        // Les tickets résolus (SLA figé) passent après la file active.
        const doneA = a.resolvedAt !== null ? 1 : 0;
        const doneB = b.resolvedAt !== null ? 1 : 0;
        return doneA - doneB || a.sla.remainingMs - b.sla.remainingMs;
      }
    }
  });

export const countByView = (tickets: readonly TicketDto[], me: string): Record<ViewId, number> =>
  Object.fromEntries(VIEWS.map((v) => [v.id, tickets.filter((t) => matchesView(t, v.id, me)).length])) as Record<
    ViewId,
    number
  >;
