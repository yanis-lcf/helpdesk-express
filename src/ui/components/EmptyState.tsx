import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export const EmptyState = ({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) => (
  <div className="empty">
    <div className="empty-icon">
      <Icon size={24} />
    </div>
    <h3>{title}</h3>
    {children && <p style={{ maxWidth: 380 }}>{children}</p>}
    {action}
  </div>
);

export const Skeleton = ({ height = 16, width = '100%' }: { height?: number; width?: number | string }) => (
  <div className="skeleton" style={{ height, width }} />
);

export const LoadingRows = ({ rows = 5 }: { rows?: number }) => (
  <div style={{ display: 'grid', gap: 12, padding: 18 }} aria-busy="true" aria-label="Chargement">
    {Array.from({ length: rows }, (_, i) => (
      <Skeleton key={i} height={18} width={`${90 - (i % 3) * 15}%`} />
    ))}
  </div>
);
