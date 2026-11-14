import { Star } from 'lucide-react';

export const RATING_LABELS = ['', 'Très insatisfait', 'Insatisfait', 'Correct', 'Satisfait', 'Très satisfait'] as const;

/** Note de 1 à 5 : en lecture seule (affichage) ou interactive (groupe de boutons radio accessible). */
export const StarRating = ({
  value,
  onChange,
  size = 18,
  label = 'Note',
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: number;
  label?: string;
}) => {
  if (!onChange)
    return (
      <span className="stars" role="img" aria-label={`${value} sur 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={size} className={n <= value ? 'on' : ''} />
        ))}
      </span>
    );
  return (
    <span className="stars interactive" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          role="radio"
          key={n}
          aria-checked={value === n}
          aria-label={`${n} sur 5 — ${RATING_LABELS[n]}`}
          title={RATING_LABELS[n]}
          className={n <= value ? 'on' : ''}
          onClick={() => onChange(n === value ? 0 : n)}
        >
          <Star size={size} />
        </button>
      ))}
    </span>
  );
};
