import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import type { User } from '../../src/domain';
import { createRateLimiter } from '../../src/infrastructure/security/session';
import { createAppRouter, createCallerFactory, type Context } from '../../src/infrastructure/trpc/router';
import { AGENT, OTHER, PASSWORD, setupApp, USERS } from '../helpers/fixtures';

const setup = async () => {
  const app = setupApp();
  await app.seedUsers();
  const router = createAppRouter({
    commands: app.commands,
    queries: app.queries,
    portal: app.portal,
    identity: app.identity,
    loginLimiter: createRateLimiter({ max: 3, windowMs: 60_000 }),
  });
  const sessions: { opened: string[]; closed: number } = { opened: [], closed: 0 };
  const context = (user: User | null): Context => ({
    user,
    clientKey: 'test',
    session: { open: (id) => sessions.opened.push(id), close: () => sessions.closed++ },
  });
  const as = (user: User | null) => createCallerFactory(router)(context(user));
  return { app, sessions, as, api: as(USERS.agent) };
};

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as TRPCError & { domainCode?: string };
  }
  throw new Error('La procédure aurait dû échouer');
};

describe('API tRPC — back-office (intégration routeur → use cases → Event Store)', () => {
  it('API-01 tickets.create applique les valeurs par défaut et l’utilisateur authentifié comme acteur', async () => {
    const { api } = await setup();
    const r = await api.tickets.create({ title: 'Écran noir', priority: 'LOW' });
    expect(r.ticket).toMatchObject({ category: 'OTHER', description: '', createdBy: AGENT, requester: AGENT, requesterId: null });
  });

  it('API-02 validation de forme (zod) : priorité inconnue ⇒ BAD_REQUEST', async () => {
    const { api } = await setup();
    const e = await failure(api.tickets.create({ title: 'x', priority: 'URGENT' as never }));
    expect(e.code).toBe('BAD_REQUEST');
  });

  it('API-03 erreur métier : message en français + code HTTP adapté', async () => {
    const { api } = await setup();
    const e = await failure(api.tickets.create({ title: '   ', priority: 'LOW' }));
    expect(e).toMatchObject({ code: 'BAD_REQUEST', message: 'Le titre est obligatoire.', domainCode: 'VALIDATION' });
  });

  it.each([
    ['ticket inconnu', 'NOT_FOUND', 'TICKET_NOT_FOUND'],
    ['ticket fermé', 'PRECONDITION_FAILED', 'TICKET_CLOSED'],
    ['ticket supprimé', 'PRECONDITION_FAILED', 'TICKET_DELETED'],
  ])('API-04 %s ⇒ %s', async (label, httpCode, domainCode) => {
    const { api } = await setup();
    const { ticketId } = await api.tickets.create({ title: 'x', priority: 'LOW' });
    if (label === 'ticket fermé') await api.tickets.update({ ticketId, changes: { status: 'CLOSED' } });
    if (label === 'ticket supprimé') await api.tickets.delete({ ticketId });
    const target = label === 'ticket inconnu' ? 'inconnu' : ticketId;
    const e = await failure(api.tickets.update({ ticketId: target, changes: { priority: 'HIGH' } }));
    expect(e).toMatchObject({ code: httpCode, domainCode });
  });

  it('API-05 parcours complet multi-agents, visible dans l’audit et le tableau de bord', async () => {
    const { api, as } = await setup();
    const { ticketId } = await api.tickets.create({ title: 'VPN', priority: 'HIGH', category: 'NETWORK', tags: ['VPN'] });
    await api.tickets.assign({ ticketId, assignee: OTHER });
    await as(USERS.other).tickets.comment({ ticketId, body: 'Je regarde', internal: false });
    await as(USERS.other).tickets.update({ ticketId, changes: { status: 'RESOLVED' } });

    const details = await api.tickets.byId({ ticketId });
    expect(details.ticket).toMatchObject({ status: 'RESOLVED', assignee: OTHER, tags: ['vpn'], reference: 'HD-0001' });
    expect(details.history.map((h) => h.actor)).toEqual([AGENT, AGENT, OTHER, OTHER]);

    const stats = await api.dashboard.stats();
    expect(stats.totals.resolvedLast7Days).toBe(1);
    expect(await api.events.verifyIntegrity()).toMatchObject({ valid: true, checkedEvents: 4 });
    expect(await api.events.auditLog()).toHaveLength(4);
  });

  it('API-06 tickets.byId sur un ID inconnu ⇒ NOT_FOUND', async () => {
    const { api } = await setup();
    expect((await failure(api.tickets.byId({ ticketId: 'x' }))).code).toBe('NOT_FOUND');
  });

  it('API-07 meta.team liste les agents actifs de la DSI (pas les employés)', async () => {
    const { api } = await setup();
    const team = (await api.meta.team()).map((m) => m.name);
    expect(team).toEqual(expect.arrayContaining(['Yanis Loucif', AGENT, OTHER]));
    expect(team).not.toContain(USERS.claire.name);
  });

  it('API-08 tickets.listActive ne renvoie pas les tickets supprimés', async () => {
    const { api } = await setup();
    const a = await api.tickets.create({ title: 'A', priority: 'LOW' });
    await api.tickets.create({ title: 'B', priority: 'LOW' });
    await api.tickets.delete({ ticketId: a.ticketId });
    expect((await api.tickets.listActive()).map((t) => t.title)).toEqual(['B']);
  });

  it('API-09 entrées surdimensionnées rejetées dès la frontière', async () => {
    const { api } = await setup();
    expect((await failure(api.tickets.create({ title: 'x'.repeat(500), priority: 'LOW' }))).code).toBe('BAD_REQUEST');
    expect((await failure(api.tickets.create({ title: 'x', priority: 'LOW', tags: Array(20).fill('a') }))).code).toBe('BAD_REQUEST');
  });

  it('API-10 une demande saisie par la DSI pour un collaborateur apparaît dans SON portail', async () => {
    const { api, as } = await setup();
    await api.tickets.create({ title: 'Badge perdu', priority: 'LOW', requester: 'claire dubois' });
    expect((await as(USERS.claire).portal.myTickets()).map((t) => t.title)).toEqual(['Badge perdu']);
    expect(await as(USERS.marc).portal.myTickets()).toEqual([]);
  });
});

