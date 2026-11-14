import { ArrowLeft, Check, CheckCircle2, CircleDot, Inbox, MessageSquare, RotateCcw, SearchX, Send, UserCheck, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SLA_TARGET_HOURS } from '../../../domain';
import { Avatar, PriorityBadge, StatusBadge } from '../../components/Badges';
import { EmptyState, LoadingRows } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { api, errorCode, type PortalTicketDto } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { CATEGORY_LABELS, formatDateTime, formatFullDate, formatRelative, IMPACT_LABELS } from '../../lib/format';
import { useCommand, usePortalTicket } from '../../lib/hooks';
import { progressLabel } from './PortalHomePage';

const STEPS = [
  { label: 'Envoyée', icon: Inbox },
  { label: 'Prise en charge', icon: UserCheck },
  { label: 'En cours', icon: Wrench },
  { label: 'Résolue', icon: CheckCircle2 },
  { label: 'Clôturée', icon: Check },
] as const;

/** Étape atteinte (0-based) : un employé voit l'avancement sans jargon. */
export const progressStep = (t: Pick<PortalTicketDto, 'status' | 'assignee'>): number => {
  switch (t.status) {
    case 'OPEN':
      return t.assignee ? 1 : 0;
    case 'IN_PROGRESS':
      return 2;
    case 'RESOLVED':
      return 3;
    case 'CLOSED':
      return 4;
  }
};

