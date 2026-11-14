import {
  err,
  knowledgeStats,
  ok,
  suggestArticles,
  validateArticle,
  type Actor,
  type Article,
  type ArticleId,
  type ArticleInput,
  type Category,
  type KnowledgeStats,
  type Result,
} from '../domain';
import type { ArticleRepository, Clock, IdGenerator } from './ports';

export type KnowledgeError =
  | { readonly code: 'ARTICLE_VALIDATION'; readonly message: string }
  | { readonly code: 'ARTICLE_NOT_FOUND' };

/** Résumé d'un article pour les listes et les suggestions (sans le corps complet). */
export type ArticleSummary = Pick<Article, 'id' | 'title' | 'category' | 'updatedAt' | 'deflections'> & {
  readonly excerpt: string;
};

const EXCERPT = 160;
export const toSummary = (a: Article): ArticleSummary => ({
  id: a.id,
  title: a.title,
  category: a.category,
  updatedAt: a.updatedAt,
  deflections: a.deflections,
  excerpt: a.body.replace(/\s+/g, ' ').slice(0, EXCERPT) + (a.body.length > EXCERPT ? '…' : ''),
});

const notFound = { code: 'ARTICLE_NOT_FOUND' } as const;

export const makeKnowledgeService = ({
  articles,
  clock,
  newId,
}: {
  readonly articles: ArticleRepository;
  readonly clock: Clock;
  readonly newId: IdGenerator;
}) => {
  const published = async () => (await articles.list()).filter((a) => a.published);

  return {
    // ----- Portail (articles publiés uniquement) -----

    /** Recherche libre ; sans texte, les articles les plus utiles d'abord. */
    search: async (text: string, category?: Category): Promise<readonly ArticleSummary[]> => {
      if (!text.trim()) {
        return (await published())
          .filter((a) => !category || a.category === category)
          .sort((a, b) => b.deflections - a.deflections || a.title.localeCompare(b.title, 'fr'))
          .map(toSummary);
      }
      return suggestArticles(await articles.list(), text, { category, limit: 20, minScore: 1 }).map((s) => toSummary(s.article));
    },

    /** Suggestions pendant la saisie d'une demande (seuil de pertinence plus strict). */
    suggest: async (text: string, category?: Category): Promise<readonly ArticleSummary[]> =>
      suggestArticles(await articles.list(), text, { category, limit: 3 }).map((s) => toSummary(s.article)),

    /** Lecture d'un article publié par un employé : la consultation est comptabilisée. */
    read: async (id: ArticleId): Promise<Result<KnowledgeError, Article>> => {
      const found = await articles.findById(id);
      if (!found?.published) return err(notFound);
      const updated = await articles.update(id, (a) => ({ ...a, views: a.views + 1 }));
      return updated ? ok(updated) : err(notFound);
    },

    /** « Cet article a résolu mon problème » : une demande évitée. */
    markHelpful: async (id: ArticleId): Promise<Result<KnowledgeError, Article>> => {
      const found = await articles.findById(id);
      if (!found?.published) return err(notFound);
      const updated = await articles.update(id, (a) => ({ ...a, deflections: a.deflections + 1 }));
      return updated ? ok(updated) : err(notFound);
    },

    // ----- Back-office DSI -----

    listAll: async (): Promise<readonly Article[]> =>
      [...(await articles.list())].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

    get: async (id: ArticleId): Promise<Result<KnowledgeError, Article>> => {
      const found = await articles.findById(id);
      return found ? ok(found) : err(notFound);
    },

    create: async (input: ArticleInput, author: Actor): Promise<Result<KnowledgeError, Article>> => {
      const valid = validateArticle(input);
      if (!valid.ok) return err({ code: 'ARTICLE_VALIDATION', message: valid.error });
      const now = clock();
      const article: Article = { id: newId(), ...valid.value, author, createdAt: now, updatedAt: now, views: 0, deflections: 0 };
      await articles.save(article);
      return ok(article);
    },

    update: async (id: ArticleId, input: ArticleInput): Promise<Result<KnowledgeError, Article>> => {
      const valid = validateArticle(input);
      if (!valid.ok) return err({ code: 'ARTICLE_VALIDATION', message: valid.error });
      const updated = await articles.update(id, (a) => ({ ...a, ...valid.value, updatedAt: clock() }));
      return updated ? ok(updated) : err(notFound);
    },

    stats: async (): Promise<KnowledgeStats> => knowledgeStats(await articles.list()),
  };
};

export type KnowledgeService = ReturnType<typeof makeKnowledgeService>;