describe('API tRPC — authentification et contrôle d’accès', () => {
  it('AUTH-01 connexion réussie : session ouverte, utilisateur renvoyé sans empreinte de mot de passe', async () => {
    const { as, sessions } = await setup();
    const user = await as(null).auth.login({ email: ' CLAIRE@test.fr ', password: PASSWORD });
    expect(user).toMatchObject({ id: USERS.claire.id, role: 'EMPLOYEE' });
    expect(user).not.toHaveProperty('passwordHash');
    expect(sessions.opened).toEqual([USERS.claire.id]);
  });

  it('AUTH-02 identifiants incorrects ⇒ UNAUTHORIZED avec un message identique (compte existant ou non)', async () => {
    const { as, sessions } = await setup();
    const wrongPassword = await failure(as(null).auth.login({ email: 'claire@test.fr', password: 'mauvais1' }));
    const unknownUser = await failure(as(null).auth.login({ email: 'inconnu@test.fr', password: 'mauvais1' }));
    expect(wrongPassword).toMatchObject({ code: 'UNAUTHORIZED', message: 'E-mail ou mot de passe incorrect.' });
    expect(unknownUser.message).toBe(wrongPassword.message);
    expect(sessions.opened).toEqual([]);
  });

  it('AUTH-03 force brute : au-delà de 3 échecs, même le bon mot de passe est refusé (TOO_MANY_REQUESTS)', async () => {
    const { as } = await setup();
    for (let i = 0; i < 3; i++) await failure(as(null).auth.login({ email: 'claire@test.fr', password: 'mauvais1' }));
    expect((await failure(as(null).auth.login({ email: 'claire@test.fr', password: PASSWORD }))).code).toBe('TOO_MANY_REQUESTS');
  });

  it('AUTH-04 compte désactivé ⇒ connexion refusée', async () => {
    const { as } = await setup();
    await as(USERS.admin).admin.updateUser({ userId: USERS.marc.id, active: false });
    expect((await failure(as(null).auth.login({ email: 'marc@test.fr', password: PASSWORD }))).code).toBe('UNAUTHORIZED');
  });

  it('AUTH-05 déconnexion : la session est fermée ; auth.me renvoie l’utilisateur du contexte', async () => {
    const { as, sessions } = await setup();
    expect(await as(null).auth.me()).toBeNull();
    expect(await as(USERS.claire).auth.me()).toMatchObject({ name: 'Claire Dubois' });
    await as(USERS.claire).auth.logout();
    expect(sessions.closed).toBe(1);
  });

  it('AUTH-06 sans session, toute donnée est refusée (UNAUTHORIZED)', async () => {
    const anonymous = (await setup()).as(null);
    for (const call of [anonymous.tickets.listActive(), anonymous.portal.myTickets(), anonymous.events.auditLog(), anonymous.admin.users()])
      expect((await failure(call)).code).toBe('UNAUTHORIZED');
  });

  it('AUTH-07 un employé n’accède à aucune donnée du back-office (FORBIDDEN)', async () => {
    const employee = (await setup()).as(USERS.claire);
    const calls = [
      employee.tickets.listActive(),
      employee.tickets.byId({ ticketId: 'x' }),
      employee.tickets.update({ ticketId: 'x', changes: { status: 'CLOSED' } }),
      employee.tickets.comment({ ticketId: 'x', body: 'note', internal: true }),
      employee.dashboard.stats(),
      employee.events.auditLog(),
      employee.meta.directory(),
      employee.admin.users(),
    ];
    for (const call of calls) expect((await failure(call)).code).toBe('FORBIDDEN');
  });

  it('AUTH-08 un agent DSI n’accède pas à l’administration des comptes', async () => {
    const agent = (await setup()).as(USERS.agent);
    expect((await failure(agent.admin.users())).code).toBe('FORBIDDEN');
    expect((await failure(agent.admin.updateUser({ userId: USERS.agent.id, role: 'ADMIN' }))).code).toBe('FORBIDDEN');
  });

  it('AUTH-09 administration : création de compte, e-mail unique, auto-rétrogradation interdite', async () => {
    const admin = (await setup()).as(USERS.admin);
    const created = await admin.admin.createUser({ name: 'Julie Bernard', email: 'julie@test.fr', role: 'EMPLOYEE', password: 'bienvenue1' });
    expect(created).toMatchObject({ name: 'Julie Bernard', active: true });
    expect((await failure(admin.admin.createUser({ name: 'Julie B', email: 'JULIE@test.fr', role: 'EMPLOYEE', password: 'bienvenue1' }))).code).toBe('CONFLICT');
    expect((await failure(admin.admin.createUser({ name: 'Faible', email: 'f@test.fr', role: 'EMPLOYEE', password: 'court' }))).message).toMatch(/au moins 8/);
    expect((await failure(admin.admin.updateUser({ userId: USERS.admin.id, role: 'AGENT' }))).domainCode).toBe('SELF_LOCKOUT');
  });
});

