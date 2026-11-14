import { describe, expect, it } from 'vitest';
import { decide, LIMITS, rehydrate, type TicketCommand, type TicketEvent } from '../../../src/domain';
import { AGENT, ev, T } from '../../helpers/fixtures';

/** Given (historique) / When (commande) / Then (événements ou erreur). */
const given = (history: TicketEvent[]) => ({
  when: (command: TicketCommand, now = T(5)) => decide(rehydrate(history), command, now),
});

const create = (overrides: Partial<Extract<TicketCommand, { type: 'CreateTicket' }>> = {}): TicketCommand => ({
  type: 'CreateTicket',
  ticketId: 't1',
  actor: AGENT,
  title: 'Imprimante HS',
  description: '',
  priority: 'LOW',
  category: 'HARDWARE',
  requester: '',
  requesterId: null,
  tags: [],
  ...overrides,
});
const update = (changes: Extract<TicketCommand, { type: 'UpdateTicket' }>['changes']): TicketCommand => ({
  type: 'UpdateTicket',
  ticketId: 't1',
  actor: AGENT,
  changes,
});
const closed = ev.updated({ status: 'CLOSED' }, T(1));
const deleted = ev.deleted(T(1));

const errorCode = (r: ReturnType<ReturnType<typeof given>['when']>) => (r.ok ? 'OK' : r.error.code);

