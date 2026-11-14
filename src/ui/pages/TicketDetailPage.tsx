import {
  ArrowLeft,
  History,
  Lock,
  MessageSquare,
  PencilLine,
  Plus,
  Send,
  StickyNote,
  Star,
  Trash2,
  TriangleAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CATEGORIES,
  PRIORITIES,
  rehydrate,
  STATUSES,
  type Category,
  type Priority,
  type Status,
  type TicketEvent,
  type TicketEventType,
} from '../../domain';
import { Avatar, CategoryLabel, Person, PriorityBadge, SlaBadge, StatusBadge } from '../components/Badges';
import { EmptyState, LoadingRows } from '../components/EmptyState';
import { ConfirmDialog } from '../components/Modal';
import { TagInput } from '../components/TagInput';
import { api, type AuditEntryDto, type TicketDetailsDto } from '../lib/api';
import {
  CATEGORY_LABELS,
  EVENT_LABELS,
  FIELD_LABELS,
  formatDateTime,
  formatFieldValue,
  formatFullDate,
  formatRelative,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from '../lib/format';
import { useCommand, useKbArticles, useTeam, useTicket } from '../lib/hooks';
import { fillMacro, MACROS } from '../lib/macros';
import { StarRating } from '../components/Rating';
import { useSession } from '../lib/session';

type Changes = { title?: string; description?: string; status?: Status; priority?: Priority; category?: Category; tags?: string[] };

const EVENT_ICONS: Record<TicketEventType, ReactNode> = {
  TicketCreated: <Plus size={14} />,
  TicketUpdated: <PencilLine size={14} />,
  TicketAssigned: <UserCheck size={14} />,
  TicketCommented: <MessageSquare size={14} />,
  TicketDeleted: <Trash2 size={14} />,
  TicketRated: <Star size={14} />,
};

/** Reconstitue l'événement de domaine depuis une entrée d'audit (pour le rejeu côté client). */
const toEvent = (e: AuditEntryDto): TicketEvent =>
  ({ type: e.type, ticketId: e.ticketId, occurredAt: e.occurredAt, actor: e.actor, payload: e.payload }) as TicketEvent;

export const TicketDetailPage = () => {
  const { ticketId = '' } = useParams();
  const { data, isLoading, error } = useTicket(ticketId);

  if (isLoading) return <div className="card"><LoadingRows rows={8} /></div>;
  if (error || !data)
    return (
      <div className="card">
        <EmptyState icon={TriangleAlert} title="Ticket introuvable" action={<Link to="/tickets" className="btn">Retour aux tickets</Link>}>
          {error?.message ?? "Ce ticket n'existe pas."}
        </EmptyState>
      </div>
    );
  return <TicketDetail data={data} />;
};

const TicketDetail = ({ data }: { data: TicketDetailsDto }) => {
  const { ticket, history } = data;
  const navigate = useNavigate();
  const { actor } = useSession();
  const { data: team = [] } = useTeam();
  const [tab, setTab] = useState<'conversation' | 'history'>('conversation');
  const [confirm, setConfirm] = useState<'delete' | 'close' | null>(null);
  const [title, setTitle] = useState(ticket.title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(ticket.description);

  useEffect(() => setTitle(ticket.title), [ticket.title]);

  const readOnly = ticket.deleted || ticket.status === 'CLOSED';

  const update = useCommand((changes: Changes) => api.tickets.update.mutate({ ticketId: ticket.id, changes }), 'Ticket mis à jour');
  const assign = useCommand(
    (assignee: string | null) => api.tickets.assign.mutate({ ticketId: ticket.id, assignee }),
    (_, a) => (a ? `Assigné à ${a}` : 'Assignation retirée'),
  );
  const remove = useCommand(() => api.tickets.delete.mutate({ ticketId: ticket.id }), `${ticket.reference} supprimé (historique conservé)`);

  const setStatus = (status: Status) => (status === 'CLOSED' ? setConfirm('close') : update.mutate({ status }));

  const saveTitle = () => {
    if (title.trim() && title.trim() !== ticket.title) update.mutate({ title });
    else setTitle(ticket.title);
  };

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to="/tickets" className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
            <ArrowLeft size={14} /> Tickets
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="ref" style={{ fontSize: 13 }}>{ticket.reference}</span>
            <StatusBadge status={ticket.status} />
            {!ticket.deleted && <SlaBadge sla={ticket.sla} />}
          </div>
          <input
            className="detail-title"
            value={title}
            disabled={readOnly}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setTitle(ticket.title);
                e.currentTarget.blur();
              }
            }}
            aria-label="Titre du ticket"
          />
          <p className="muted small">
            Ouvert par <b>{ticket.createdBy}</b> {formatRelative(ticket.createdAt)} · demandeur : <b>{ticket.requester}</b> · version {ticket.version}
          </p>
        </div>
        {!ticket.deleted && (
          <div className="page-actions">
            {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
              <button className="btn" onClick={() => update.mutate({ status: 'RESOLVED' })}>Marquer résolu</button>
            )}
            {ticket.status === 'RESOLVED' && (
              <>
                <button className="btn" onClick={() => update.mutate({ status: 'OPEN' })}>Rouvrir</button>
                <button className="btn" onClick={() => setConfirm('close')}>Fermer</button>
              </>
            )}
            <button className="btn btn-danger" onClick={() => setConfirm('delete')}>
              <Trash2 size={15} /> Supprimer
            </button>
          </div>
        )}
      </div>

      {ticket.deleted && (
        <div className="banner banner-danger">
          <Trash2 size={16} /> Ticket supprimé le {formatFullDate(ticket.deletedAt!)}. Il n'apparaît plus dans les vues actives, mais son historique est conservé intégralement.
        </div>
      )}
      {!ticket.deleted && ticket.status === 'CLOSED' && (
        <div className="banner banner-warn">
          <Lock size={16} /> Ticket fermé : il ne peut plus être modifié. Son historique reste consultable ci-dessous.
        </div>
      )}

      <div className="detail">
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <section className="card">
            <div className="card-head">
              <h2>Description</h2>
              {!readOnly && !editingDescription && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setDescription(ticket.description); setEditingDescription(true); }}>
                  <PencilLine size={14} /> Modifier
                </button>
              )}
            </div>
            <div className="card-pad">
              {editingDescription ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <textarea className="textarea" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} autoFocus aria-label="Description" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => update.mutate({ description }, { onSuccess: () => setEditingDescription(false) })}>Enregistrer</button>
                    <button className="btn btn-sm" onClick={() => setEditingDescription(false)}>Annuler</button>
                  </div>
                </div>
              ) : (
                <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description || <span className="muted">Aucune description.</span>}</p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="tabs" role="tablist">
              <button className="tab" role="tab" aria-selected={tab === 'conversation'} onClick={() => setTab('conversation')}>
                <MessageSquare size={15} /> Conversation ({ticket.comments.length})
              </button>
              <button className="tab" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>
                <History size={15} /> Historique & voyage dans le temps ({history.length})
              </button>
            </div>
            {tab === 'conversation' ? (
              <Conversation ticketId={ticket.id} requester={ticket.requester} comments={ticket.comments} readOnly={readOnly} />
            ) : (
              <TimeTravel history={history} />
            )}
          </section>
        </div>

        <aside className="card" style={{ position: 'sticky', top: 76 }}>
          <div className="props">
            <div className="prop">
              <label htmlFor="p-status">Statut</label>
              <select id="p-status" className="select" value={ticket.status} disabled={readOnly} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="prop">
              <label htmlFor="p-assignee">Assigné à</label>
              <select id="p-assignee" className="select" value={ticket.assignee ?? ''} disabled={readOnly} onChange={(e) => assign.mutate(e.target.value || null)}>
                <option value="">Non assigné</option>
                {ticket.assignee && !team.some((m) => m.name === ticket.assignee) && <option value={ticket.assignee}>{ticket.assignee}</option>}
                {team.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
              {!readOnly && ticket.assignee !== actor && (
                <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => assign.mutate(actor)}>
                  <UserCheck size={14} /> M'assigner
                </button>
              )}
            </div>
            <div className="prop">
              <label htmlFor="p-priority">Priorité</label>
              <select id="p-priority" className="select" value={ticket.priority} disabled={readOnly} onChange={(e) => update.mutate({ priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div className="prop">
              <label htmlFor="p-category">Catégorie</label>
              <select id="p-category" className="select" value={ticket.category} disabled={readOnly} onChange={(e) => update.mutate({ category: e.target.value as Category })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="prop">
              <label htmlFor="p-tags">Étiquettes</label>
              <TagInput id="p-tags" value={ticket.tags} disabled={readOnly} onChange={(tags) => update.mutate({ tags })} />
            </div>
            <div className="prop">
              <span>Engagement de service</span>
              <div style={{ display: 'grid', gap: 4 }}>
                <SlaBadge sla={ticket.sla} />
                <span className="muted small">
                  Cible {ticket.sla.targetHours} h · échéance {formatDateTime(ticket.sla.dueAt)}
                  {ticket.resolvedAt && <><br />Résolu le {formatDateTime(ticket.resolvedAt)}</>}
                </span>
              </div>
            </div>
            <div className="prop">
              <span>Demandeur</span>
              <Person name={ticket.requester} />
            </div>
            {ticket.satisfaction && (
              <div className="prop">
                <span>Avis du demandeur</span>
                <div style={{ display: 'grid', gap: 4 }}>
                  <StarRating value={ticket.satisfaction.rating} size={14} />
                  {ticket.satisfaction.comment && <span className="small">« {ticket.satisfaction.comment} »</span>}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {confirm === 'delete' && (
        <ConfirmDialog
          title={`Supprimer ${ticket.reference} ?`}
          danger
          confirmLabel="Supprimer"
          message="Le ticket disparaîtra des vues actives. Conformément à l'Event Sourcing, rien n'est effacé : l'événement TicketDeleted est ajouté au journal et l'historique reste consultable."
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            remove.mutate(undefined, { onSuccess: () => navigate('/tickets') });
          }}
        />
      )}
      {confirm === 'close' && (
        <ConfirmDialog
          title={`Fermer ${ticket.reference} ?`}
          confirmLabel="Fermer définitivement"
          message="Un ticket fermé ne peut plus être modifié ni commenté. Utilisez « Résolu » si le demandeur doit encore confirmer."
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            update.mutate({ status: 'CLOSED' });
          }}
        />
      )}
    </>
  );
};