describe('API tRPC — portail employé', () => {
  it('POR-API-01 un employé ne voit que ses demandes, sans notes internes ni étiquettes DSI', async () => {
    const { api, as } = await setup();
    const claire = as(USERS.claire);
    const { ticketId } = await claire.portal.submit({ title: 'Imprimante HS' });
    await api.tickets.comment({ ticketId, body: 'Toner fourni par Bureau Vallée', internal: true });
    await api.tickets.comment({ ticketId, body: 'Je passe vous voir à 14 h.', internal: false });
    await api.tickets.update({ ticketId, changes: { tags: ['fournisseur'] } });

    const mine = await claire.portal.ticket({ ticketId });
    expect(mine.comments.map((c) => c.body)).toEqual(['Je passe vous voir à 14 h.']);
    expect(mine).not.toHaveProperty('tags');
    expect((await failure(as(USERS.marc).portal.ticket({ ticketId }))).code).toBe('NOT_FOUND');
  });

  it('POR-API-02 cycle complet : déclaration → résolution DSI → confirmation par l’employé', async () => {
    const { api, as } = await setup();
    const claire = as(USERS.claire);
    const { ticketId } = await claire.portal.submit({ title: 'VPN', priority: 'HIGH', category: 'NETWORK' });
    expect((await failure(claire.portal.confirmResolution({ ticketId }))).code).toBe('FORBIDDEN');
    await api.tickets.update({ ticketId, changes: { status: 'RESOLVED' } });
    expect((await claire.portal.ticket({ ticketId })).actions).toEqual(['REPLY', 'CONFIRM_RESOLUTION', 'REOPEN']);
    await claire.portal.confirmResolution({ ticketId });
    expect((await api.tickets.byId({ ticketId })).ticket.status).toBe('CLOSED');
    expect((await failure(claire.portal.reply({ ticketId, body: 'Encore moi' }))).code).toBe('PRECONDITION_FAILED');
  });
});
