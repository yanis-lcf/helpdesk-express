import { ArrowLeft, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES, isCategory, LIMITS, PRIORITIES, SLA_TARGET_HOURS, type Category, type Priority } from '../../../domain';
import { PriorityBadge } from '../../components/Badges';
import { KbSuggestions } from '../../components/Knowledge';
import { api } from '../../lib/api';
import { CATEGORY_LABELS, IMPACT_LABELS } from '../../lib/format';
import { useCommand } from '../../lib/hooks';
import { CATEGORY_HELP } from './PortalHomePage';

export const PortalNewTicketPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initial = params.get('category');
  const [category, setCategory] = useState<Category>(isCategory(initial) ? initial : 'OTHER');
  const [title, setTitle] = useState(params.get('title') ?? '');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');

  const submit = useCommand(
    (input: { title: string; description: string; category: Category; priority: Priority }) => api.portal.submit.mutate(input),
    'Demande envoyée à la DSI',
  );
  const canSubmit = title.trim().length > 0 && !submit.isPending;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    submit.mutate({ title: title.trim(), description, category, priority }, { onSuccess: (r) => navigate(`/portal/${r.ticketId}`) });
  };

  return (
    <div className="portal-stack narrow">
      <Link to="/portal" className="back-link">
        <ArrowLeft size={15} /> Mes demandes
      </Link>
      <form className="card card-pad portal-form" onSubmit={onSubmit} aria-label="Nouvelle demande">
        <div>
          <h1>Nouvelle demande</h1>
          <p className="muted">Plus votre description est précise, plus la résolution sera rapide.</p>
        </div>

        <fieldset className="field">
          <legend>De quoi s’agit-il ?</legend>
          <div className="category-grid compact" role="radiogroup" aria-label="Catégorie">
            {CATEGORIES.map((c) => {
              const { icon: Icon, hint } = CATEGORY_HELP[c];
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  key={c}
                  className="category-card"
                  onClick={() => setCategory(c)}
                >
                  <Icon size={18} />
                  <b>{CATEGORY_LABELS[c]}</b>
                  <span>{hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="field">
          <span>Résumé du problème *</span>
          <input
            className="input"
            value={title}
            maxLength={LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. : Je n’arrive plus à me connecter au VPN"
          />
        </label>

        <KbSuggestions text={title} category={category} onResolved={() => navigate('/portal')} />

        <label className="field">
          <span>
            Détails <span className="help">— depuis quand, message d’erreur, poste concerné…</span>
          </span>
          <textarea
            className="textarea"
            rows={5}
            value={description}
            maxLength={LIMITS.description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décrivez ce qui se passe et ce que vous avez déjà essayé."
          />
        </label>

        <fieldset className="field">
          <legend>Quel est l’impact sur votre travail ?</legend>
          <div className="impact-list" role="radiogroup" aria-label="Impact">
            {[...PRIORITIES].reverse().map((p) => (
              <button type="button" role="radio" aria-checked={priority === p} key={p} className="impact" onClick={() => setPriority(p)}>
                <PriorityBadge priority={p} label={false} />
                <span>
                  <b>{IMPACT_LABELS[p].title}</b>
                  <small>{IMPACT_LABELS[p].hint}</small>
                </span>
                <span className="muted small">Objectif : {SLA_TARGET_HOURS[p]} h</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="form-actions">
          <Link to="/portal" className="btn">
            Annuler
          </Link>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            <Send size={15} /> {submit.isPending ? 'Envoi…' : 'Envoyer à la DSI'}
          </button>
        </div>
      </form>
    </div>
  );
};
