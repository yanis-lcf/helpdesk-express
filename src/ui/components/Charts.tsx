/** Graphiques SVG légers, sans dépendance. Couleurs via variables CSS (thèmes clair/sombre). */
import type { ReactNode } from 'react';

type TrendPoint = { date: string; created: number; resolved: number };

export const TrendChart = ({ data }: { data: readonly TrendPoint[] }) => {
  const W = 640;
  const H = 200;
  const pad = { top: 12, right: 8, bottom: 24, left: 26 };
  const max = Math.max(4, ...data.flatMap((d) => [d.created, d.resolved]));
  const step = (W - pad.left - pad.right) / data.length;
  const barW = Math.min(14, step / 2 - 3);
  const y = (v: number) => pad.top + (H - pad.top - pad.bottom) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tickets créés et résolus par jour">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t ? '3 4' : undefined} />
          <text x={pad.left - 8} y={y(t) + 3} textAnchor="end">{t}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = pad.left + i * step + step / 2;
        const label = new Date(`${d.date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        return (
          <g key={d.date}>
            <rect x={x - barW - 1} y={y(d.created)} width={barW} height={y(0) - y(d.created)} rx={3} fill="var(--primary)">
              <title>{`${label} : ${d.created} créé(s)`}</title>
            </rect>
            <rect x={x + 1} y={y(d.resolved)} width={barW} height={y(0) - y(d.resolved)} rx={3} fill="var(--resolved)">
              <title>{`${label} : ${d.resolved} résolu(s)`}</title>
            </rect>
            {(i % 2 === 0 || data.length <= 7) && (
              <text x={x} y={H - 6} textAnchor="middle">{label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export const BarList = ({
  items,
  color = 'var(--primary)',
}: {
  items: readonly { label: ReactNode; value: number; key: string; color?: string }[];
  color?: string;
}) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="barlist">
      {items.map((item) => (
        <div className="barlist-row" key={item.key}>
          <header>
            <span>{item.label}</span>
            <b>{item.value}</b>
          </header>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: item.color ?? color }} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const Ring = ({ ratio, size = 96, label }: { ratio: number | null; size?: number; label: string }) => {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const value = ratio ?? 0;
  const color = ratio === null ? 'var(--border)' : value >= 0.9 ? 'var(--success)' : value >= 0.7 ? 'var(--warning)' : 'var(--danger)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={9} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={{ fill: 'var(--text)', fontSize: 19, fontWeight: 700 }}>
        {ratio === null ? '—' : `${Math.round(value * 100)}%`}
      </text>
    </svg>
  );
};
