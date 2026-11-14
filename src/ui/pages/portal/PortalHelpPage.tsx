import { BookOpen, Plus, Search, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES, type Category } from '../../../domain';
import { EmptyState, LoadingRows } from '../../components/EmptyState';
import { ArticleMeta } from '../../components/Knowledge';
import { CATEGORY_LABELS } from '../../lib/format';
import { useKbSearch } from '../../lib/hooks';

/** Centre d'aide : les solutions rédigées par la DSI, consultables à tout moment. */
export const PortalHelpPage = () => {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const { data: articles, isPending } = useKbSearch(query, category);

  return (
    <div className="portal-stack narrow">
      <section className="portal-hero">
        <div>
          <h1>Centre d’aide</h1>
          <p>Les solutions aux problèmes les plus courants, rédigées par la DSI. Souvent plus rapide qu’une demande !</p>
        </div>
        <div className="search-input kb-search">
          <Search size={16} />
          <input
            className="input"
            aria-label="Rechercher une solution"
            placeholder="Ex. : imprimante, VPN, mot de passe…"
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              setParams(e.target.value ? { q: e.target.value } : {}, { replace: true });
            }}
          />
        </div>
        <div className="views" role="group" aria-label="Filtrer par catégorie">
          <button className="view-chip" aria-pressed={!category} onClick={() => setCategory(undefined)}>
            Toutes
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} className="view-chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? undefined : c)}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        {isPending ? (
          <LoadingRows rows={4} />
        ) : !articles?.length ? (
          <EmptyState
            icon={SearchX}
            title="Aucune solution trouvée"
            action={
              <Link to={`/portal/new${query ? `?title=${encodeURIComponent(query)}` : ''}`} className="btn btn-primary">
                <Plus size={16} /> Créer une demande
              </Link>
            }
          >
            Pas de panique : la DSI s’en occupe. Décrivez votre problème en quelques secondes.
          </EmptyState>
        ) : (
          <ul className="request-list" aria-label="Articles">
            {articles.map((a) => (
              <li key={a.id}>
                <Link className="request kb-item" to={`/portal/help/${a.id}`}>
                  <BookOpen size={18} className="kb-icon" />
                  <span className="request-main">
                    <b>{a.title}</b>
                    <span className="muted small">{a.excerpt}</span>
                    <ArticleMeta article={a} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
