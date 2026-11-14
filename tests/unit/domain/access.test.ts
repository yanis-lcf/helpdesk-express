import { describe, expect, it } from 'vitest';
import {
  canViewTicket,
  isAdmin,
  isStaff,
  ownsTicket,
  publicComments,
  requesterActions,
  requesterCan,
  validateNewUser,
  validatePassword,
  type Comment,
  type Status,
} from '../../../src/domain';

const employee = { id: 'u1', role: 'EMPLOYEE' } as const;
const agent = { id: 'u2', role: 'AGENT' } as const;

describe('Politique d’accès (pure)', () => {
  it('ACC-01 rôles : seuls AGENT et ADMIN sont membres de la DSI ; seul ADMIN administre', () => {
    expect([isStaff('EMPLOYEE'), isStaff('AGENT'), isStaff('ADMIN')]).toEqual([false, true, true]);
    expect([isAdmin('EMPLOYEE'), isAdmin('AGENT'), isAdmin('ADMIN')]).toEqual([false, false, true]);
  });

  it('ACC-02 un employé ne voit que les tickets dont il est le demandeur (lien par identifiant)', () => {
    expect(ownsTicket(employee, { requesterId: 'u1' })).toBe(true);
    expect(canViewTicket(employee, { requesterId: 'u1' })).toBe(true);
    expect(canViewTicket(employee, { requesterId: 'autre' })).toBe(false);
    expect(canViewTicket(employee, { requesterId: null })).toBe(false);
  });

  it('ACC-03 la DSI voit tous les tickets', () => {
    expect(canViewTicket(agent, { requesterId: 'u1' })).toBe(true);
    expect(canViewTicket(agent, { requesterId: null })).toBe(true);
  });

  it('ACC-04 les notes internes sont retirées de la vue demandeur', () => {
    const comments: Comment[] = [
      { id: 'a', body: 'public', internal: false, author: 'x', createdAt: '' },
      { id: 'b', body: 'secret', internal: true, author: 'x', createdAt: '' },
    ];
    expect(publicComments(comments).map((c) => c.id)).toEqual(['a']);
  });

  it.each<[Status, string[]]>([
    ['OPEN', ['REPLY']],
    ['IN_PROGRESS', ['REPLY']],
    ['RESOLVED', ['REPLY', 'CONFIRM_RESOLUTION', 'REOPEN']],
    ['CLOSED', []],
  ])('ACC-05 actions du demandeur sur un ticket %s : %j', (status, expected) => {
    expect(requesterActions({ status })).toEqual(expected);
    expect(requesterCan({ status }, 'CONFIRM_RESOLUTION')).toBe(status === 'RESOLVED');
  });
});

describe('Identité : validations', () => {
  it('IDN-01 nouveau compte normalisé (e-mail en minuscules, espaces nettoyés)', () => {
    const r = validateNewUser({ name: '  Julie   Bernard ', email: ' Julie.Bernard@Demo.FR ', role: 'EMPLOYEE' });
    expect(r).toEqual({ ok: true, value: { name: 'Julie Bernard', email: 'julie.bernard@demo.fr', role: 'EMPLOYEE', department: '', jobTitle: '' } });
  });

  it.each([
    ['nom vide', { name: ' ', email: 'a@b.fr', role: 'EMPLOYEE' }],
    ['e-mail invalide', { name: 'Julie', email: 'julie@', role: 'EMPLOYEE' }],
    ['rôle inconnu', { name: 'Julie', email: 'a@b.fr', role: 'ROOT' }],
    ['nom trop long', { name: 'x'.repeat(81), email: 'a@b.fr', role: 'EMPLOYEE' }],
  ])('IDN-02 refus : %s', (_label, input) => {
    expect(validateNewUser(input as never).ok).toBe(false);
  });

  it.each([
    ['court1', false],
    ['seulementdeslettres', false],
    ['12345678', false],
    ['bienvenue1', true],
  ])('IDN-03 politique de mot de passe : « %s » ⇒ %s', (password, valid) => {
    expect(validatePassword(password).ok).toBe(valid);
  });
});
