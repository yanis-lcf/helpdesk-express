import { projectTickets, type TicketView } from './projections';
import {
  CATEGORIES,
  isBacklogStatus,
  PRIORITIES,
  STATUSES,
  type Category,
  type Priority,
  type Status,
  type TicketEvent,
  type Timestamp,
} from './types';

export type TrendPoint = { readonly date: string; readonly created: number; readonly resolved: number };

export type DashboardStats = {
  readonly totals: {
    readonly active: number;
    readonly backlog: number;
    readonly unassigned: number;
    readonly breached: number;
    readonly atRisk: number;
    readonly resolvedLast7Days: number;
  };
  readonly byStatus: Readonly<Record<Status, number>>;
  /** Répartitions calculées sur la file (OPEN + IN_PROGRESS). */
  readonly byPriority: Readonly<Record<Priority, number>>;
  readonly byCategory: Readonly<Record<Category, number>>;
  readonly workload: readonly { readonly assignee: string | null; readonly count: number }[];
  readonly avgResolutionHours: number | null;
  /** Part des tickets résolus dans les délais (0..1), null si aucun ticket résolu. */
  readonly slaCompliance: number | null;
  readonly trend: readonly TrendPoint[];
  /** Tickets de la file les plus proches de leur échéance. */
  readonly attention: readonly TicketView[];
  /** Satisfaction des demandeurs (CSAT). */
  readonly satisfaction: SatisfactionStats;
};

export type SatisfactionStats = {
  /** Nombre d'évaluations reçues. */
  readonly responses: number;
  /** Note moyenne sur 5 (null sans évaluation). */
  readonly average: number | null;
  /** CSAT : part des notes 4 ou 5 (0..1), null sans évaluation. */
  readonly csat: number | null;
  readonly distribution: Readonly<Record<1 | 2 | 3 | 4 | 5, number>>;
  /** Derniers avis commentés, du plus récent au plus ancien. */
  readonly recent: readonly {
    readonly ticketId: string;
    readonly reference: string;
    readonly title: string;
    readonly rating: number;
    readonly comment: string;
    readonly ratedBy: string;
    readonly ratedAt: Timestamp;
  }[];
};

/** Indicateurs de satisfaction calculés à partir des tickets évalués. */
export const computeSatisfaction = (tickets: readonly TicketView[]): SatisfactionStats => {
  const rated = tickets.filter((t) => t.satisfaction !== null);
  const ratings = rated.map((t) => t.satisfaction!.rating);
  return {
    responses: rated.length,
    average: ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
    csat: ratings.length ? ratings.filter((r) => r >= 4).length / ratings.length : null,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, ratings.filter((r) => r === n).length])) },
    recent: rated
      .filter((t) => t.satisfaction!.comment.length > 0)
      .sort((a, b) => b.satisfaction!.ratedAt.localeCompare(a.satisfaction!.ratedAt))
      .slice(0, 5)
      .map((t) => ({
        ticketId: t.id,
        reference: t.reference,
        title: t.title,
        rating: t.satisfaction!.rating,
        comment: t.satisfaction!.comment,
        ratedBy: t.satisfaction!.ratedBy,
        ratedAt: t.satisfaction!.ratedAt,
      })),
  };
};

const DAY = 86_400_000;
const countBy = <K extends string>(keys: readonly K[], items: readonly { key: K }[]): Record<K, number> =>
  Object.fromEntries(keys.map((k) => [k, items.filter((i) => i.key === k).length])) as Record<K, number>;

const dayOf = (iso: Timestamp) => iso.slice(0, 10);

/** Projection pure du tableau de bord à l'instant `now`. */
export const computeDashboard = (events: readonly TicketEvent[], now: Timestamp, trendDays = 14): DashboardStats => {
  const active = projectTickets(events, now).filter((t) => !t.deleted);
  const backlog = active.filter((t) => isBacklogStatus(t.status));
  const resolved = active.filter((t) => t.resolvedAt !== null);
  const nowMs = Date.parse(now);

  const resolutionHours = resolved.map(
    (t) => (Date.parse(t.resolvedAt as string) - Date.parse(t.createdAt)) / 3_600_000,
  );

  const workloadMap = backlog.reduce(
    (acc, t) => acc.set(t.assignee, (acc.get(t.assignee) ?? 0) + 1),
    new Map<string | null, number>(),
  );

  const days = Array.from({ length: trendDays }, (_, i) => dayOf(new Date(nowMs - (trendDays - 1 - i) * DAY).toISOString()));

  return {
    totals: {
      active: active.length,
      backlog: backlog.length,
      unassigned: backlog.filter((t) => t.assignee === null).length,
      breached: backlog.filter((t) => t.sla.status === 'BREACHED').length,
      atRisk: backlog.filter((t) => t.sla.status === 'AT_RISK').length,
      resolvedLast7Days: resolved.filter((t) => nowMs - Date.parse(t.resolvedAt as string) <= 7 * DAY).length,
    },
    byStatus: countBy(STATUSES, active.map((t) => ({ key: t.status }))),
    byPriority: countBy(PRIORITIES, backlog.map((t) => ({ key: t.priority }))),
    byCategory: countBy(CATEGORIES, backlog.map((t) => ({ key: t.category }))),
    workload: [...workloadMap]
      .map(([assignee, count]) => ({ assignee, count }))
      .sort((a, b) => b.count - a.count),
    avgResolutionHours: resolutionHours.length
      ? resolutionHours.reduce((s, h) => s + h, 0) / resolutionHours.length
      : null,
    slaCompliance: resolved.length
      ? resolved.filter((t) => t.sla.status === 'MET').length / resolved.length
      : null,
    trend: days.map((date) => ({
      date,
      created: active.filter((t) => dayOf(t.createdAt) === date).length,
      resolved: resolved.filter((t) => dayOf(t.resolvedAt as string) === date).length,
    })),
    attention: [...backlog].sort((a, b) => a.sla.remainingMs - b.sla.remainingMs).slice(0, 5),
    satisfaction: computeSatisfaction(active),
  };
};
