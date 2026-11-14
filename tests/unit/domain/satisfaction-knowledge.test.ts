import { describe, expect, it } from 'vitest';
import {
  computeDashboard,
  computeSatisfaction,
  decide,
  knowledgeStats,
  normalizeText,
  projectTickets,
  rehydrate,
  scoreArticle,
  suggestArticles,
  tokenize,
  validateArticle,
  type Article,
  type TicketEvent,
} from '../../../src/domain';
import { AGENT, ev, T } from '../../helpers/fixtures';

const rated = (rating: number, comment = '', at = T(3), ticketId = 't1'): TicketEvent => ({
  type: 'TicketRated',
  ticketId,
  occurredAt: at,
  actor: 'Claire',
  payload: { rating, comment },
});
const resolved = (ticketId = 't1') => [ev.created(ticketId), ev.updated({ status: 'RESOLVED' }, T(2), ticketId)];
const rate = (history: TicketEvent[], rating: number, comment = '') =>
  decide(rehydrate(history), { type: 'RateTicket', ticketId: 't1', actor: 'Claire', rating, comment }, T(3));

describe('Satisfaction — règles (decide / evolve)', () => {
  it('CSAT-01 une demande RÉSOLUE peut être évaluée : événement TicketRated (commentaire nettoyé)', () => {
    expect(rate(resolved(), 4, '  Merci !  ')).toEqual({ ok: true, value: [rated(4, 'Merci !')] });
  });

  it.each([
    ['ouverte', [ev.created()], 'VALIDATION'],
    ['fermée', [ev.created(), ev.updated({ status: 'CLOSED' }, T(2))], 'TICKET_CLOSED'],
    ['supprimée', [ev.created(), ev.deleted()], 'TICKET_DELETED'],
    ['inexistante', [], 'TICKET_NOT_FOUND'],
  ])('CSAT-02 une demande %s ne peut pas être évaluée', (_label, history, code) => {
    const r = rate(history as TicketEvent[], 5);
    expect(!r.ok && r.error.code).toBe(code);
  });

  it.each([0, 6, 2.5, Number.NaN])('CSAT-03 note invalide (%s) refusée', (rating) => {
    expect(rate(resolved(), rating).ok).toBe(false);
  });

  it('CSAT-04 commentaire trop long refusé', () => {
    expect(rate(resolved(), 5, 'x'.repeat(1001)).ok).toBe(false);
  });

  it('CSAT-05 le rejeu conserve le dernier avis (auteur, date) sans toucher au statut', () => {
    const s = rehydrate([...resolved(), rated(2, 'bof', T(3)), rated(5, 'finalement top', T(4))]);
    expect(s.kind === 'Active' && s.ticket).toMatchObject({
      status: 'RESOLVED',
      satisfaction: { rating: 5, comment: 'finalement top', ratedBy: 'Claire', ratedAt: T(4) },
      version: 4,
    });
  });

  it('CSAT-06 indicateurs : CSAT = part des notes 4-5, moyenne, répartition, derniers commentaires', () => {
    const log = [
      ...resolved('a'), rated(5, 'parfait', T(3), 'a'),
      ...resolved('b'), rated(4, '', T(4), 'b'),
      ...resolved('c'), rated(2, 'trop long', T(5), 'c'),
      ...resolved('d'),
    ];
    const s = computeSatisfaction(projectTickets(log, T(6)));
    expect(s).toMatchObject({ responses: 3, csat: 2 / 3, distribution: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 1 } });
    expect(s.average).toBeCloseTo(11 / 3);
    expect(s.recent.map((r) => r.comment)).toEqual(['trop long', 'parfait']);
    expect(computeDashboard(log, T(6)).satisfaction.responses).toBe(3);
  });

  it('CSAT-07 sans avis : indicateurs nuls (pas de division par zéro)', () => {
    expect(computeSatisfaction([])).toMatchObject({ responses: 0, average: null, csat: null, recent: [] });
  });
});

const article = (overrides: Partial<Article> = {}): Article => ({
  id: 'a1',
  title: 'Imprimante : bourrage papier',
  body: 'Ouvrez le capot et retirez la feuille.',
  category: 'HARDWARE',
  keywords: ['impression', 'bourrage'],
  published: true,
  author: AGENT,
  createdAt: T(0),
  updatedAt: T(0),
  views: 0,
  deflections: 0,
  ...overrides,
});

describe('Base de connaissances — recherche et suggestions (pures)', () => {
  it('KB-01 normalisation : accents, casse, ponctuation, mots composés', () => {
    expect(normalizeText('Réseau Wi-Fi : « déconnecté » !')).toBe('reseau wifi deconnecte');
  });

  it('KB-02 tokenisation : mots vides retirés, pluriels ramenés au singulier, doublons supprimés', () => {
    expect(tokenize('Les imprimantes ne marchent pas, imprimante HS')).toEqual(['imprimante', 'marchent']);
    expect(tokenize('mes réseaux')).toEqual(['reseau']);
  });

  it('KB-03 pertinence : mot-clé (4) > titre (3) > contenu (1), bonus catégorie seulement si le texte correspond', () => {
    const a = article();
    expect(scoreArticle(a, ['bourrage'])).toBe(4 + 3);
    expect(scoreArticle(a, ['feuille'])).toBe(1);
    expect(scoreArticle(a, ['feuille'], 'HARDWARE')).toBe(2);
    expect(scoreArticle(a, ['vpn'], 'HARDWARE')).toBe(0);
  });

  it('KB-04 suggestions : seuil de pertinence, articles publiés uniquement, tri par score puis efficacité', () => {
    const articles = [
      article({ id: 'printer' }),
      article({ id: 'draft', published: false }),
      article({ id: 'vpn', title: 'VPN', keywords: ['vpn'], body: 'Reconnectez-vous', category: 'NETWORK' }),
      article({ id: 'printer-2', title: 'Imprimante hors ligne', keywords: [], body: 'Redémarrez', deflections: 9 }),
    ];
    expect(suggestArticles(articles, 'Mon imprimante fait un bourrage').map((s) => s.article.id)).toEqual(['printer', 'printer-2']);
    expect(suggestArticles(articles, 'Problème de feuille')).toEqual([]); // contenu seul : sous le seuil
    expect(suggestArticles(articles, 'vpn').map((s) => s.article.id)).toEqual(['vpn']);
    expect(suggestArticles(articles, '')).toEqual([]);
  });

  it('KB-05 validation d’un article : titre et contenu obligatoires, catégorie connue, mots-clés normalisés', () => {
    expect(validateArticle({ title: '  Mot   de passe ', body: ' Étapes ', category: 'ACCESS', keywords: ['MDP', 'mdp', ' '], published: true })).toEqual({
      ok: true,
      value: { title: 'Mot de passe', body: 'Étapes', category: 'ACCESS', keywords: ['mdp'], published: true },
    });
    for (const bad of [{ title: '' }, { body: '  ' }, { category: 'XYZ' }, { title: 'x'.repeat(141) }, { keywords: Array(16).fill(0).map((_, i) => `k${i}`) }])
      expect(validateArticle({ title: 'T', body: 'B', category: 'OTHER', keywords: [], published: true, ...bad }).ok).toBe(false);
  });

  it('KB-06 statistiques : consultations, demandes évitées, top des articles utiles', () => {
    const stats = knowledgeStats([article({ id: 'a', views: 10, deflections: 3 }), article({ id: 'b', views: 5, deflections: 0, published: false })]);
    expect(stats).toMatchObject({ articles: 2, published: 1, views: 15, deflections: 3 });
    expect(stats.top.map((t) => t.id)).toEqual(['a']);
  });
});
