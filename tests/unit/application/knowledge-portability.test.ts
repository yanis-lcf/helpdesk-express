import { describe, expect, it } from 'vitest';
import { EXPORT_FORMAT } from '../../../src/application';
import { PASSWORD, setupApp, USERS } from '../../helpers/fixtures';

const ready = async () => {
  const app = setupApp();
  await app.seedUsers();
  return app;
};
const printer = { title: 'Imprimante : bourrage', body: 'Ouvrez le capot.', category: 'HARDWARE', keywords: ['imprimante', 'bourrage'], published: true } as const;

describe('Use cases — base de connaissances', () => {
  it('KBS-01 création par la DSI, puis suggestion pendant la saisie d’une demande', async () => {
    const { knowledge } = await ready();
    const created = await knowledge.create(printer, 'Sarah Benali');
    expect(created).toMatchObject({ ok: true, value: { author: 'Sarah Benali', views: 0, deflections: 0 } });
    const suggestions = await knowledge.suggest('mon imprimante est en panne');
    expect(suggestions.map((s) => s.title)).toEqual(['Imprimante : bourrage']);
    expect(suggestions[0]).not.toHaveProperty('body');
  });

  it('KBS-02 un brouillon n’est ni proposé, ni lisible depuis le portail (mais visible par la DSI)', async () => {
    const { knowledge } = await ready();
    const draft = await knowledge.create({ ...printer, published: false }, 'Sarah Benali');
    const id = draft.ok ? draft.value.id : '';
    expect(await knowledge.suggest('imprimante bourrage')).toEqual([]);
    expect(await knowledge.search('')).toEqual([]);
    expect(await knowledge.read(id)).toEqual({ ok: false, error: { code: 'ARTICLE_NOT_FOUND' } });
    expect(await knowledge.markHelpful(id)).toEqual({ ok: false, error: { code: 'ARTICLE_NOT_FOUND' } });
    expect((await knowledge.get(id)).ok).toBe(true);
  });

  it('KBS-03 consultations et demandes évitées comptabilisées, sans perte en cas d’accès simultanés', async () => {
    const { knowledge } = await ready();
    const created = await knowledge.create(printer, 'Sarah Benali');
    const id = created.ok ? created.value.id : '';
    await Promise.all(Array.from({ length: 20 }, () => knowledge.read(id)));
    await Promise.all(Array.from({ length: 5 }, () => knowledge.markHelpful(id)));
    expect(await knowledge.stats()).toMatchObject({ views: 20, deflections: 5 });
  });

  it('KBS-04 modification : contenu revalidé, date de mise à jour actualisée, compteurs conservés', async () => {
    const app = await ready();
    const created = await app.knowledge.create(printer, 'Sarah Benali');
    const id = created.ok ? created.value.id : '';
    await app.knowledge.markHelpful(id);
    app.advance(2);
    const updated = await app.knowledge.update(id, { ...printer, title: 'Imprimante : bourrage papier' });
    expect(updated).toMatchObject({ ok: true, value: { title: 'Imprimante : bourrage papier', deflections: 1, updatedAt: '2026-01-05T10:00:00.000Z' } });
    expect(await app.knowledge.update(id, { ...printer, title: ' ' })).toMatchObject({ ok: false, error: { code: 'ARTICLE_VALIDATION' } });
    expect(await app.knowledge.update('inconnu', printer)).toEqual({ ok: false, error: { code: 'ARTICLE_NOT_FOUND' } });
  });

  it('KBS-05 recherche libre : vide = articles les plus utiles d’abord ; filtre par catégorie', async () => {
    const { knowledge } = await ready();
    const a = await knowledge.create(printer, 'x');
    await knowledge.create({ ...printer, title: 'VPN', keywords: ['vpn'], body: 'Reconnectez', category: 'NETWORK' }, 'x');
    if (a.ok) await knowledge.markHelpful(a.value.id);
    expect((await knowledge.search('')).map((s) => s.title)).toEqual(['Imprimante : bourrage', 'VPN']);
    expect((await knowledge.search('', 'NETWORK')).map((s) => s.title)).toEqual(['VPN']);
    expect((await knowledge.search('vpn')).map((s) => s.title)).toEqual(['VPN']);
  });
});

