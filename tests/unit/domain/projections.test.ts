import { describe, expect, it } from 'vitest';
import { computeDashboard, formatReference, groupByTicket, projectActiveTickets, projectTickets } from '../../../src/domain';
import { ev, T } from '../../helpers/fixtures';

describe('projectTickets / projectActiveTickets', () => {
  const log = [
    ev.created('a', T(0)),
    ev.created('b', T(1), { priority: 'LOW' }),
    ev.created('c', T(2)),
    ev.updated({ status: 'IN_PROGRESS' }, T(3), 'a'),
    ev.deleted(T(4), 'b'),
  ];

  it('PRJ-01 références lisibles stables selon l’ordre de création', () => {
    expect(projectTickets(log, T(5)).map((t) => [t.id, t.reference])).toEqual([
      ['a', 'HD-0001'],
      ['b', 'HD-0002'],
      ['c', 'HD-0003'],
    ]);
    expect(formatReference(42)).toBe('HD-0042');
  });

  it('PRJ-02 la projection globale inclut les supprimés (marqués)', () => {
    const b = projectTickets(log, T(5)).find((t) => t.id === 'b')!;
    expect(b).toMatchObject({ deleted: true, deletedAt: T(4) });
  });

  it('PRJ-03 la vue active exclut les supprimés et trie par dernière activité', () => {
    expect(projectActiveTickets(log, T(5)).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('PRJ-04 chaque ticket projeté porte son SLA calculé à l’instant demandé', () => {
    const [a] = projectActiveTickets(log, T(5));
    expect(a!.sla).toMatchObject({ status: 'BREACHED', dueAt: T(4) });
  });

  it('PRJ-05 groupByTicket conserve l’ordre des événements de chaque flux', () => {
    const streams = groupByTicket(log);
    expect(streams.get('a')!.map((e) => e.type)).toEqual(['TicketCreated', 'TicketUpdated']);
    expect([...streams.keys()]).toEqual(['a', 'b', 'c']);
  });

  it('PRJ-06 un journal vide donne une projection vide', () => {
    expect(projectActiveTickets([], T(0))).toEqual([]);
  });
});

describe('computeDashboard', () => {
  const now = T(30);
  const log = [
    ev.created('a', T(0), { priority: 'HIGH', category: 'NETWORK' }), // dépassé (échéance T4)
    ev.created('b', T(10), { priority: 'MEDIUM', category: 'SOFTWARE' }),
    ev.assigned('Lucas', T(10), 'b'),
    ev.created('c', T(1), { priority: 'HIGH' }),
    ev.updated({ status: 'RESOLVED' }, T(3), 'c'), // résolu en 2 h : SLA respecté
    ev.created('d', T(2), { priority: 'HIGH' }),
    ev.updated({ status: 'CLOSED' }, T(8), 'd'), // résolu en 6 h : SLA manqué
    ev.created('e', T(2)),
    ev.deleted(T(3), 'e'), // ignoré
  ];
  const stats = computeDashboard(log, now);

  it('DSH-01 totaux de la file (OPEN + IN_PROGRESS), hors supprimés', () => {
    // b (MEDIUM, échéance T34) : il reste 4 h < 25 % de 24 h ⇒ à risque.
    expect(stats.totals).toEqual({ active: 4, backlog: 2, unassigned: 1, breached: 1, atRisk: 1, resolvedLast7Days: 2 });
  });

  it('DSH-02 répartitions par statut, priorité et catégorie', () => {
    expect(stats.byStatus).toEqual({ OPEN: 2, IN_PROGRESS: 0, RESOLVED: 1, CLOSED: 1 });
    expect(stats.byPriority).toEqual({ HIGH: 1, MEDIUM: 1, LOW: 0 });
    expect(stats.byCategory).toMatchObject({ NETWORK: 1, SOFTWARE: 1, HARDWARE: 0 });
  });

  it('DSH-03 temps moyen de résolution et taux de respect des SLA', () => {
    expect(stats.avgResolutionHours).toBe(4); // (2 + 6) / 2
    expect(stats.slaCompliance).toBe(0.5);
  });

  it('DSH-04 charge par agent, non assignés compris', () => {
    expect(stats.workload).toEqual(expect.arrayContaining([{ assignee: 'Lucas', count: 1 }, { assignee: null, count: 1 }]));
  });

  it('DSH-05 tendance sur 14 jours glissants', () => {
    expect(stats.trend).toHaveLength(14);
    expect(stats.trend.at(-1)!.date).toBe(now.slice(0, 10));
    const total = stats.trend.reduce((s, p) => s + p.created, 0);
    expect(total).toBe(4);
  });

  it('DSH-06 « À traiter en priorité » : la file triée par échéance', () => {
    expect(stats.attention.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('DSH-07 sans ticket résolu, les indicateurs de résolution sont null', () => {
    const empty = computeDashboard([ev.created()], T(1));
    expect(empty.avgResolutionHours).toBeNull();
    expect(empty.slaCompliance).toBeNull();
  });
});
