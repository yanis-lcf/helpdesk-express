import { Lock, MessageSquare } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { STATUSES, type Status } from '../../domain';
import { Avatar, PriorityBadge, SlaBadge, StatusBadge } from '../components/Badges';
import { LoadingRows } from '../components/EmptyState';
import { ConfirmDialog } from '../components/Modal';
import { api, type TicketDto } from '../lib/api';
import { STATUS_LABELS } from '../lib/format';
import { useCommand, useTeam, useTickets } from '../lib/hooks';
import { useSession } from '../lib/session';

const PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

export const BoardPage = () => {
  const { actor } = useSession();
  const { data: tickets, isLoading } = useTickets();
  const { data: team = [] } = useTeam();
  const [assignee, setAssignee] = useState<string>('ALL');
  const [dragged, setDragged] = useState<TicketDto | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [pendingClose, setPendingClose] = useState<TicketDto | null>(null);

  const move = useCommand(
    ({ ticket, status }: { ticket: TicketDto; status: Status }) =>
      api.tickets.update.mutate({ ticketId: ticket.id, changes: { status } }),
    (_, { ticket, status }) => `${ticket.reference} → ${STATUS_LABELS[status]}`,
  );

  const visible = (tickets ?? []).filter((t) => assignee === 'ALL' || (assignee === 'UNASSIGNED' ? t.assignee === null : t.assignee === assignee));

  const onDrop = (status: Status) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const ticket = dragged;
    setDragged(null);
    if (!ticket || ticket.status === status || ticket.status === 'CLOSED') return;
    if (status === 'CLOSED') setPendingClose(ticket);
    else move.mutate({ ticket, status });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tableau Kanban</h1>
          <p>Glissez-déposez une carte pour changer son statut. Chaque déplacement est tracé dans le journal.</p>
        </div>
        <div className="page-actions">
          <div className="segmented" role="group" aria-label="Filtrer par agent">
            <button aria-pressed={assignee === 'ALL'} onClick={() => setAssignee('ALL')}>Toute l'équipe</button>
            <button aria-pressed={assignee === actor} onClick={() => setAssignee(actor)}>Mes tickets</button>
            <button aria-pressed={assignee === 'UNASSIGNED'} onClick={() => setAssignee('UNASSIGNED')}>Non assignés</button>
          </div>
          <select className="select filter-select" value={team.some((m) => m.name === assignee) && assignee !== actor ? assignee : ''} onChange={(e) => setAssignee(e.target.value || 'ALL')} aria-label="Agent">
            <option value="">Un agent…</option>
            {team.map((m) => (
              <option key={m.name} value={m.name}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="card"><LoadingRows /></div>
      ) : (
        <div className="board">
          {STATUSES.map((status) => {
            const cards = visible
              .filter((t) => t.status === status)
              .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sla.remainingMs - b.sla.remainingMs);
            const forbidden = dragged !== null && (dragged.status === 'CLOSED' || dragged.status === status);
            return (
              <section
                key={status}
                className={`column ${over === status && !forbidden ? 'drop-target' : ''} ${dragged && forbidden && dragged.status !== status ? 'drop-forbidden' : ''}`}
                onDragOver={(e) => {
                  if (forbidden) return;
                  e.preventDefault();
                  setOver(status);
                }}
                onDragLeave={() => setOver((o) => (o === status ? null : o))}
                onDrop={onDrop(status)}
                aria-label={`Colonne ${STATUS_LABELS[status]}`}
                data-status={status}
              >
                <header className="column-head">
                  <StatusBadge status={status} />
                  <span className="n">{cards.length}</span>
                </header>
                <div className="column-body">
                  {cards.map((t) => {
                    const locked = t.status === 'CLOSED';
                    return (
                      <Link
                        key={t.id}
                        to={`/tickets/${t.id}`}
                        className={`kcard ${dragged?.id === t.id ? 'dragging' : ''} ${locked ? 'locked' : ''}`}
                        draggable={!locked}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', t.id);
                          setDragged(t);
                        }}
                        onDragEnd={() => {
                          setDragged(null);
                          setOver(null);
                        }}
                        data-ticket={t.reference}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="ref">{t.reference}</span>
                          {locked ? <Lock size={13} color="var(--muted)" /> : <PriorityBadge priority={t.priority} label={false} />}
                        </div>
                        <div className="kcard-title">{t.title}</div>
                        <div className="kcard-foot">
                          {t.status === 'OPEN' || t.status === 'IN_PROGRESS' ? <SlaBadge sla={t.sla} /> : <SlaBadge sla={t.sla} compact />}
                          <span className="spacer" />
                          {t.comments.length > 0 && (
                            <span className="muted small" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <MessageSquare size={13} /> {t.comments.length}
                            </span>
                          )}
                          <Avatar name={t.assignee} />
                        </div>
                      </Link>
                    );
                  })}
                  {cards.length === 0 && <p className="muted small" style={{ textAlign: 'center', padding: '24px 0' }}>Déposez une carte ici</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {pendingClose && (
        <ConfirmDialog
          title="Fermer définitivement ce ticket ?"
          message={
            <>
              <strong>{pendingClose.reference} — {pendingClose.title}</strong>
              <br />
              Un ticket fermé ne peut plus être modifié (règle métier). Son historique reste consultable.
            </>
          }
          confirmLabel="Fermer le ticket"
          onCancel={() => setPendingClose(null)}
          onConfirm={() => {
            move.mutate({ ticket: pendingClose, status: 'CLOSED' });
            setPendingClose(null);
          }}
        />
      )}
    </>
  );
};
