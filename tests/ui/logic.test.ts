import { describe, expect, it } from 'vitest';
import { projectActiveTickets } from '../../src/domain';
import type { AuditEntryDto, TicketDto } from '../../src/ui/lib/api';
import { auditToCsv, csvCell } from '../../src/ui/lib/csv';
import { applyFilters, countByView, DEFAULT_FILTERS, matchesSearch, sortTickets } from '../../src/ui/lib/filters';
import { formatDuration, formatFieldValue, formatRelative, formatSla, initials, colorFor } from '../../src/ui/lib/format';
import { parseUsersCsv } from '../../src/ui/lib/download';
import { fillMacro, MACROS } from '../../src/ui/lib/macros';
import { AGENT, ev, OTHER, T } from '../helpers/fixtures';

const tickets = projectActiveTickets(
  [
    ev.created('a', T(0), { title: 'Écran bleu', priority: 'HIGH', tags: ['bsod'] }),
    ev.assigned(AGENT, T(0), 'a'),
    ev.created('b', T(1), { title: 'VPN KO', priority: 'LOW', category: 'NETWORK', requester: 'Service RH' }),
    ev.created('c', T(2), { title: 'Imprimante', priority: 'MEDIUM' }),
    ev.assigned(OTHER, T(2), 'c'),
    ev.updated({ status: 'RESOLVED' }, T(3), 'c'),
  ],
  T(5),
) as TicketDto[];

