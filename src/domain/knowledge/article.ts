import { err, ok, type Result } from '../result';
import { isCategory, type Actor, type Category, type Timestamp } from '../ticket/types';

/**
 * Base de connaissances (self-service) : des solutions rédigées par la DSI, proposées aux employés
 * AVANT qu'ils ne créent une demande. Chaque problème résolu ainsi est une demande évitée.
 */
export type ArticleId = string;

export type Article = {
  readonly id: ArticleId;
  readonly title: string;
  /** Texte brut ; les lignes commençant par « - » ou « 1. » sont affichées en listes. */
  readonly body: string;
  readonly category: Category;
  readonly keywords: readonly string[];
  readonly published: boolean;
  readonly author: Actor;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  /** Nombre de consultations depuis le portail. */
  readonly views: number;
  /** Nombre de fois où l'article a résolu le problème sans création de demande. */
  readonly deflections: number;
};

export const ARTICLE_LIMITS = { title: 140, body: 10_000, keyword: 30, keywords: 15 } as const;

export type ArticleInput = {
  readonly title: string;
  readonly body: string;
  readonly category: string;
  readonly keywords: readonly string[];
  readonly published: boolean;
};

export type ValidatedArticle = Pick<Article, 'title' | 'body' | 'category' | 'keywords' | 'published'>;

/** Valide et normalise le contenu d'un article (titre et corps obligatoires, mots-clés en minuscules dédoublonnés). */
export const validateArticle = (input: ArticleInput): Result<string, ValidatedArticle> => {
  const title = input.title.trim().replace(/\s+/g, ' ');
  const body = input.body.trim();
  if (!title) return err('Le titre est obligatoire.');
  if (title.length > ARTICLE_LIMITS.title) return err(`Le titre ne doit pas dépasser ${ARTICLE_LIMITS.title} caractères.`);
  if (!body) return err('Le contenu est obligatoire.');
  if (body.length > ARTICLE_LIMITS.body) return err(`Le contenu ne doit pas dépasser ${ARTICLE_LIMITS.body} caractères.`);
  if (!isCategory(input.category)) return err('Catégorie invalide.');
  const keywords = [...new Set(input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
  if (keywords.length > ARTICLE_LIMITS.keywords) return err(`${ARTICLE_LIMITS.keywords} mots-clés maximum.`);
  if (keywords.some((k) => k.length > ARTICLE_LIMITS.keyword))
    return err(`Un mot-clé ne doit pas dépasser ${ARTICLE_LIMITS.keyword} caractères.`);
  return ok({ title, body, category: input.category, keywords, published: input.published });
};

// ---------- Recherche et suggestions (pures) ----------

/** Mots trop fréquents pour être discriminants. */
const STOP_WORDS = new Set(
  (
    'les des une un le la de du et ou en au aux pour par sur dans avec sans pas plus mon ma mes ton ta tes son sa ses ' +
    'notre nos votre vos leur leurs est sont suis ai a ont fait faire peux peut veux ne n je tu il elle on nous vous ils elles ' +
    'que qui quoi ce cet cette ces se sa tout tous toute toutes tres bien mal encore depuis quand comment plus moins ' +
    'probleme marche fonctionne pas rien'
  ).split(' '),
);

/** Minuscules, sans accents ni ponctuation ; les mots composés à trait d'union sont soudés. */
export const normalizeText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/([a-z0-9])-(?=[a-z0-9])/g, '$1') // « wi-fi » = « wifi », « e-mail » = « email »
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Racine rudimentaire (pluriels français) : « imprimantes » ≈ « imprimante », « réseaux » ≈ « réseau ». */
const stem = (word: string) => (word.length > 4 ? word.replace(/(x|s)$/, '') : word);

export const tokenize = (text: string): readonly string[] => [
  ...new Set(
    normalizeText(text)
      .split(' ')
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
      .map(stem),
  ),
];

export type ScoredArticle = { readonly article: Article; readonly score: number };

const WEIGHTS = { keyword: 4, title: 3, body: 1, category: 1 } as const;

/**
 * Score de pertinence d'un article pour une saisie libre : mots-clés > titre > contenu,
 * petit bonus si la catégorie choisie correspond. Le bonus seul ne suffit jamais à proposer un article.
 */
export const scoreArticle = (article: Article, query: readonly string[], category?: Category): number => {
  if (query.length === 0) return 0;
  const keywords = new Set(article.keywords.flatMap(tokenize));
  const title = new Set(tokenize(article.title));
  const body = new Set(tokenize(article.body));
  const textScore = query.reduce(
    (score, word) =>
      score +
      (keywords.has(word) ? WEIGHTS.keyword : 0) +
      (title.has(word) ? WEIGHTS.title : 0) +
      (body.has(word) ? WEIGHTS.body : 0),
    0,
  );
  return textScore === 0 ? 0 : textScore + (category && article.category === category ? WEIGHTS.category : 0);
};

/** Articles publiés les plus pertinents pour une saisie (ex. titre de la demande en cours de frappe). */
export const suggestArticles = (
  articles: readonly Article[],
  text: string,
  options: { readonly category?: Category; readonly limit?: number; readonly minScore?: number } = {},
): readonly ScoredArticle[] => {
  const query = tokenize(text);
  return articles
    .filter((a) => a.published)
    .map((article) => ({ article, score: scoreArticle(article, query, options.category) }))
    .filter((s) => s.score >= (options.minScore ?? 3))
    .sort((a, b) => b.score - a.score || b.article.deflections - a.article.deflections)
    .slice(0, options.limit ?? 3);
};

/** Statistiques d'auto-dépannage pour le tableau de bord. */
export const knowledgeStats = (articles: readonly Article[]) => ({
  articles: articles.length,
  published: articles.filter((a) => a.published).length,
  views: articles.reduce((s, a) => s + a.views, 0),
  deflections: articles.reduce((s, a) => s + a.deflections, 0),
  top: [...articles]
    .filter((a) => a.deflections > 0)
    .sort((a, b) => b.deflections - a.deflections)
    .slice(0, 5)
    .map((a) => ({ id: a.id, title: a.title, deflections: a.deflections, views: a.views })),
});

export type KnowledgeStats = ReturnType<typeof knowledgeStats>;