// ---------- Conversation ----------

const Conversation = ({
  ticketId,
  requester,
  comments,
  readOnly,
}: {
  ticketId: string;
  requester: string;
  comments: TicketDetailsDto['ticket']['comments'];
  readOnly: boolean;
}) => {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const { actor } = useSession();
  const { data: articles } = useKbArticles();
  const published = (articles ?? []).filter((a) => a.published);

  /** Insère une réponse type ou un article de la base de connaissances (à la suite du texte déjà saisi). */
  const insert = (value: string) => {
    const macro = MACROS.find((m) => m.id === value);
    const article = published.find((a) => `kb:${a.id}` === value);
    const text = macro
      ? fillMacro(macro.body, { requester, agent: actor })
      : article
        ? `Voici la procédure « ${article.title} » :\n\n${article.body}\n\nElle est aussi disponible dans le centre d’aide de votre espace support.`
        : '';
    if (!text) return;
    if (macro) setInternal(Boolean(macro.internal));
    if (article) setInternal(false);
    setBody((current) => (current.trim() ? `${current.trimEnd()}\n\n${text}` : text));
  };
  const send = useCommand(
    (input: { body: string; internal: boolean }) => api.tickets.comment.mutate({ ticketId, ...input }),
    (_, i) => (i.internal ? 'Note interne ajoutée' : 'Réponse envoyée'),
  );

  const submit = () => {
    if (!body.trim()) return;
    send.mutate({ body, internal }, { onSuccess: () => setBody('') });
  };

  return (
    <>
      <div className="thread">
        {comments.length === 0 && <p className="muted">Aucun échange pour l'instant.</p>}
        {comments.map((c) => (
          <div key={c.id} className={`msg ${c.internal ? 'internal' : ''}`}>
            <Avatar name={c.author} size="lg" />
            <div className="msg-body">
              <header>
                <b>{c.author}</b>
                {c.internal && <span className="tag"><Lock size={10} /> Note interne</span>}
                <span title={formatFullDate(c.createdAt)}>{formatRelative(c.createdAt)}</span>
              </header>
              <p>{c.body}</p>
            </div>
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className={`composer ${internal ? 'internal' : ''}`}>
          <div className="segmented" role="group" aria-label="Type de message">
            <button aria-pressed={!internal} onClick={() => setInternal(false)}><Send size={13} /> Réponse</button>
            <button aria-pressed={internal} onClick={() => setInternal(true)}><StickyNote size={13} /> Note interne</button>
          </div>
          <textarea
            className="textarea"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={internal ? "Note visible uniquement par l'équipe support…" : 'Votre réponse au demandeur…'}
            aria-label="Message"
          />
          <div className="composer-actions">
            <select className="select filter-select" aria-label="Réponses types" value="" onChange={(e) => insert(e.target.value)}>
              <option value="">Réponses types…</option>
              <optgroup label="Messages">
                {MACROS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              {published.length > 0 && (
                <optgroup label="Partager un article d’aide">
                  {published.map((a) => (
                    <option key={a.id} value={`kb:${a.id}`}>
                      {a.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <span className="muted small composer-hint"><kbd>Ctrl</kbd> + <kbd>Entrée</kbd> pour envoyer</span>
            <button className="btn btn-primary btn-sm" disabled={!body.trim() || send.isPending} onClick={submit}>
              {internal ? <StickyNote size={14} /> : <Send size={14} />}
              {internal ? 'Ajouter la note' : 'Envoyer'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ---------- Historique & voyage dans le temps ----------

const SNAPSHOT_FIELDS = ['status', 'priority', 'category', 'assignee', 'title', 'tags'] as const;

const TimeTravel = ({ history }: { history: readonly AuditEntryDto[] }) => {
  const [version, setVersion] = useState(history.length);
  useEffect(() => setVersion(history.length), [history.length]);

  // Rejeu côté client avec la MÊME fonction pure que le serveur : rehydrate(events.slice(0, v)).
  const past = useMemo(() => rehydrate(history.slice(0, version).map(toEvent)), [history, version]);
  const present = useMemo(() => rehydrate(history.map(toEvent)), [history]);
  const isPast = version < history.length;
  const at = history[version - 1];

  const value = (state: typeof past, field: (typeof SNAPSHOT_FIELDS)[number]): string => {
    if (state.kind === 'NotFound') return '∅';
    const t = state.ticket;
    switch (field) {
      case 'tags':
        return t.tags.length ? t.tags.map((x) => `#${x}`).join(' ') : '∅';
      case 'assignee':
        return t.assignee ?? 'Non assigné';
      default:
        return formatFieldValue(field, t[field]);
    }
  };

  return (
    <>
      <div className="timetravel">
        <div className="timetravel-head">
          <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><History size={16} /> Voyage dans le temps</strong>
          <span className="small muted">
            Version <b style={{ color: 'var(--text)' }}>{version}</b> / {history.length}
            {at && <> · {formatFullDate(at.occurredAt)}</>}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={history.length}
          value={version}
          onChange={(e) => setVersion(Number(e.target.value))}
          aria-label="Version du ticket"
        />
        {isPast && (
          <div className="banner banner-info" style={{ justifyContent: 'space-between' }}>
            <span>État reconstitué par rejeu des {version} premiers événements (lecture seule).</span>
            <button className="btn btn-sm" onClick={() => setVersion(history.length)}><X size={13} /> Revenir au présent</button>
          </div>
        )}
        <dl className="snapshot">
          {SNAPSHOT_FIELDS.map((f) => {
            const v = value(past, f);
            return (
              <div key={f} className={isPast && v !== value(present, f) ? 'changed' : ''}>
                <dt>{FIELD_LABELS[f]}</dt>
                <dd>{f === 'status' && past.kind !== 'NotFound' ? <StatusBadge status={past.ticket.status} /> : f === 'priority' && past.kind !== 'NotFound' ? <PriorityBadge priority={past.ticket.priority} /> : f === 'category' && past.kind !== 'NotFound' ? <CategoryLabel category={past.ticket.category} /> : v}</dd>
              </div>
            );
          })}
          <div className={isPast && past.kind !== 'NotFound' && present.kind !== 'NotFound' && past.ticket.comments.length !== present.ticket.comments.length ? 'changed' : ''}>
            <dt>Messages</dt>
            <dd>{past.kind === 'NotFound' ? 0 : past.ticket.comments.length}</dd>
          </div>
          <div>
            <dt>État</dt>
            <dd>{past.kind === 'Deleted' ? 'Supprimé' : 'Actif'}</dd>
          </div>
        </dl>
      </div>

      <div className="timeline">
        {[...history].reverse().map((e) => (
          <div
            key={e.position}
            className={`tl-item ${e.streamVersion > version ? 'future' : ''} ${e.streamVersion === version ? 'current' : ''}`}
            onClick={() => setVersion(e.streamVersion)}
            style={{ cursor: 'pointer' }}
          >
            <span className="tl-dot">{EVENT_ICONS[e.type]}</span>
            <div style={{ minWidth: 0 }}>
              <div className="tl-head">
                <b>{e.actor}</b>
                <span className={`ev ev-${e.type}`}>{e.type}</span>
                <span className="muted small" title={formatFullDate(e.occurredAt)}>{formatDateTime(e.occurredAt)} · v{e.streamVersion}</span>
              </div>
              <ul className="tl-changes">
                {e.changes.map((c) => (
                  <li key={c.field}>
                    <b>{FIELD_LABELS[c.field] ?? c.field}</b> :{' '}
                    {c.before !== null && e.type !== 'TicketCreated' && <><span className="before">{formatFieldValue(c.field, c.before)}</span> → </>}
                    {formatFieldValue(c.field, c.after)}
                  </li>
                ))}
                {e.changes.length === 0 && <li className="muted">{EVENT_LABELS[e.type]}</li>}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
