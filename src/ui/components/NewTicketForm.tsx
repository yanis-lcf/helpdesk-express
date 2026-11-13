import { useState, type FormEvent } from 'react';
import { CATEGORIES, LIMITS, PRIORITIES, SLA_TARGET_HOURS, type Category, type Priority } from '../../domain';
import { CATEGORY_LABELS, PRIORITY_LABELS } from '../lib/format';
import { PriorityBadge } from './Badges';
import { TagInput } from './TagInput';

export type NewTicketInput = {
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  requester: string;
  assignee: string | null;
  tags: string[];
};

/** Formulaire de création (composant pur : testable sans serveur). */
export const NewTicketForm = ({
  team,
  submitting = false,
  onSubmit,
  onCancel,
}: {
  team: readonly { name: string }[];
  submitting?: boolean;
  onSubmit: (input: NewTicketInput) => void;
  onCancel: () => void;
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [category, setCategory] = useState<Category>('OTHER');
  const [requester, setRequester] = useState('');
  const [assignee, setAssignee] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const canSubmit = title.trim().length > 0 && !submitting;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ title: title.trim(), description, priority, category, requester: requester.trim(), assignee: assignee || null, tags });
  };

  return (
    <form onSubmit={submit} className="modal-body" style={{ padding: 0 }} aria-label="Nouveau ticket">
      <label className="field">
        <span>Titre *</span>
        <input
          className="input"
          data-autofocus
          value={title}
          maxLength={LIMITS.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. : imprimante du 2e étage hors service"
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Symptômes, poste concerné, message d'erreur…"
          rows={4}
        />
      </label>

      <div className="field">
        <span>
          Priorité <span className="help">— délai de résolution cible : {SLA_TARGET_HOURS[priority]} h</span>
        </span>
        <div className="segmented" role="group" aria-label="Priorité">
          {PRIORITIES.map((p) => (
            <button type="button" key={p} aria-pressed={priority === p} onClick={() => setPriority(p)}>
              <PriorityBadge priority={p} label={false} />
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>Catégorie</span>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Assigner à</span>
          <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Non assigné</option>
            {team.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>
            Demandeur <span className="help">— vous par défaut</span>
          </span>
          <input className="input" value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="Nom, service…" />
        </label>
        <div className="field">
          <span>Étiquettes</span>
          <TagInput value={tags} onChange={setTags} />
        </div>
      </div>

      <div className="modal-foot" style={{ margin: '4px -20px -18px' }}>
        <span className="hint">
          <kbd>Ctrl</kbd> + <kbd>Entrée</kbd> pour créer
        </span>
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!canSubmit}
          onKeyDown={undefined}
        >
          {submitting ? 'Création…' : 'Créer le ticket'}
        </button>
      </div>
    </form>
  );
};
