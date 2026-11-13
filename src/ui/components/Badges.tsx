import { CircleAlert, CircleCheck, Clock, Cpu, KeyRound, LayoutGrid, Monitor, Network, TimerOff } from 'lucide-react';
import type { Category, Priority, SlaStatus, Status } from '../../domain';
import { CATEGORY_LABELS, colorFor, formatSla, initials, PRIORITY_LABELS, SLA_LABELS, STATUS_LABELS } from '../lib/format';

export const StatusBadge = ({ status }: { status: Status }) => (
  <span className={`badge st-${status}`}>{STATUS_LABELS[status]}</span>
);

export const PriorityBadge = ({ priority, label = true }: { priority: Priority; label?: boolean }) => (
  <span className={`prio prio-${priority}`} title={`Priorité ${PRIORITY_LABELS[priority].toLowerCase()}`}>
    <span className="prio-bars" aria-hidden>
      <i />
      <i />
      <i />
    </span>
    {label && PRIORITY_LABELS[priority]}
  </span>
);

const SLA_ICONS = { ON_TRACK: Clock, AT_RISK: Clock, BREACHED: CircleAlert, MET: CircleCheck, MISSED: TimerOff };

export const SlaBadge = ({ sla, compact = false }: { sla: { status: SlaStatus; remainingMs: number }; compact?: boolean }) => {
  const Icon = SLA_ICONS[sla.status];
  return (
    <span className={`sla sla-${sla.status}`} title={SLA_LABELS[sla.status]}>
      <Icon size={13} />
      {compact ? SLA_LABELS[sla.status] : formatSla(sla.status, sla.remainingMs)}
    </span>
  );
};

const CATEGORY_ICONS: Record<Category, typeof Cpu> = {
  HARDWARE: Monitor,
  SOFTWARE: Cpu,
  NETWORK: Network,
  ACCESS: KeyRound,
  OTHER: LayoutGrid,
};

export const CategoryLabel = ({ category }: { category: Category }) => {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span className="cat">
      <Icon size={14} />
      {CATEGORY_LABELS[category]}
    </span>
  );
};

export const Avatar = ({ name, size }: { name: string | null; size?: 'lg' }) =>
  name ? (
    <span className={`avatar ${size ?? ''}`} style={{ background: colorFor(name) }} title={name} aria-hidden>
      {initials(name)}
    </span>
  ) : (
    <span className={`avatar avatar-none ${size ?? ''}`} title="Non assigné" aria-hidden>
      ?
    </span>
  );

export const Person = ({ name, fallback = 'Non assigné' }: { name: string | null; fallback?: string }) => (
  <span className="person">
    <Avatar name={name} />
    <span className={name ? '' : 'muted'}>{name ?? fallback}</span>
  </span>
);

export const Tags = ({ tags }: { tags: readonly string[] }) =>
  tags.length ? (
    <span className="tags" style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {tags.map((t) => (
        <span key={t} className="tag">
          #{t}
        </span>
      ))}
    </span>
  ) : null;