describe('CreateTicket', () => {
  it('DOM-C01 produit TicketCreated avec les champs normalisés et l’acteur', () => {
    const r = given([]).when(create({ title: '  Imprimante HS ', description: ' 2e ', tags: [' Wifi ', 'wifi', 'Salle B'] }));
    expect(r).toEqual({
      ok: true,
      value: [
        {
          type: 'TicketCreated',
          ticketId: 't1',
          occurredAt: T(5),
          actor: AGENT,
          payload: { title: 'Imprimante HS', description: '2e', priority: 'LOW', category: 'HARDWARE', requester: AGENT, requesterId: null, tags: ['wifi', 'salle-b'] },
        },
      ],
    });
  });

  it('DOM-C02 le demandeur explicite est conservé', () => {
    const r = given([]).when(create({ requester: ' Service RH ' }));
    expect(r.ok && r.value[0]!.type === 'TicketCreated' && r.value[0]!.payload.requester).toBe('Service RH');
  });

  it.each([
    ['titre vide', { title: '   ' }],
    ['titre trop long', { title: 'x'.repeat(LIMITS.title + 1) }],
    ['description trop longue', { description: 'x'.repeat(LIMITS.description + 1) }],
    ['priorité inconnue', { priority: 'URGENT' as never }],
    ['catégorie inconnue', { category: 'FOOD' as never }],
    ['trop d’étiquettes', { tags: Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`) }],
    ['étiquette trop longue', { tags: ['x'.repeat(LIMITS.tag + 1)] }],
    ['demandeur trop long', { requester: 'x'.repeat(LIMITS.requester + 1) }],
  ])('DOM-C03 refuse : %s', (_, overrides) => {
    expect(errorCode(given([]).when(create(overrides)))).toBe('VALIDATION');
  });

  it('DOM-C04 accepte un titre de longueur maximale', () => {
    expect(given([]).when(create({ title: 'x'.repeat(LIMITS.title) })).ok).toBe(true);
  });

  it('DOM-C05 refuse de recréer un ticket existant (même supprimé)', () => {
    expect(errorCode(given([ev.created()]).when(create()))).toBe('TICKET_ALREADY_EXISTS');
    expect(errorCode(given([ev.created(), deleted]).when(create()))).toBe('TICKET_ALREADY_EXISTS');
  });
});

describe('UpdateTicket', () => {
  it('DOM-U01 ne conserve que les champs réellement modifiés', () => {
    const r = given([ev.created()]).when(update({ status: 'IN_PROGRESS', priority: 'HIGH', category: 'HARDWARE' }));
    expect(r.ok && r.value[0]!.payload).toEqual({ status: 'IN_PROGRESS' });
  });

  it('DOM-U02 modifie titre, description, catégorie et étiquettes (normalisés)', () => {
    const r = given([ev.created()]).when(update({ title: ' Nouveau ', description: ' Détail ', category: 'NETWORK', tags: ['VPN'] }));
    expect(r.ok && r.value[0]!.payload).toEqual({ title: 'Nouveau', description: 'Détail', category: 'NETWORK', tags: ['vpn'] });
  });

  it('DOM-U03 refuse une modification sans effet', () => {
    expect(errorCode(given([ev.created()]).when(update({ priority: 'HIGH' })))).toBe('NO_CHANGES');
    expect(errorCode(given([ev.created()]).when(update({})))).toBe('NO_CHANGES');
    expect(errorCode(given([ev.created()]).when(update({ title: ' Imprimante HS ' })))).toBe('NO_CHANGES');
  });

  it('DOM-U04 refuse de modifier un ticket CLOSED', () => {
    expect(errorCode(given([ev.created(), closed]).when(update({ status: 'OPEN' })))).toBe('TICKET_CLOSED');
  });

  it('DOM-U05 refuse de modifier un ticket supprimé', () => {
    expect(errorCode(given([ev.created(), deleted]).when(update({ status: 'RESOLVED' })))).toBe('TICKET_DELETED');
  });

  it('DOM-U06 refuse de modifier un ticket inexistant', () => {
    expect(errorCode(given([]).when(update({ status: 'RESOLVED' })))).toBe('TICKET_NOT_FOUND');
  });

  it.each([
    ['statut inconnu', { status: 'DONE' as never }],
    ['priorité inconnue', { priority: 'X' as never }],
    ['titre vide', { title: '' }],
  ])('DOM-U07 refuse : %s', (_, changes) => {
    expect(errorCode(given([ev.created()]).when(update(changes)))).toBe('VALIDATION');
  });

  it('DOM-U08 autorise toutes les transitions sauf depuis CLOSED (OPEN→RESOLVED→OPEN→CLOSED)', () => {
    const history = [ev.created()];
    for (const status of ['RESOLVED', 'OPEN', 'IN_PROGRESS', 'CLOSED'] as const) {
      const r = given(history).when(update({ status }));
      expect(r.ok).toBe(true);
      if (r.ok) history.push(...r.value);
    }
  });
});

describe('AssignTicket', () => {
  const assign = (assignee: string | null): TicketCommand => ({ type: 'AssignTicket', ticketId: 't1', actor: AGENT, assignee });

  it('DOM-A01 produit TicketAssigned', () => {
    const r = given([ev.created()]).when(assign(' Lucas Martin '));
    expect(r.ok && r.value[0]).toMatchObject({ type: 'TicketAssigned', payload: { assignee: 'Lucas Martin' } });
  });

  it('DOM-A02 désassigner (null ou chaîne vide)', () => {
    const r = given([ev.created(), ev.assigned('Lucas')]).when(assign(''));
    expect(r.ok && r.value[0]!.payload).toEqual({ assignee: null });
  });

  it('DOM-A03 refuse une réassignation identique', () => {
    expect(errorCode(given([ev.created(), ev.assigned('Lucas')]).when(assign('Lucas')))).toBe('NO_CHANGES');
    expect(errorCode(given([ev.created()]).when(assign(null)))).toBe('NO_CHANGES');
  });

  it('DOM-A04 refuse sur un ticket fermé ou supprimé', () => {
    expect(errorCode(given([ev.created(), closed]).when(assign('Lucas')))).toBe('TICKET_CLOSED');
    expect(errorCode(given([ev.created(), deleted]).when(assign('Lucas')))).toBe('TICKET_DELETED');
  });
});

describe('CommentTicket', () => {
  const comment = (body: string, internal = false): TicketCommand => ({
    type: 'CommentTicket',
    ticketId: 't1',
    actor: AGENT,
    commentId: 'c1',
    body,
    internal,
  });

  it('DOM-M01 produit TicketCommented (réponse ou note interne)', () => {
    const r = given([ev.created()]).when(comment(' Bonjour ', true));
    expect(r.ok && r.value[0]!.payload).toEqual({ commentId: 'c1', body: 'Bonjour', internal: true });
  });

  it('DOM-M02 refuse un commentaire vide ou trop long', () => {
    expect(errorCode(given([ev.created()]).when(comment('   ')))).toBe('VALIDATION');
    expect(errorCode(given([ev.created()]).when(comment('x'.repeat(LIMITS.comment + 1))))).toBe('VALIDATION');
  });

  it('DOM-M03 autorise un commentaire sur un ticket RESOLVED, pas sur CLOSED', () => {
    expect(given([ev.created(), ev.updated({ status: 'RESOLVED' })]).when(comment('ok')).ok).toBe(true);
    expect(errorCode(given([ev.created(), closed]).when(comment('ok')))).toBe('TICKET_CLOSED');
  });
});

describe('DeleteTicket', () => {
  const del: TicketCommand = { type: 'DeleteTicket', ticketId: 't1', actor: AGENT };

  it('DOM-D01 produit TicketDeleted pour un ticket actif, même CLOSED', () => {
    expect(given([ev.created(), closed]).when(del)).toEqual({
      ok: true,
      value: [{ type: 'TicketDeleted', ticketId: 't1', occurredAt: T(5), actor: AGENT, payload: {} }],
    });
  });

  it('DOM-D02 refuse une double suppression et un ticket inexistant', () => {
    expect(errorCode(given([ev.created(), deleted]).when(del))).toBe('TICKET_DELETED');
    expect(errorCode(given([]).when(del))).toBe('TICKET_NOT_FOUND');
  });
});

describe('Pureté', () => {
  it('DOM-P01 même entrée ⇒ même sortie, sans effet de bord', () => {
    const state = Object.freeze(rehydrate([ev.created()]));
    const command = Object.freeze(update({ status: 'RESOLVED' }));
    expect(decide(state, command, T(9))).toEqual(decide(state, command, T(9)));
  });
});
