import { BookOpen, ChevronDown, ChevronUp, Lightbulb, ThumbsUp } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import type { Category } from '../../domain';
import { api, type ArticleDto, type ArticleSummaryDto } from '../lib/api';
import { CATEGORY_LABELS } from '../lib/format';
import { useCommand, useKbSuggestions } from '../lib/hooks';

/** Liens http(s) rendus cliquables ; tout le reste est du texte (aucun HTML interprété). */
const linkify = (text: string): ReactNode[] =>
  text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );

/** Affiche le texte d'un article : paragraphes, listes à puces (« - ») et étapes numérotées (« 1. »). */
export const ArticleBody = ({ body }: { body: string }) => {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length}>
        {list.items.map((item, i) => (
          <li key={i}>{linkify(item)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-•]\s+(.*)$/.exec(line);
    const step = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || step) {
      const ordered = Boolean(step);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? step)![1]!);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={blocks.length}>{linkify(line)}</p>);
  }
  flush();
  return <div className="article-body">{blocks}</div>;
};

export const ArticleMeta = ({ article }: { article: Pick<ArticleSummaryDto, 'category' | 'deflections'> }) => (
  <span className="muted small">
    {CATEGORY_LABELS[article.category]}
    {article.deflections > 0 && ` · a aidé ${article.deflections} collègue${article.deflections > 1 ? 's' : ''}`}
  </span>
);

/**
 * Solutions suggérées pendant la saisie d'une demande : l'employé peut se dépanner seul
 * (demande évitée) au lieu d'attendre la DSI.
 */
export const KbSuggestions = ({ text, category, onResolved }: { text: string; category: Category; onResolved: () => void }) => {
  const { data: suggestions } = useKbSuggestions(text, category);
  const [open, setOpen] = useState<ArticleDto | null>(null);
  const read = useCommand((id: string) => api.kb.read.mutate({ id }));
  const helpful = useCommand((id: string) => api.kb.helpful.mutate({ id }), 'Tant mieux ! Aucune demande n’a été envoyée.');

  if (!suggestions?.length) return null;
  return (
    <section className="kb-suggest" aria-label="Solutions suggérées">
      <header>
        <Lightbulb size={16} />
        <b>Ces solutions peuvent régler votre problème tout de suite</b>
      </header>
      <ul>
        {suggestions.map((s) => {
          const expanded = open?.id === s.id;
          return (
            <li key={s.id} className={expanded ? 'expanded' : ''}>
              <button
                type="button"
                className="kb-suggest-title"
                aria-expanded={expanded}
                onClick={() => (expanded ? setOpen(null) : read.mutate(s.id, { onSuccess: setOpen }))}
              >
                <BookOpen size={15} />
                <span>
                  <b>{s.title}</b>
                  {!expanded && <span className="muted small">{s.excerpt}</span>}
                </span>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {expanded && open && (
                <div className="kb-suggest-body">
                  <ArticleBody body={open.body} />
                  <div className="kb-suggest-actions">
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      disabled={helpful.isPending}
                      onClick={() => helpful.mutate(open.id, { onSuccess: onResolved })}
                    >
                      <ThumbsUp size={14} /> Cela a résolu mon problème
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setOpen(null)}>
                      Non, je continue ma demande
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
