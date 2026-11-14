import { BookOpen, Eye, FilePlus2, Search, ThumbsUp } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ARTICLE_LIMITS, CATEGORIES, normalizeText, type Category } from '../../domain';
import { EmptyState, LoadingRows } from '../components/EmptyState';
import { ArticleBody } from '../components/Knowledge';
import { Modal } from '../components/Modal';
import { api, type ArticleDto } from '../lib/api';
import { CATEGORY_LABELS, formatRelative } from '../lib/format';
import { useCommand, useKbArticles } from '../lib/hooks';

type Draft = { title: string; body: string; category: Category; keywords: string; published: boolean };

const EMPTY: Draft = { title: '', body: '', category: 'OTHER', keywords: '', published: true };
const toDraft = (a: ArticleDto): Draft => ({ title: a.title, body: a.body, category: a.category, keywords: a.keywords.join(', '), published: a.published });

const ArticleEditor = ({ article, onDone }: { article: ArticleDto | null; onDone: () => void }) => {
  const [draft, setDraft] = useState<Draft>(article ? toDraft(article) : EMPTY);
  const [preview, setPreview] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toInput = (d: Draft) => ({
    title: d.title,
    body: d.body,
    category: d.category,
    keywords: d.keywords.split(',').map((k) => k.trim()).filter(Boolean),
    published: d.published,
  });
  const save = useCommand(
    (d: Draft) => (article ? api.kb.update.mutate({ id: article.id, ...toInput(d) }) : api.kb.create.mutate(toInput(d))),
    (a) => (article ? `Article « ${a.title} » mis à jour` : `Article « ${a.title} » créé`),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(draft, { onSuccess: onDone });
  };

  return (
    <Modal title={article ? 'Modifier l’article' : 'Nouvel article'} onClose={onDone}>
      <form onSubmit={submit} className="kb-editor" aria-label="Article">
        <label className="field">
          <span>Titre *</span>
          <input
            className="input"
            data-autofocus
            required
            maxLength={ARTICLE_LIMITS.title}
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Formulé comme le problème de l’utilisateur : « Outlook ne démarre plus »"
          />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Catégorie</span>
            <select className="select" value={draft.category} onChange={(e) => set('category', e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Mots-clés <span className="help">séparés par des virgules</span>
            </span>
            <input className="input" value={draft.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder="vpn, télétravail, certificat" />
          </label>
        </div>
        <div className="field">
          <span className="kb-editor-label">
            Solution *{' '}
            <span className="help">— « 1. » pour une étape, « - » pour une puce</span>
            <button type="button" className="btn btn-ghost btn-sm" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
              <Eye size={14} /> {preview ? 'Modifier' : 'Aperçu'}
            </button>
          </span>
          {preview ? (
            <div className="kb-preview">
              <ArticleBody body={draft.body || '(vide)'} />
            </div>
          ) : (
            <textarea
              className="textarea"
              aria-label="Solution"
              required
              rows={10}
              maxLength={ARTICLE_LIMITS.body}
              value={draft.body}
              onChange={(e) => set('body', e.target.value)}
            />
          )}
        </div>
        <label className="switch">
          <input type="checkbox" role="switch" aria-label="Publié sur le portail" checked={draft.published} onChange={(e) => set('published', e.target.checked)} />
          <span>{draft.published ? 'Publié sur le portail employé' : 'Brouillon (visible par la DSI uniquement)'}</span>
        </label>
        <div className="modal-foot" style={{ margin: '4px -20px -18px' }}>
          <button type="button" className="btn" onClick={onDone}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** Back-office : rédaction de la base de connaissances et mesure de son efficacité (demandes évitées). */
export const KnowledgePage = () => {
  const { data: articles, isPending } = useKbArticles();
  const [editing, setEditing] = useState<ArticleDto | 'new' | null>(null);
  const [search, setSearch] = useState('');

  const all = articles ?? [];
  const q = normalizeText(search);
  const visible = all.filter((a) => !q || normalizeText(`${a.title} ${a.keywords.join(' ')}`).includes(q));
  const totals = {
    published: all.filter((a) => a.published).length,
    views: all.reduce((s, a) => s + a.views, 0),
    deflections: all.reduce((s, a) => s + a.deflections, 0),
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Base de connaissances</h1>
          <p>Les solutions proposées aux employés pendant qu’ils rédigent leur demande : chaque problème résolu ainsi est un ticket évité.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <FilePlus2 size={16} /> Nouvel article
        </button>
      </header>

      <div className="kpis kb-kpis">
        <div className="card kpi">
          <span className="kpi-label">
            <BookOpen size={14} /> Articles publiés
          </span>
          <span className="kpi-value">{totals.published}</span>
          <span className="kpi-sub">{all.length - totals.published} brouillon(s)</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">
            <Eye size={14} /> Consultations
          </span>
          <span className="kpi-value">{totals.views}</span>
          <span className="kpi-sub">depuis le portail</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">
            <ThumbsUp size={14} /> Demandes évitées
          </span>
          <span className="kpi-value">{totals.deflections}</span>
          <span className="kpi-sub">problèmes résolus sans ticket</span>
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input className="input" aria-label="Rechercher un article" placeholder="Titre, mot-clé…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {isPending ? (
          <LoadingRows />
        ) : visible.length === 0 ? (
          <EmptyState icon={BookOpen} title="Aucun article" action={<button className="btn btn-primary" onClick={() => setEditing('new')}>Rédiger le premier</button>}>
            Commencez par les 5 demandes les plus fréquentes : mot de passe, imprimante, VPN…
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Catégorie</th>
                  <th>État</th>
                  <th className="num">Consultations</th>
                  <th className="num">Demandes évitées</th>
                  <th>Mis à jour</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id} tabIndex={0} onClick={() => setEditing(a)} onKeyDown={(e) => e.key === 'Enter' && setEditing(a)} aria-label={`Modifier ${a.title}`}>
                    <td>
                      <span className="cell-title">
                        <strong>{a.title}</strong>
                        <span className="muted small">{a.keywords.join(', ') || '—'}</span>
                      </span>
                    </td>
                    <td className="small">{CATEGORY_LABELS[a.category]}</td>
                    <td>{a.published ? <span className="badge st-RESOLVED">Publié</span> : <span className="badge st-CLOSED">Brouillon</span>}</td>
                    <td className="num">{a.views}</td>
                    <td className="num">
                      <b>{a.deflections}</b>
                    </td>
                    <td className="small muted">
                      {formatRelative(a.updatedAt)} · {a.author}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <ArticleEditor article={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
    </>
  );
};
