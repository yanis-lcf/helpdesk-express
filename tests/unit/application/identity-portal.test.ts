import { describe, expect, it } from 'vitest';
import { PASSWORD, setupApp, USERS } from '../../helpers/fixtures';

const ready = async () => {
  const app = setupApp();
  await app.seedUsers();
  return app;
};

describe('Use cases d’identité', () => {
  it('ID-01 authentification : succès, mauvais mot de passe, compte inconnu', async () => {
    const { identity } = await ready();
    expect(await identity.authenticate('claire@test.fr', PASSWORD)).toMatchObject({ ok: true, value: { id: USERS.claire.id } });
    expect(await identity.authenticate('claire@test.fr', 'faux')).toEqual({ ok: false, error: { code: 'INVALID_CREDENTIALS' } });
    expect(await identity.authenticate('personne@test.fr', PASSWORD)).toEqual({ ok: false, error: { code: 'INVALID_CREDENTIALS' } });
  });

  it('ID-02 un compte désactivé ne peut plus se connecter ni conserver sa session', async () => {
    const { identity } = await ready();
    await identity.updateUser(USERS.marc.id, { active: false }, USERS.admin);
    expect((await identity.authenticate('marc@test.fr', PASSWORD)).ok).toBe(false);
    expect(await identity.getActiveUser(USERS.marc.id)).toBeNull();
  });

  it('ID-03 le mot de passe n’est jamais stocké en clair (empreinte scrypt salée)', async () => {
    const { identity, users } = await ready();
    const created = await identity.createUser({ name: 'Julie', email: 'julie@test.fr', role: 'EMPLOYEE', password: 'bienvenue1' });
    const record = await users.findById(created.ok ? created.value.id : '');
    expect(record!.passwordHash).toMatch(/^scrypt\$/);
    expect(record!.passwordHash).not.toContain('bienvenue1');
    expect(created.ok && created.value).not.toHaveProperty('passwordHash');
  });

  it('ID-04 réinitialisation et changement de mot de passe', async () => {
    const { identity } = await ready();
    await identity.resetPassword(USERS.claire.id, 'nouveau2026');
    expect((await identity.authenticate('claire@test.fr', PASSWORD)).ok).toBe(false);
    expect((await identity.authenticate('claire@test.fr', 'nouveau2026')).ok).toBe(true);
    expect(await identity.changeOwnPassword(USERS.claire, 'mauvais', 'autre2026')).toEqual({ ok: false, error: { code: 'INVALID_CREDENTIALS' } });
    expect((await identity.changeOwnPassword(USERS.claire, 'nouveau2026', 'autre2026')).ok).toBe(true);
  });

  it('ID-05 un administrateur ne peut ni se rétrograder ni se désactiver ; il peut promouvoir un employé', async () => {
    const { identity } = await ready();
    expect(await identity.updateUser(USERS.admin.id, { active: false }, USERS.admin)).toEqual({ ok: false, error: { code: 'SELF_LOCKOUT' } });
    expect(await identity.updateUser(USERS.admin.id, { role: 'EMPLOYEE' }, USERS.admin)).toEqual({ ok: false, error: { code: 'SELF_LOCKOUT' } });
    expect(await identity.updateUser(USERS.claire.id, { role: 'AGENT' }, USERS.admin)).toMatchObject({ ok: true, value: { role: 'AGENT' } });
    expect((await identity.updateUser('inconnu', { role: 'AGENT' }, USERS.admin)).ok).toBe(false);
  });

  it('ID-06 recherche par nom insensible à la casse', async () => {
    const { identity } = await ready();
    expect(await identity.findByName(' claire DUBOIS ')).toMatchObject({ id: USERS.claire.id });
    expect(await identity.findByName('Service RH')).toBeNull();
  });
});

describe('Use cases du portail employé', () => {
  it('POR-01 la demande est rattachée au compte de l’employé, qui en est l’auteur', async () => {
    const { portal } = await ready();
    const r = await portal.submit({ title: 'Écran noir', description: '', category: 'HARDWARE', priority: 'HIGH' }, USERS.claire);
    expect(r.ok && r.value.ticket).toMatchObject({ requester: 'Claire Dubois', requesterId: USERS.claire.id, createdBy: 'Claire Dubois', status: 'OPEN' });
  });

  it('POR-02 isolation : chaque employé ne liste et n’ouvre que ses propres demandes', async () => {
    const { portal } = await ready();
    const a = await portal.submit({ title: 'A', description: '', category: 'OTHER', priority: 'LOW' }, USERS.claire);
    await portal.submit({ title: 'B', description: '', category: 'OTHER', priority: 'LOW' }, USERS.marc);
    expect((await portal.listMine(USERS.claire)).map((t) => t.title)).toEqual(['A']);
    const id = a.ok ? a.value.ticketId : '';
    expect(await portal.getMine(id, USERS.marc)).toEqual({ ok: false, error: { code: 'TICKET_NOT_FOUND', ticketId: id } });
  });

  it('POR-03 un ticket supprimé disparaît du portail', async () => {
    const { portal, commands } = await ready();
    const a = await portal.submit({ title: 'A', description: '', category: 'OTHER', priority: 'LOW' }, USERS.claire);
    const id = a.ok ? a.value.ticketId : '';
    await commands.deleteTicket({ ticketId: id }, 'Sarah Benali');
    expect(await portal.listMine(USERS.claire)).toEqual([]);
    expect((await portal.getMine(id, USERS.claire)).ok).toBe(false);
  });

  it('POR-04 réouverture : uniquement après résolution, avec un motif publié dans la conversation', async () => {
    const { portal, commands } = await ready();
    const a = await portal.submit({ title: 'VPN', description: '', category: 'NETWORK', priority: 'MEDIUM' }, USERS.claire);
    const id = a.ok ? a.value.ticketId : '';
    expect(await portal.reopen(id, 'toujours KO', USERS.claire)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await commands.updateTicket({ ticketId: id, changes: { status: 'RESOLVED' } }, 'Sarah Benali');
    expect(await portal.reopen(id, '   ', USERS.claire)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const reopened = await portal.reopen(id, 'Se coupe encore', USERS.claire);
    expect(reopened.ok && reopened.value.ticket).toMatchObject({ status: 'OPEN', resolvedAt: null });
    const mine = await portal.getMine(id, USERS.claire);
    expect(mine.ok && mine.value.comments.map((c) => c.body)).toEqual(['Se coupe encore']);
  });

  it('POR-05 un employé ne peut pas agir sur la demande d’un autre', async () => {
    const { portal, commands } = await ready();
    const a = await portal.submit({ title: 'A', description: '', category: 'OTHER', priority: 'LOW' }, USERS.claire);
    const id = a.ok ? a.value.ticketId : '';
    await commands.updateTicket({ ticketId: id, changes: { status: 'RESOLVED' } }, 'Sarah Benali');
    for (const attempt of [portal.reply(id, 'x', USERS.marc), portal.confirmResolution(id, USERS.marc), portal.reopen(id, 'x', USERS.marc)])
      expect(await attempt).toMatchObject({ ok: false, error: { code: 'TICKET_NOT_FOUND' } });
  });
});
