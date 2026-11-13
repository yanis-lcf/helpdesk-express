import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

/** Saisie d'étiquettes : Entrée ou virgule pour ajouter, Retour arrière pour retirer. */
export const TagInput = ({
  value,
  onChange,
  disabled = false,
  id,
}: {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  id?: string;
}) => {
  const [draft, setDraft] = useState('');

  const add = () => {
    const tag = draft.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && draft === '' && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="input" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', minHeight: 38 }}>
      {value.map((tag) => (
        <span key={tag} className="tag">
          #{tag}
          {!disabled && (
            <button type="button" aria-label={`Retirer ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))}>
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && add()}
          placeholder={value.length ? '' : 'Ajouter une étiquette…'}
          style={{ border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: 'inherit', flex: 1, minWidth: 90, padding: 0 }}
        />
      )}
    </div>
  );
};
