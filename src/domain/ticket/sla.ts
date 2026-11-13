import type { Priority, Ticket, Timestamp } from './types';

/** Délai de résolution cible par priorité (heures). */
export const SLA_TARGET_HOURS: Readonly<Record<Priority, number>> = { HIGH: 4, MEDIUM: 24, LOW: 72 };

/** En dessous de cette fraction du délai restant, le ticket est « à risque ». */
export const SLA_AT_RISK_RATIO = 0.25;

export type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET' | 'MISSED';

export type Sla = {
  readonly targetHours: number;
  readonly dueAt: Timestamp;
  readonly status: SlaStatus;
  /** Temps restant avant échéance (négatif si dépassé) ; pour un ticket résolu, marge à la résolution. */
  readonly remainingMs: number;
};

const HOUR = 3_600_000;

/** Calcul pur de l'engagement de service d'un ticket à un instant donné. */
export const computeSla = (ticket: Pick<Ticket, 'priority' | 'createdAt' | 'resolvedAt'>, now: Timestamp): Sla => {
  const targetHours = SLA_TARGET_HOURS[ticket.priority];
  const due = Date.parse(ticket.createdAt) + targetHours * HOUR;
  const dueAt = new Date(due).toISOString();

  if (ticket.resolvedAt !== null) {
    const margin = due - Date.parse(ticket.resolvedAt);
    return { targetHours, dueAt, remainingMs: margin, status: margin >= 0 ? 'MET' : 'MISSED' };
  }

  const remainingMs = due - Date.parse(now);
  const status: SlaStatus =
    remainingMs < 0 ? 'BREACHED' : remainingMs < targetHours * HOUR * SLA_AT_RISK_RATIO ? 'AT_RISK' : 'ON_TRACK';
  return { targetHours, dueAt, remainingMs, status };
};
