import { describe, expect, it } from 'vitest';
import { buildAuditLog } from '../../../src/application';
import { AGENT, newTicket, OTHER, setupApp } from '../../helpers/fixtures';

const scenario = async () => {
  const app = setupApp();
  const r = await app.commands.createTicket({ ...newTicket, tags: ['vpn'] }, AGENT);
  if (!r.ok) throw new Error('setup');
  const ticketId = r.value.ticketId;
  app.advance(1);
  await app.commands.assignTicket({ ticketId, assignee: OTHER }, AGENT);
  app.advance(1);
  await app.commands.updateTicket({ ticketId, changes: { status: 'IN_PROGRESS', priority: 'HIGH' } }, OTHER);
  await app.commands.commentTicket({ ticketId, body: 'Note', internal: true }, OTHER);
  app.advance(1);
  await app.commands.deleteTicket({ ticketId }, AGENT);
  return { app, ticketId };
};

describe('Use cases – requêtes', () => {
  it('QRY-01 getTicket renvoie l’état + l’historique complet, même supprimé', async () => {
    const { app, ticketId } = await scenario();
    const r = await app.queries.getTicket(ticketId);
    expect(r.ok && r.value.ticket).toMatchObject({ deleted: true, reference: 'HD-0001', priority: 'HIGH' });
    expect(r.ok && r.value.history.map((e) => e.type)).toEqual([
      'TicketCreated',
      'TicketAssigned',
      'TicketUpdated',
      'TicketCommented',
      'TicketDeleted',
    ]);
  });

  it('QRY-02 getTicket sur un ID inconnu ⇒ TICKET_NOT_FOUND', async () => {
    const r = await setupApp().queries.getTicket('nope');
    expect(!r.ok && r.error.code).toBe('TICKET_NOT_FOUND');
  });

  it('QRY-03 le journal d’audit est chronologique, attribué et chaîné', async () => {
    const { app } = await scenario();
    const log = await app.queries.getAuditLog();
    expect(log.map((e) => e.position)).toEqual([1, 2, 3, 4, 5]);
    expect(log.map((e) => e.actor)).toEqual([AGENT, AGENT, OTHER, OTHER, AGENT]);
    log.slice(1).forEach((e, i) => expect(e.previousHash).toBe(log[i]!.hash));
  });

  it('QRY-04 l’audit détaille « avant → après » pour chaque événement', async () => {
    const { app } = await scenario();
    const [created, assigned, updated, commented, deleted] = await app.queries.getAuditLog();
    expect(created!.changes.map((c) => c.field)).toEqual(['title', 'description', 'priority', 'category', 'status', 'requester', 'tags']);
    expect(assigned!.changes).toEqual([{ field: 'assignee', before: null, after: OTHER }]);
    expect(updated!.changes).toEqual([
      { field: 'priority', before: 'MEDIUM', after: 'HIGH' },
      { field: 'status', before: 'OPEN', after: 'IN_PROGRESS' },
    ]);
    expect(commented!.changes).toEqual([{ field: 'internalNote', before: null, after: 'Note' }]);
    expect(deleted!.changes).toEqual([{ field: 'deleted', before: null, after: 'oui' }]);
  });

  it('QRY-05 buildAuditLog trie par position même si le support renvoie le désordre', async () => {
    const { app } = await scenario();
    const stored = [...(await app.eventStore.readAll())].reverse();
    expect(buildAuditLog(stored).map((e) => e.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it('QRY-06 le tableau de bord est calculé à l’heure de l’horloge injectée', async () => {
    const app = setupApp();
    await app.commands.createTicket({ ...newTicket, priority: 'HIGH' }, AGENT);
    expect((await app.queries.getDashboard()).totals.breached).toBe(0);
    app.advance(5);
    expect((await app.queries.getDashboard()).totals.breached).toBe(1);
  });

  it('QRY-07 verifyIntegrity délègue à l’Event Store', async () => {
    const { app } = await scenario();
    expect(await app.queries.verifyIntegrity()).toMatchObject({ valid: true, checkedEvents: 5 });
  });
});
