import { CircleAlert, CircleCheck, Clock, Gauge, Inbox, UserX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, PRIORITIES, SLA_TARGET_HOURS } from '../../domain';
import { Avatar, PriorityBadge, SlaBadge } from '../components/Badges';
import { BarList, Ring, TrendChart } from '../components/Charts';
import { EmptyState, Skeleton } from '../components/EmptyState';
import { useUi } from '../components/Layout';
import { CATEGORY_LABELS, formatDuration, PRIORITY_LABELS } from '../lib/format';
import { useDashboard } from '../lib/hooks';
import { useSession } from '../lib/session';

const Kpi = ({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: 'alert' | 'good' | 'warn' }) => (
  <div className={`card kpi ${tone ?? ''}`}>
    <div className="kpi-label">
      <span className="kpi-icon">{icon}</span>
      {label}
    </div>
    <div className="kpi-value">{value}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>
);

const PRIORITY_COLORS = { HIGH: 'var(--high)', MEDIUM: 'var(--medium)', LOW: 'var(--low)' } as const;

export const DashboardPage = () => {
  const { data, isLoading } = useDashboard();
  const { actor } = useSession();
  const { openNewTicket } = useUi();
  const firstName = actor.split(' ')[0];
  const hour = new Date().getHours();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{hour < 18 ? 'Bonjour' : 'Bonsoir'} {firstName} 👋</h1>
          <p>Vue d'ensemble du support en temps réel, calculée à partir du journal d'événements.</p>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="kpis">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="card kpi">
              <Skeleton height={14} width="60%" />
              <Skeleton height={30} width="40%" />
            </div>
          ))}
        </div>
      ) : data.totals.active === 0 ? (
        <div className="card">
          <EmptyState
            icon={Inbox}
            title="Aucun ticket pour l'instant"
            action={<button className="btn btn-primary" onClick={openNewTicket}>Créer le premier ticket</button>}
          >
            Les indicateurs apparaîtront dès les premiers tickets. Astuce : lancez <code>npm run seed</code> pour charger des
            données de démonstration.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="kpis">
            <Kpi icon={<Inbox size={16} />} label="Tickets en file" value={data.totals.backlog} sub={`${data.byStatus.OPEN} ouverts · ${data.byStatus.IN_PROGRESS} en cours`} />
            <Kpi icon={<CircleAlert size={16} />} label="SLA dépassés" value={data.totals.breached} tone={data.totals.breached ? 'alert' : 'good'} sub={`${data.totals.atRisk} à risque`} />
            <Kpi icon={<UserX size={16} />} label="Non assignés" value={data.totals.unassigned} tone={data.totals.unassigned ? 'warn' : undefined} sub="en attente de prise en charge" />
            <Kpi icon={<Clock size={16} />} label="Temps moyen de résolution" value={data.avgResolutionHours === null ? '—' : formatDuration(data.avgResolutionHours * 3_600_000)} sub="création → résolution" />
            <Kpi icon={<CircleCheck size={16} />} label="Résolus sur 7 jours" value={data.totals.resolvedLast7Days} tone="good" sub={`${data.byStatus.CLOSED} fermés au total`} />
          </div>

          <div className="dash-grid">
            <section className="card">
              <div className="card-head">
                <h2>Activité des 14 derniers jours</h2>
                <div className="legend">
                  <span><i style={{ background: 'var(--primary)' }} />Créés</span>
                  <span><i style={{ background: 'var(--resolved)' }} />Résolus</span>
                </div>
              </div>
              <div className="card-pad">
                <TrendChart data={data.trend} />
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Respect des SLA</h2>
                <Gauge size={16} color="var(--muted)" />
              </div>
              <div className="card-pad" style={{ display: 'grid', gap: 16 }}>
                <div className="ring-wrap">
                  <Ring ratio={data.slaCompliance} label="Taux de respect des SLA" />
                  <p className="muted small">
                    Part des tickets résolus dans le délai cible.
                    <br />
                    Objectifs : {PRIORITIES.map((p) => `${PRIORITY_LABELS[p]} ${SLA_TARGET_HOURS[p]} h`).join(' · ')}
                  </p>
                </div>
                <BarList
                  items={PRIORITIES.map((p) => ({
                    key: p,
                    label: <PriorityBadge priority={p} />,
                    value: data.byPriority[p],
                    color: PRIORITY_COLORS[p],
                  })).reverse()}
                />
              </div>
            </section>
          </div>

          <div className="dash-grid-3">
            <section className="card">
              <div className="card-head">
                <h2>À traiter en priorité</h2>
                <Link to="/tickets" className="small">Tout voir</Link>
              </div>
              <div className="attention-list">
                {data.attention.length === 0 && <p className="muted card-pad">Rien d'urgent. 🎉</p>}
                {data.attention.map((t) => (
                  <Link key={t.id} to={`/tickets/${t.id}`} className="attention-item">
                    <PriorityBadge priority={t.priority} label={false} />
                    <div style={{ minWidth: 0 }}>
                      <div className="title">{t.title}</div>
                      <span className="ref">{t.reference}</span>
                    </div>
                    <SlaBadge sla={t.sla} />
                  </Link>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Charge par agent</h2>
                <span className="hint">tickets en file</span>
              </div>
              <div className="card-pad">
                <BarList
                  items={data.workload.map((w) => ({
                    key: w.assignee ?? '∅',
                    label: (
                      <span className="person">
                        <Avatar name={w.assignee} />
                        <span className={w.assignee ? '' : 'muted'}>{w.assignee ?? 'Non assignés'}</span>
                      </span>
                    ),
                    value: w.count,
                    color: w.assignee ? 'var(--primary)' : 'var(--warning)',
                  }))}
                />
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Par catégorie</h2>
                <span className="hint">tickets en file</span>
              </div>
              <div className="card-pad">
                <BarList
                  items={CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c], value: data.byCategory[c], color: 'var(--open)' })).sort(
                    (a, b) => b.value - a.value,
                  )}
                />
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
};