export const PortalTicketPage = () => {
  const { ticketId = '' } = useParams();
  const { user } = useAuth();
  const { data: ticket, isPending, error } = usePortalTicket(ticketId);
  const [message, setMessage] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState('');

  const reply = useCommand((body: string) => api.portal.reply.mutate({ ticketId, body }), 'Message envoyé à la DSI');
  const confirm = useCommand(() => api.portal.confirmResolution.mutate({ ticketId }), 'Merci ! Votre demande est clôturée.');
  const reopen = useCommand((r: string) => api.portal.reopen.mutate({ ticketId, reason: r }), 'Demande rouverte : la DSI est prévenue');

  if (isPending) return <div className="card"><LoadingRows /></div>;
  if (error || !ticket)
    return (
      <div className="card">
        <EmptyState
          icon={SearchX}
          title={errorCode(error) === 'NOT_FOUND' ? 'Demande introuvable' : 'Impossible de charger la demande'}
          action={<Link to="/portal" className="btn">Retour à mes demandes</Link>}
        >
          Cette demande n’existe pas ou ne vous appartient pas.
        </EmptyState>
      </div>
    );

  const step = progressStep(ticket);
  const canReply = ticket.actions.includes('REPLY');
  const awaitingConfirmation = ticket.actions.includes('CONFIRM_RESOLUTION');
  const due = new Date(Date.parse(ticket.createdAt) + SLA_TARGET_HOURS[ticket.priority] * 3_600_000).toISOString();

  return (
    <div className="portal-stack">
      <Link to="/portal" className="back-link">
        <ArrowLeft size={15} /> Mes demandes
      </Link>

      <header className="page-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
            <span className="ref">{ticket.reference}</span>
            <StatusBadge status={ticket.status} />
          </div>
          <h1>{ticket.title}</h1>
          <p>{progressLabel(ticket)}</p>
        </div>
      </header>

      <ol className="stepper" aria-label="Avancement de la demande">
        {STEPS.map(({ label, icon: Icon }, i) => (
          <li key={label} className={i < step ? 'done' : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="stepper-dot">
              <Icon size={15} />
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      {awaitingConfirmation && (
        <section className="card confirm-card" aria-label="Confirmation de résolution">
          <CheckCircle2 size={22} />
          <div>
            <h2>La DSI indique avoir résolu votre demande</h2>
            <p className="muted">Tout fonctionne de nouveau ? Votre confirmation clôture la demande.</p>
          </div>
          <div className="confirm-actions">
            <button className="btn" onClick={() => setReopenOpen(true)}>
              <RotateCcw size={15} /> Non, le problème persiste
            </button>
            <button className="btn btn-primary" disabled={confirm.isPending} onClick={() => confirm.mutate(undefined)}>
              <Check size={15} /> Oui, c’est résolu
            </button>
          </div>
        </section>
      )}

      <div className="detail">
        <section className="card">
          <div className="card-head">
            <h2>
              <MessageSquare size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
              Échanges avec la DSI
            </h2>
            <span className="hint">{ticket.comments.length} message(s)</span>
          </div>
          <div className="thread">
            <div className="msg">
              <Avatar name={ticket.requester} />
              <div className="msg-body">
                <header>
                  <b>{ticket.requester}</b> {formatDateTime(ticket.createdAt)} · demande initiale
                </header>
                <p>{ticket.description || <span className="muted">Aucune description.</span>}</p>
              </div>
            </div>
            {ticket.comments.map((c) => (
              <div key={c.id} className={`msg ${c.author === user?.name ? 'mine' : 'staff'}`}>
                <Avatar name={c.author} />
                <div className="msg-body">
                  <header>
                    <b>{c.author}</b>
                    {c.author !== user?.name && <span className="tag">DSI</span>}
                    <span title={formatFullDate(c.createdAt)}>{formatRelative(c.createdAt)}</span>
                  </header>
                  <p>{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          {canReply ? (
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (!message.trim()) return;
                reply.mutate(message, { onSuccess: () => setMessage('') });
              }}
            >
              <textarea
                className="textarea"
                rows={3}
                aria-label="Votre message"
                placeholder="Ajouter une précision, répondre à une question de la DSI…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
                }}
              />
              <div className="composer-actions">
                <span className="muted small">Ctrl + Entrée pour envoyer</span>
                <button className="btn btn-primary" type="submit" disabled={!message.trim() || reply.isPending}>
                  <Send size={15} /> Envoyer
                </button>
              </div>
            </form>
          ) : (
            <div className="composer">
              <div className="banner banner-info">
                <CircleDot size={15} /> Demande clôturée. Un nouveau problème ? Créez une nouvelle demande.
              </div>
            </div>
          )}
        </section>

        <aside className="card props" aria-label="Informations">
          <div className="prop">
            <span>Catégorie</span>
            <b>{CATEGORY_LABELS[ticket.category]}</b>
          </div>
          <div className="prop">
            <span>Impact déclaré</span>
            <span className="prio-line">
              <PriorityBadge priority={ticket.priority} label={false} /> {IMPACT_LABELS[ticket.priority].title}
            </span>
          </div>
          <div className="prop">
            <span>Technicien</span>
            {ticket.assignee ? (
              <span className="person">
                <Avatar name={ticket.assignee} /> <span>{ticket.assignee}</span>
              </span>
            ) : (
              <span className="muted">Bientôt attribué</span>
            )}
          </div>
          <div className="prop">
            <span>Envoyée le</span>
            <span>{formatFullDate(ticket.createdAt)}</span>
          </div>
          <div className="prop">
            <span>{ticket.resolvedAt ? 'Résolue le' : 'Résolution visée avant'}</span>
            <span>{formatFullDate(ticket.resolvedAt ?? due)}</span>
          </div>
        </aside>
      </div>

      {reopenOpen && (
        <Modal
          title="Le problème persiste ?"
          size="sm"
          onClose={() => setReopenOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setReopenOpen(false)}>
                Annuler
              </button>
              <button
                className="btn btn-primary"
                disabled={!reason.trim() || reopen.isPending}
                onClick={() =>
                  reopen.mutate(reason, {
                    onSuccess: () => {
                      setReopenOpen(false);
                      setReason('');
                    },
                  })
                }
              >
                Rouvrir la demande
              </button>
            </>
          }
        >
          <label className="field">
            <span>Que se passe-t-il encore ?</span>
            <textarea
              className="textarea"
              data-autofocus
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. : le VPN se déconnecte toujours au bout de 10 minutes."
            />
          </label>
        </Modal>
      )}
    </div>
  );
};
