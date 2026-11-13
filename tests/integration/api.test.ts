import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { TEAM } from '../../src/infrastructure/config/team';
import { createAppRouter, createCallerFactory } from '../../src/infrastructure/trpc/router';
import { AGENT, OTHER, setupApp } from '../helpers/fixtures';

const setup = () => {
  const app = setupApp();
  const router = createAppRouter({ commands: app.commands, queries: app.queries, team: TEAM });
  const as = (actor: string) => createCallerFactory(router)({ actor });
  return { app, api: as(AGENT), as };
};

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as TRPCError & { domainCode?: string };
  }
  throw new Error('La procédure aurait dû échouer');
};

describe('API tRPC (intégration routeur → use cases → Event Store)', () => {
  it('API-01 tickets.create applique les valeurs par défaut et l’acteur du contexte', async () => {
    const { api } = setup();
    const r = await api.tickets.create({ title: 'Écran noir', priority: 'LOW' });
    expect(r.ticket).toMatchObject({ category: 'OTHER', description: '', createdBy: AGENT, requester: AGENT });
  });

  it('API-02 validation de forme (zod) : priorité inconnue ⇒ BAD_REQUEST', async () => {
    const { api } = setup();
    const e = await failure(api.tickets.create({ title: 'x', priority: 'URGENT' as never }));
    expect(e.code).toBe('BAD_REQUEST');
  });

  it('API-03 erreur métier : message en français + code HTTP adapté', async () => {
    const { api } = setup();
    const e = await failure(api.tickets.create({ title: '   ', priority: 'LOW' }));
    expect(e).toMatchObject({ code: 'BAD_REQUEST', message: 'Le titre est obligatoire.', domainCode: 'VALIDATION' });
  });

  it.each([
    ['ticket inconnu', 'NOT_FOUND', 'TICKET_NOT_FOUND'],
    ['ticket fermé', 'PRECONDITION_FAILED', 'TICKET_CLOSED'],
    ['ticket supprimé', 'PRECONDITION_FAILED', 'TICKET_DELETED'],
  ])('API-04 %s ⇒ %s', async (label, httpCode, domainCode) => {
    const { api } = setup();
    const { ticketId } = await api.tickets.create({ title: 'x', priority: 'LOW' });
    if (label === 'ticket fermé') await api.tickets.update({ ticketId, changes: { status: 'CLOSED' } });
    if (label === 'ticket supprimé') await api.tickets.delete({ ticketId });
    const target = label === 'ticket inconnu' ? 'inconnu' : ticketId;
    const e = await failure(api.tickets.update({ ticketId: target, changes: { priority: 'HIGH' } }));
    expect(e).toMatchObject({ code: httpCode, domainCode });
  });

  it('API-05 parcours complet multi-agents, visible dans l’audit et le tableau de bord', async () => {
    const { api, as } = setup();
    const { ticketId } = await api.tickets.create({ title: 'VPN', priority: 'HIGH', category: 'NETWORK', tags: ['VPN'] });
    await api.tickets.assign({ ticketId, assignee: OTHER });
    await as(OTHER).tickets.comment({ ticketId, body: 'Je regarde', internal: false });
    await as(OTHER).tickets.update({ ticketId, changes: { status: 'RESOLVED' } });

    const details = await api.tickets.byId({ ticketId });
    expect(details.ticket).toMatchObject({ status: 'RESOLVED', assignee: OTHER, tags: ['vpn'], reference: 'HD-0001' });
    expect(details.history.map((h) => h.actor)).toEqual([AGENT, AGENT, OTHER, OTHER]);

    const stats = await api.dashboard.stats();
    expect(stats.totals.resolvedLast7Days).toBe(1);
    expect(await api.events.verifyIntegrity()).toMatchObject({ valid: true, checkedEvents: 4 });
    expect(await api.events.auditLog()).toHaveLength(4);
  });

  it('API-06 tickets.byId sur un ID inconnu ⇒ NOT_FOUND', async () => {
    const { api } = setup();
    expect((await failure(api.tickets.byId({ ticketId: 'x' }))).code).toBe('NOT_FOUND');
  });

  it('API-07 meta.team expose l’équipe configurée', async () => {
    const { api } = setup();
    expect((await api.meta.team()).map((m) => m.name)).toContain('Yanis Loucif');
  });

  it('API-08 tickets.listActive ne renvoie pas les tickets supprimés', async () => {
    const { api } = setup();
    const a = await api.tickets.create({ title: 'A', priority: 'LOW' });
    await api.tickets.create({ title: 'B', priority: 'LOW' });
    await api.tickets.delete({ ticketId: a.ticketId });
    expect((await api.tickets.listActive()).map((t) => t.title)).toEqual(['B']);
  });

  it('API-09 entrées surdimensionnées rejetées dès la frontière', async () => {
    const { api } = setup();
    expect((await failure(api.tickets.create({ title: 'x'.repeat(500), priority: 'LOW' }))).code).toBe('BAD_REQUEST');
    expect((await failure(api.tickets.create({ title: 'x', priority: 'LOW', tags: Array(20).fill('a') }))).code).toBe('BAD_REQUEST');
  });
});
