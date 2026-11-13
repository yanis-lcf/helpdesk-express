import { describe, expect, it, vi } from 'vitest';
import type { EventStoreRepository } from '../../../src/application';
import { AGENT, newTicket, OTHER, setupApp } from '../../helpers/fixtures';

const created = async (app = setupApp()) => {
  const r = await app.commands.createTicket(newTicket, AGENT);
  if (!r.ok) throw new Error('setup');
  return { app, ticketId: r.value.ticketId };
};

describe('Use cases – commandes', () => {
  it('APP-01 createTicket écrit TicketCreated attribué à l’acteur et renvoie l’état', async () => {
    const app = setupApp();
    const r = await app.commands.createTicket(newTicket, AGENT);
    expect(r.ok && r.value.ticket).toMatchObject({ title: 'VPN KO', status: 'OPEN', createdBy: AGENT, requester: AGENT });
    const [stored] = await app.eventStore.readAll();
    expect(stored!.event).toMatchObject({ type: 'TicketCreated', actor: AGENT });
  });

  it('APP-02 createTicket avec assignation produit 2 événements distincts', async () => {
    const app = setupApp();
    const r = await app.commands.createTicket({ ...newTicket, assignee: OTHER }, AGENT);
    expect(r.ok && r.value.events.map((e) => e.type)).toEqual(['TicketCreated', 'TicketAssigned']);
    expect(r.ok && r.value.ticket?.assignee).toBe(OTHER);
  });

  it('APP-03 une commande refusée n’écrit AUCUN événement', async () => {
    const app = setupApp();
    const r = await app.commands.createTicket({ ...newTicket, title: ' ' }, AGENT);
    expect(r.ok).toBe(false);
    expect(await app.eventStore.readAll()).toHaveLength(0);
  });

  it('APP-04 cycle de vie complet : assigner, commenter, résoudre, fermer', async () => {
    const { app, ticketId } = await created();
    expect((await app.commands.assignTicket({ ticketId, assignee: OTHER }, AGENT)).ok).toBe(true);
    expect((await app.commands.commentTicket({ ticketId, body: 'Pris en charge', internal: false }, OTHER)).ok).toBe(true);
    expect((await app.commands.updateTicket({ ticketId, changes: { status: 'RESOLVED' } }, OTHER)).ok).toBe(true);
    const closed = await app.commands.updateTicket({ ticketId, changes: { status: 'CLOSED' } }, OTHER);
    expect(closed.ok && closed.value.ticket).toMatchObject({ status: 'CLOSED', assignee: OTHER, version: 5 });
    expect(closed.ok && closed.value.ticket?.comments[0]).toMatchObject({ author: OTHER, body: 'Pris en charge' });
  });

  it('APP-05 un ticket fermé refuse toute modification, assignation et commentaire', async () => {
    const { app, ticketId } = await created();
    await app.commands.updateTicket({ ticketId, changes: { status: 'CLOSED' } }, AGENT);
    const results = await Promise.all([
      app.commands.updateTicket({ ticketId, changes: { priority: 'HIGH' } }, AGENT),
      app.commands.assignTicket({ ticketId, assignee: OTHER }, AGENT),
      app.commands.commentTicket({ ticketId, body: 'x', internal: false }, AGENT),
    ]);
    expect(results.map((r) => !r.ok && r.error.code)).toEqual(['TICKET_CLOSED', 'TICKET_CLOSED', 'TICKET_CLOSED']);
    expect(await app.eventStore.readAll()).toHaveLength(2);
  });

  it('APP-06 suppression logique : le ticket disparaît de la vue active, l’historique reste', async () => {
    const { app, ticketId } = await created();
    const r = await app.commands.deleteTicket({ ticketId }, AGENT);
    expect(r.ok && r.value.ticket).toBeNull();
    expect(await app.queries.listActiveTickets()).toEqual([]);
    expect(await app.eventStore.readStream(ticketId)).toHaveLength(2);
  });

  it('APP-07 chaque commentaire reçoit un identifiant unique', async () => {
    const { app, ticketId } = await created();
    await app.commands.commentTicket({ ticketId, body: 'a', internal: false }, AGENT);
    const r = await app.commands.commentTicket({ ticketId, body: 'b', internal: true }, AGENT);
    const ids = r.ok ? r.value.ticket!.comments.map((c) => c.id) : [];
    expect(new Set(ids).size).toBe(2);
  });

  it('APP-08 un conflit de concurrence est remonté tel quel (sans écriture)', async () => {
    const { app, ticketId } = await created();
    const conflicting: EventStoreRepository = {
      ...app.eventStore,
      append: vi.fn(async () => ({ ok: false as const, error: { code: 'CONCURRENCY_CONFLICT' as const, ticketId, expectedVersion: 1, actualVersion: 2 } })),
    };
    const other = setupApp(conflicting);
    const r = await other.commands.updateTicket({ ticketId, changes: { status: 'RESOLVED' } }, AGENT);
    expect(!r.ok && r.error.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('APP-09 la commande transmet la version attendue (= longueur du flux) à l’Event Store', async () => {
    const { app, ticketId } = await created();
    const spy = vi.spyOn(app.eventStore, 'append');
    await app.commands.updateTicket({ ticketId, changes: { status: 'IN_PROGRESS' } }, AGENT);
    expect(spy).toHaveBeenCalledWith(ticketId, 1, expect.any(Array));
  });

  it('APP-10 l’horloge injectée date les événements (déterminisme)', async () => {
    const app = setupApp();
    app.advance(3);
    const r = await app.commands.createTicket(newTicket, AGENT);
    expect(r.ok && r.value.events[0]!.occurredAt).toBe('2026-01-05T11:00:00.000Z');
  });

  it('APP-11 deux mises à jour concurrentes sur le même ticket : une seule passe', async () => {
    const { app, ticketId } = await created();
    const store = app.eventStore;
    // On force l'entrelacement : les deux commandes lisent le flux AVANT toute écriture.
    const readStream = store.readStream.bind(store);
    let reads = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const racy: EventStoreRepository = {
      ...store,
      readStream: async (id) => {
        const s = await readStream(id);
        if (++reads === 2) release();
        await gate;
        return s;
      },
    };
    const racing = setupApp(racy);
    const [a, b] = await Promise.all([
      racing.commands.updateTicket({ ticketId, changes: { status: 'IN_PROGRESS' } }, AGENT),
      racing.commands.updateTicket({ ticketId, changes: { priority: 'HIGH' } }, OTHER),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect((await store.readStream(ticketId)).length).toBe(2);
  });
});