describe('Filtres et vues enregistrées', () => {
  it('UI-F01 vue « En file » : OPEN + IN_PROGRESS uniquement', () => {
    expect(applyFilters(tickets, DEFAULT_FILTERS, AGENT).map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('UI-F02 compteurs de chaque vue', () => {
    expect(countByView(tickets, AGENT)).toEqual({ open: 2, mine: 1, unassigned: 1, sla: 1, high: 1, resolved: 1, all: 3 });
  });

  it('UI-F03 recherche insensible à la casse et aux accents (titre, réf., demandeur, étiquettes)', () => {
    const find = (q: string) => tickets.filter((t) => matchesSearch(t, q)).map((t) => t.id);
    expect(find('ecran')).toEqual(['a']);
    expect(find('HD-0002')).toEqual(['b']);
    expect(find('service rh')).toEqual(['b']);
    expect(find('BSOD')).toEqual(['a']);
    expect(find('  ')).toHaveLength(3);
  });

  it('UI-F04 filtres catégorie et agent combinés à la vue', () => {
    expect(applyFilters(tickets, { ...DEFAULT_FILTERS, view: 'all', category: 'NETWORK' }, AGENT).map((t) => t.id)).toEqual(['b']);
    expect(applyFilters(tickets, { ...DEFAULT_FILTERS, view: 'all', assignee: 'UNASSIGNED' }, AGENT).map((t) => t.id)).toEqual(['b']);
    expect(applyFilters(tickets, { ...DEFAULT_FILTERS, view: 'all', assignee: OTHER }, AGENT).map((t) => t.id)).toEqual(['c']);
  });

  it('UI-F05 tris : priorité, échéance SLA (résolus en dernier), création', () => {
    expect(sortTickets(tickets, 'priority').map((t) => t.id)).toEqual(['a', 'c', 'b']);
    expect(sortTickets(tickets, 'sla').map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(sortTickets(tickets, 'created').map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('Formatage', () => {
  it.each([
    [30_000, '1 min'],
    [45 * 60_000, '45 min'],
    [3 * 3_600_000, '3 h'],
    [3 * 3_600_000 + 20 * 60_000, '3 h 20'],
    [50 * 3_600_000, '2 j 2 h'],
    [-2 * 3_600_000, '2 h'],
  ])('UI-T01 formatDuration(%s) = %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('UI-T02 temps relatif', () => {
    const now = Date.parse(T(10));
    expect(formatRelative(T(10), now)).toBe("à l'instant");
    expect(formatRelative(T(8), now)).toBe('il y a 2 h');
  });

  it('UI-T03 libellés SLA', () => {
    expect(formatSla('BREACHED', -3_600_000)).toBe('Dépassé de 1 h');
    expect(formatSla('ON_TRACK', 7_200_000)).toBe('2 h restantes');
    expect(formatSla('MET', 1)).toBe('SLA respecté');
  });

  it('UI-T04 valeurs de champs traduites', () => {
    expect(formatFieldValue('status', 'IN_PROGRESS')).toBe('En cours');
    expect(formatFieldValue('category', 'ACCESS')).toBe('Accès & comptes');
    expect(formatFieldValue('assignee', null)).toBe('∅');
    expect(formatFieldValue('deleted', null)).toBe('non');
  });

  it('UI-T05 initiales et couleur d’avatar stables', () => {
    expect(initials('Sarah Benali')).toBe('SB');
    expect(initials('Jean-Pierre Martin')).toBe('JP');
    expect(colorFor('Sarah Benali')).toBe(colorFor('Sarah Benali'));
  });
});

describe('Export CSV de l’audit', () => {
  it('UI-C01 échappement RFC 4180 et neutralisation des formules (injection CSV)', () => {
    expect(csvCell('simple')).toBe('simple');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "bonjour"')).toBe('"dit ""bonjour"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+33 6 00')).toBe("'+33 6 00");
  });

  it('UI-C02 en-tête, BOM UTF-8, une ligne par événement, modifications lisibles', () => {
    const entry: AuditEntryDto = {
      position: 1,
      streamVersion: 2,
      ticketId: 't1',
      type: 'TicketUpdated',
      occurredAt: T(1),
      actor: AGENT,
      payload: { status: 'RESOLVED' },
      changes: [{ field: 'status', before: 'OPEN', after: 'RESOLVED' }],
      hash: 'h1',
      previousHash: 'h0',
    };
    const csv = auditToCsv([entry], new Map([['t1', 'HD-0001']]));
    expect(csv.startsWith('﻿Position;')).toBe(true);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('HD-0001');
    expect(lines[1]).toContain('Statut: Ouvert -> Résolu');
  });
});

describe('Import CSV et réponses types', () => {
  it('UI-I01 CSV Excel (BOM, « ; », guillemets, accents dans les en-têtes, profils en français)', () => {
    const csv = '﻿Nom;E-mail;Profil;Service;Fonction\r\n"Bernard; Julie";julie@x.fr;Administrateur;RH;"Chargée ""recrutement"""\r\nTom;tom@x.fr;;IT;\r\n\r\n';
    expect(parseUsersCsv(csv)).toEqual({
      error: null,
      rows: [
        { name: 'Bernard; Julie', email: 'julie@x.fr', role: 'ADMIN', department: 'RH', jobTitle: 'Chargée "recrutement"' },
        { name: 'Tom', email: 'tom@x.fr', role: 'EMPLOYEE', department: 'IT', jobTitle: '' },
      ],
    });
  });

  it('UI-I02 séparateur « , » détecté ; colonnes obligatoires manquantes signalées', () => {
    expect(parseUsersCsv('name,email\nA,a@x.fr').rows).toHaveLength(1);
    expect(parseUsersCsv('prenom;telephone\nA;06').error).toMatch(/obligatoires/);
  });

  it('UI-M01 réponses types : prénom du demandeur et nom de l’agent insérés', () => {
    const ack = MACROS.find((m) => m.id === 'ack')!;
    const text = fillMacro(ack.body, { requester: 'Claire Dubois', agent: 'Sarah Benali' });
    expect(text).toContain('Bonjour Claire,');
    expect(text).toContain('Sarah Benali');
    expect(text).not.toMatch(/\{\w+\}/);
    expect(MACROS.filter((m) => m.internal).map((m) => m.id)).toEqual(['supplier']);
  });
});
