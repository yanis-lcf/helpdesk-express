import { describe, expect, it } from 'vitest';
import { computeSla, SLA_TARGET_HOURS } from '../../../src/domain';
import { T } from '../../helpers/fixtures';

const ticket = (priority: 'LOW' | 'MEDIUM' | 'HIGH', resolvedAt: string | null = null) => ({ priority, createdAt: T(0), resolvedAt });

describe('SLA', () => {
  it('SLA-01 cibles par priorité : HIGH 4 h, MEDIUM 24 h, LOW 72 h', () => {
    expect(SLA_TARGET_HOURS).toEqual({ HIGH: 4, MEDIUM: 24, LOW: 72 });
    expect(computeSla(ticket('HIGH'), T(0)).dueAt).toBe(T(4));
  });

  it.each([
    ['HIGH', 1, 'ON_TRACK'],
    ['HIGH', 3.5, 'AT_RISK'], // reste 30 min < 25 % de 4 h
    ['HIGH', 4, 'AT_RISK'], // pile à l'échéance : reste 0
    ['HIGH', 4.01, 'BREACHED'],
    ['MEDIUM', 17, 'ON_TRACK'],
    ['MEDIUM', 19, 'AT_RISK'],
    ['LOW', 80, 'BREACHED'],
  ] as const)('SLA-02 %s après %s h ⇒ %s', (priority, hours, status) => {
    expect(computeSla(ticket(priority), T(hours)).status).toBe(status);
  });

  it('SLA-03 temps restant négatif quand l’échéance est dépassée', () => {
    expect(computeSla(ticket('HIGH'), T(6)).remainingMs).toBe(-2 * 3_600_000);
  });

  it('SLA-04 un ticket résolu à temps est MET, même consulté bien plus tard', () => {
    expect(computeSla(ticket('HIGH', T(3)), T(100))).toMatchObject({ status: 'MET', remainingMs: 3_600_000 });
  });

  it('SLA-05 un ticket résolu en retard est MISSED', () => {
    expect(computeSla(ticket('HIGH', T(5)), T(5)).status).toBe('MISSED');
  });
});