describe('Use cases — satisfaction via le portail', () => {
  it('SAT-01 confirmer avec un avis : TicketRated puis clôture, au nom de l’employée', async () => {
    const { portal, commands, queries } = await ready();
    const r = await portal.submit({ title: 'VPN', description: '', category: 'NETWORK', priority: 'HIGH' }, USERS.claire);
    const id = r.ok ? r.value.ticketId : '';
    await commands.updateTicket({ ticketId: id, changes: { status: 'RESOLVED' } }, 'Sarah Benali');
    const closed = await portal.confirmResolution(id, USERS.claire, { rating: 5, comment: 'Rapide !' });
    expect(closed.ok && closed.value.ticket).toMatchObject({ status: 'CLOSED', satisfaction: { rating: 5, comment: 'Rapide !', ratedBy: 'Claire Dubois' } });
    const history = await queries.getTicket(id);
    expect(history.ok && history.value.history.map((h) => h.type).slice(-2)).toEqual(['TicketRated', 'TicketUpdated']);
  });

  it('SAT-02 avis invalide : rien n’est enregistré, le ticket reste à confirmer', async () => {
    const { portal, commands } = await ready();
    const r = await portal.submit({ title: 'VPN', description: '', category: 'NETWORK', priority: 'HIGH' }, USERS.claire);
    const id = r.ok ? r.value.ticketId : '';
    await commands.updateTicket({ ticketId: id, changes: { status: 'RESOLVED' } }, 'Sarah Benali');
    expect(await portal.confirmResolution(id, USERS.claire, { rating: 9 })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const mine = await portal.getMine(id, USERS.claire);
    expect(mine.ok && mine.value).toMatchObject({ status: 'RESOLVED', satisfaction: null });
  });
});

describe('Use cases — réversibilité, RGPD et import', () => {
  it('PORT-01 export complet : journal scellé, comptes SANS empreinte de mot de passe, articles', async () => {
    const { portability, portal, knowledge } = await ready();
    await portal.submit({ title: 'A', description: '', category: 'OTHER', priority: 'LOW' }, USERS.claire);
    await knowledge.create(printer, 'x');
    const data = await portability.exportAll();
    expect(data).toMatchObject({ format: EXPORT_FORMAT, counts: { events: 1, users: 5, articles: 1 }, integrity: { valid: true } });
    expect(data.events[0]).toHaveProperty('hash');
    expect(JSON.stringify(data)).not.toContain('scrypt$');
  });

  it('PORT-02 export RGPD d’une personne : son profil, ses demandes et ses actions uniquement', async () => {
    const { portability, portal } = await ready();
    await portal.submit({ title: 'Demande de Claire', description: '', category: 'OTHER', priority: 'LOW' }, USERS.claire);
    await portal.submit({ title: 'Demande de Marc', description: '', category: 'OTHER', priority: 'LOW' }, USERS.marc);
    const r = await portability.exportPerson(USERS.claire.id);
    const data = r.ok ? (r.value as { person: { email: string }; requestedTickets: { title: string }[]; actions: unknown[] }) : null;
    expect(data?.person.email).toBe('claire@test.fr');
    expect(data?.requestedTickets.map((t) => t.title)).toEqual(['Demande de Claire']);
    expect(data?.actions).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain('passwordHash');
    expect(await portability.exportPerson('inconnu')).toEqual({ ok: false, error: { code: 'USER_NOT_FOUND' } });
  });

  it('IMP-01 import en masse : comptes créés avec mot de passe provisoire, lignes invalides ou doublons signalées', async () => {
    const { identity } = await ready();
    let n = 0;
    const report = await identity.importUsers(
      [
        { name: 'Julie Bernard', email: 'julie@test.fr', role: 'EMPLOYEE', department: 'RH' },
        { name: 'Sans e-mail', email: 'pas-un-email', role: 'EMPLOYEE' },
        { name: 'Claire bis', email: 'CLAIRE@test.fr', role: 'EMPLOYEE' },
        { name: 'Tom Agent', email: 'tom@test.fr', role: 'AGENT' },
      ],
      () => `Provisoire-${++n}`,
    );
    expect(report.created.map((u) => [u.email, u.role, u.temporaryPassword])).toEqual([
      ['julie@test.fr', 'EMPLOYEE', 'Provisoire-1'],
      ['tom@test.fr', 'AGENT', 'Provisoire-2'],
    ]);
    expect(report.rejected.map((r) => r.line)).toEqual([2, 3]);
    expect((await identity.authenticate('julie@test.fr', 'Provisoire-1')).ok).toBe(true);
    expect((await identity.authenticate('claire@test.fr', PASSWORD)).ok).toBe(true);
  });
});
