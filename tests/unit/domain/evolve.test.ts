import { describe, expect, it } from 'vitest';
import { evolve, initialState, rehydrate } from '../../../src/domain';
import { AGENT, ev, T } from '../../helpers/fixtures';

describe('evolve / rehydrate', () => {
  it('EVO-01 TicketCreated ⇒ ticket OPEN, version 1, non assigné', () => {
    const s = rehydrate([ev.created()]);
    expect(s).toEqual({
      kind: 'Active',
      ticket: {
        id: 't1',
        title: 'Imprimante HS',
        description: '2e étage',
        priority: 'HIGH',
        category: 'HARDWARE',
        status: 'OPEN',
        requester: 'Claire',
        assignee: null,
        tags: [],
        comments: [],
        createdBy: AGENT,
        createdAt: T(0),
        updatedAt: T(0),
        resolvedAt: null,
        version: 1,
      },
    });
  });

  it('EVO-02 reconstitue l’état courant par rejeu complet', () => {
    const s = rehydrate([
      ev.created(),
      ev.assigned('Lucas', T(1)),
      ev.updated({ status: 'IN_PROGRESS' }, T(2)),
      ev.commented('Je regarde', false, T(3)),
      ev.updated({ description: 'Toner vide', tags: ['toner'] }, T(4)),
    ]);
    expect(s.kind === 'Active' && s.ticket).toMatchObject({
      assignee: 'Lucas',
      status: 'IN_PROGRESS',
      description: 'Toner vide',
      tags: ['toner'],
      comments: [{ body: 'Je regarde', author: AGENT, internal: false, createdAt: T(3) }],
      updatedAt: T(4),
      version: 5,
    });
  });

  it('EVO-03 resolvedAt est posé au passage RESOLVED, conservé à la fermeture, effacé à la réouverture', () => {
    const resolved = rehydrate([ev.created(), ev.updated({ status: 'RESOLVED' }, T(2))]);
    expect(resolved.kind === 'Active' && resolved.ticket.resolvedAt).toBe(T(2));

    const closed = rehydrate([ev.created(), ev.updated({ status: 'RESOLVED' }, T(2)), ev.updated({ status: 'CLOSED' }, T(5))]);
    expect(closed.kind === 'Active' && closed.ticket.resolvedAt).toBe(T(2));

    const reopened = rehydrate([ev.created(), ev.updated({ status: 'RESOLVED' }, T(2)), ev.updated({ status: 'OPEN' }, T(3))]);
    expect(reopened.kind === 'Active' && reopened.ticket.resolvedAt).toBeNull();
  });

  it('EVO-04 une modification de priorité ne touche pas resolvedAt', () => {
    const s = rehydrate([ev.created(), ev.updated({ status: 'RESOLVED' }, T(2)), ev.updated({ priority: 'LOW' }, T(3))]);
    expect(s.kind === 'Active' && s.ticket.resolvedAt).toBe(T(2));
  });

  it('EVO-05 TicketDeleted ⇒ état Deleted (ticket conservé, date et auteur)', () => {
    const s = rehydrate([ev.created(), ev.deleted(T(2))]);
    expect(s).toMatchObject({ kind: 'Deleted', deletedAt: T(2), deletedBy: AGENT, ticket: { title: 'Imprimante HS', version: 2 } });
  });

  it('EVO-06 les événements sur un ticket inexistant ou supprimé sont ignorés (robustesse)', () => {
    expect(evolve(initialState, ev.updated({ status: 'OPEN' }))).toBe(initialState);
    const deleted = rehydrate([ev.created(), ev.deleted()]);
    expect(evolve(deleted, ev.commented('x'))).toBe(deleted);
  });

  it('EVO-07 pureté : ni l’état ni l’événement ne sont modifiés', () => {
    const before = Object.freeze(rehydrate([ev.created()]));
    const event = Object.freeze(ev.updated({ status: 'RESOLVED' }));
    expect(() => evolve(before, event)).not.toThrow();
    expect(before.kind === 'Active' && before.ticket.status).toBe('OPEN');
  });

  it('EVO-08 rétro-compatibilité : un ancien TicketCreated sans catégorie ni tags est relu', () => {
    const legacy = { type: 'TicketCreated', ticketId: 'old', occurredAt: T(0), actor: 'x', payload: { title: 'Ancien', description: '', priority: 'LOW' } };
    const s = rehydrate([legacy as never]);
    expect(s.kind === 'Active' && s.ticket).toMatchObject({ category: 'OTHER', tags: [], requester: 'x' });
  });
});
