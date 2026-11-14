import { BookOpen, CircleAlert, CircleCheck, Clock, Gauge, Inbox, Smile, UserX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, PRIORITIES, SLA_TARGET_HOURS } from '../../domain';
import { Avatar, PriorityBadge, SlaBadge } from '../components/Badges';
import { BarList, Ring, TrendChart } from '../components/Charts';
import { EmptyState, Skeleton } from '../components/EmptyState';
import { StarRating } from '../components/Rating';
import { useUi } from '../components/Layout';
import { CATEGORY_LABELS, formatDuration, formatRelative, PRIORITY_LABELS } from '../lib/format';
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
const RATING_COLORS = ['', 'var(--danger)', 'var(--high)', 'var(--warning)', 'var(--resolved)', 'var(--success)'] as const;
const percent = (ratio: number) => `${Math.round(ratio * 100)} %`;

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
            <Kpi
              icon={<Smile size={16} />}
              label="Satisfaction (CSAT)"
              value={data.satisfaction.csat === null ? '—' : percent(data.satisfaction.csat)}
              tone={data.satisfaction.csat !== null && data.satisfaction.csat < 0.7 ? 'warn' : undefined}
              sub={
                data.satisfaction.average === null
                  ? 'aucun avis pour l’instant'
                  : `${data.satisfaction.average.toFixed(1).replace('.', ',')}/5 · ${data.satisfaction.responses} avis`
              }
            />
            <Kpi
              icon={<BookOpen size={16} />}
              label="Demandes évitées"
              value={data.knowledge.deflections}
              tone="good"
              sub={`grâce à ${data.knowledge.published} articles d’aide`}
            />
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

          <div className="dash-grid">
            <section className="card" aria-label="Satisfaction des utilisateurs">
              <div className="card-head">
                <h2>Satisfaction des utilisateurs</h2>
                <span className="hint">avis donnés à la clôture</span>
              </div>
              <div className="card-pad satisfaction">
                <BarList
                  items={[5, 4, 3, 2, 1].map((n) => ({
                    key: String(n),
                    label: <StarRating value={n} size={13} />,
                    value: data.satisfaction.distribution[n as 1 | 2 | 3 | 4 | 5],
                    color: RATING_COLORS[n]!,
                  }))}
                />
                <ul className="feedback-list">
                  {data.satisfaction.recent.length === 0 && <li className="muted small">Aucun commentaire pour l’instant.</li>}
                  {data.satisfaction.recent.map((r) => (
                    <li key={r.ticketId}>
                      <StarRating value={r.rating} size={12} />
                      <span>« {r.comment} »</span>
                      <Link to={`/tickets/${r.ticketId}`} className="muted small">
                        {r.ratedBy} · {r.reference} · {formatRelative(r.ratedAt)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="card" aria-label="Auto-dépannage">
              <div className="card-head">
                <h2>Auto-dépannage</h2>
                <Link to="/knowledge" className="small">Base de connaissances</Link>
              </div>
              <div className="card-pad">
                <p className="muted small" style={{ marginTop: 0 }}>
                  {data.knowledge.views} consultations · {data.knowledge.deflections} problèmes résolus sans ticket
                </p>
                <BarList
                  items={data.knowledge.top.map((a) => ({ key: a.id, label: a.title, value: a.deflections, color: 'var(--success)' }))}
                />
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
};
