import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Plus, SearchX, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, LoadingRows } from '../../components/EmptyState';
import { ArticleBody, ArticleMeta } from '../../components/Knowledge';
import { api } from '../../lib/api';
import { formatFullDate } from '../../lib/format';
import { useCommand } from '../../lib/hooks';

export const PortalArticlePage = () => {
  const { articleId = '' } = useParams();
  const navigate = useNavigate();
  const [thanked, setThanked] = useState(false);
  // La lecture est comptabilisée une seule fois par affichage (même en double rendu de développement).
  const read = useMutation({ mutationFn: (id: string) => api.kb.read.mutate({ id }) });
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (requested.current === articleId) return;
    requested.current = articleId;
    read.mutate(articleId);
  }, [articleId, read]);
  const helpful = useCommand((id: string) => api.kb.helpful.mutate({ id }), 'Merci pour votre retour !');

  const article = read.data;
  if (read.isError)
    return (
      <div className="card">
        <EmptyState icon={SearchX} title="Article introuvable" action={<Link to="/portal/help" className="btn">Centre d’aide</Link>}>
          Cet article n’existe pas ou n’est plus publié.
        </EmptyState>
      </div>
    );
  if (!article) return <div className="card"><LoadingRows /></div>;

  return (
    <div className="portal-stack narrow">
      <Link to="/portal/help" className="back-link">
        <ArrowLeft size={15} /> Centre d’aide
      </Link>
      <article className="card card-pad article">
        <header>
          <ArticleMeta article={article} />
          <h1>{article.title}</h1>
          <span className="muted small">
            Par {article.author} · mis à jour le {formatFullDate(article.updatedAt)}
          </span>
        </header>
        <ArticleBody body={article.body} />
      </article>

      <section className="card card-pad kb-feedback" aria-label="Cet article vous a-t-il aidé ?">
        {thanked ? (
          <b>Parfait ! Aucune demande n’est nécessaire. Bonne journée 🙂</b>
        ) : (
          <>
            <b>Cet article a-t-il résolu votre problème ?</b>
            <div className="form-actions">
              <button
                className="btn"
                onClick={() => navigate(`/portal/new?category=${article.category}&title=${encodeURIComponent(article.title)}`)}
              >
                <Plus size={15} /> Non, je crée une demande
              </button>
              <button className="btn btn-success" disabled={helpful.isPending} onClick={() => helpful.mutate(article.id, { onSuccess: () => setThanked(true) })}>
                <ThumbsUp size={15} /> Oui, c’est réglé
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
