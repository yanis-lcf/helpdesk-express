import { err, ok, type Result } from '../result';
import {
  DomainErrors,
  isCategory,
  isPriority,
  isStatus,
  type AssignTicket,
  type CommentTicket,
  type CreateTicket,
  type DeleteTicket,
  type RateTicket,
  type DomainError,
  type Ticket,
  type TicketChanges,
  type TicketCommand,
  type TicketEvent,
  type TicketId,
  type TicketState,
  type Timestamp,
  type UpdateTicket,
} from './types';

export const LIMITS = {
  title: 120,
  description: 5000,
  requester: 120,
  comment: 5000,
  tag: 30,
  tags: 10,
  feedback: 1000,
} as const;

type Decision = Result<DomainError, readonly TicketEvent[]>;

/**
 * Fonction de décision pure : (état courant, commande, instant) => événements | erreur.
 * Toutes les règles métier de l'agrégat Ticket vivent ici.
 */
export const decide = (state: TicketState, command: TicketCommand, now: Timestamp): Decision => {
  switch (command.type) {
    case 'CreateTicket':
      return decideCreate(state, command, now);
    case 'UpdateTicket':
      return decideUpdate(state, command, now);
    case 'AssignTicket':
      return decideAssign(state, command, now);
    case 'CommentTicket':
      return decideComment(state, command, now);
    case 'DeleteTicket':
      return decideDelete(state, command, now);
    case 'RateTicket':
      return decideRate(state, command, now);
  }
};

// ---------- Validations unitaires (pures, réutilisables) ----------

const tooLong = (label: string, max: number) =>
  err(DomainErrors.validation(`${label} ne doit pas dépasser ${max} caractères.`));

export const validateTitle = (raw: string): Result<DomainError, string> => {
  const title = raw.trim();
  if (title.length === 0) return err(DomainErrors.validation('Le titre est obligatoire.'));
  if (title.length > LIMITS.title) return tooLong('Le titre', LIMITS.title);
  return ok(title);
};

export const validateDescription = (raw: string): Result<DomainError, string> => {
  const description = raw.trim();
  return description.length > LIMITS.description ? tooLong('La description', LIMITS.description) : ok(description);
};

/** Tags : minuscules, sans espaces superflus, dédoublonnés. */
export const normalizeTags = (raw: readonly string[]): Result<DomainError, readonly string[]> => {
  const tags = [...new Set(raw.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter((t) => t.length > 0))];
  if (tags.length > LIMITS.tags) return err(DomainErrors.validation(`${LIMITS.tags} étiquettes maximum.`));
  if (tags.some((t) => t.length > LIMITS.tag)) return tooLong('Une étiquette', LIMITS.tag);
  return ok(tags);
};

const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((tag, i) => tag === b[i]);

// ---------- Garde : le ticket peut-il encore évoluer ? ----------

/** Règle : un ticket inexistant, supprimé ou CLOSED ne peut plus être modifié. */
const ensureModifiable = (state: TicketState, ticketId: TicketId): Result<DomainError, Ticket> => {
  switch (state.kind) {
    case 'NotFound':
      return err(DomainErrors.notFound(ticketId));
    case 'Deleted':
      return err(DomainErrors.deleted(ticketId));
    case 'Active':
      return state.ticket.status === 'CLOSED' ? err(DomainErrors.closed(ticketId)) : ok(state.ticket);
  }
};

// ---------- Création ----------

const decideCreate = (state: TicketState, c: CreateTicket, now: Timestamp): Decision => {
  if (state.kind !== 'NotFound') return err(DomainErrors.alreadyExists(c.ticketId));

  const title = validateTitle(c.title);
  if (!title.ok) return title;
  const description = validateDescription(c.description);
  if (!description.ok) return description;
  if (!isPriority(c.priority)) return err(DomainErrors.validation('Priorité invalide.'));
  if (!isCategory(c.category)) return err(DomainErrors.validation('Catégorie invalide.'));
  const tags = normalizeTags(c.tags);
  if (!tags.ok) return tags;

  // Sans demandeur explicite, c'est l'auteur de la saisie qui est le demandeur.
  const requester = c.requester.trim() || c.actor;
  if (requester.length > LIMITS.requester) return tooLong('Le demandeur', LIMITS.requester);

  return ok([
    {
      type: 'TicketCreated',
      ticketId: c.ticketId,
      occurredAt: now,
      actor: c.actor,
      payload: {
        title: title.value,
        description: description.value,
        priority: c.priority,
        category: c.category,
        requester,
        requesterId: c.requesterId ?? null,
        tags: tags.value,
      },
    },
  ]);
};

// ---------- Mise à jour ----------

const validateChanges = (changes: TicketChanges): Result<DomainError, TicketChanges> => {
  if (changes.status !== undefined && !isStatus(changes.status)) return err(DomainErrors.validation('Statut invalide.'));
  if (changes.priority !== undefined && !isPriority(changes.priority))
    return err(DomainErrors.validation('Priorité invalide.'));
  if (changes.category !== undefined && !isCategory(changes.category))
    return err(DomainErrors.validation('Catégorie invalide.'));

  const title = changes.title === undefined ? undefined : validateTitle(changes.title);
  if (title && !title.ok) return title;
  const description = changes.description === undefined ? undefined : validateDescription(changes.description);
  if (description && !description.ok) return description;
  const tags = changes.tags === undefined ? undefined : normalizeTags(changes.tags);
  if (tags && !tags.ok) return tags;

  return ok({
    ...(title ? { title: title.value } : {}),
    ...(description ? { description: description.value } : {}),
    ...(changes.status !== undefined ? { status: changes.status } : {}),
    ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
    ...(changes.category !== undefined ? { category: changes.category } : {}),
    ...(tags ? { tags: tags.value } : {}),
  });
};

/** Ne conserve que les champs dont la valeur change réellement (pas d'événement « vide »). */
export const effectiveChanges = (ticket: Ticket, changes: TicketChanges): TicketChanges => ({
  ...(changes.title !== undefined && changes.title !== ticket.title ? { title: changes.title } : {}),
  ...(changes.description !== undefined && changes.description !== ticket.description
    ? { description: changes.description }
    : {}),
  ...(changes.status !== undefined && changes.status !== ticket.status ? { status: changes.status } : {}),
  ...(changes.priority !== undefined && changes.priority !== ticket.priority ? { priority: changes.priority } : {}),
  ...(changes.category !== undefined && changes.category !== ticket.category ? { category: changes.category } : {}),
  ...(changes.tags !== undefined && !sameTags(changes.tags, ticket.tags) ? { tags: changes.tags } : {}),
});

const decideUpdate = (state: TicketState, c: UpdateTicket, now: Timestamp): Decision => {
  const target = ensureModifiable(state, c.ticketId);
  if (!target.ok) return target;

  const validated = validateChanges(c.changes);
  if (!validated.ok) return validated;

  const changes = effectiveChanges(target.value, validated.value);
  if (Object.keys(changes).length === 0) return err(DomainErrors.noChanges(c.ticketId));

  return ok([{ type: 'TicketUpdated', ticketId: c.ticketId, occurredAt: now, actor: c.actor, payload: changes }]);
};

// ---------- Assignation ----------

const decideAssign = (state: TicketState, c: AssignTicket, now: Timestamp): Decision => {
  const target = ensureModifiable(state, c.ticketId);
  if (!target.ok) return target;

  const assignee = c.assignee?.trim() || null;
  if (assignee === target.value.assignee) return err(DomainErrors.noChanges(c.ticketId));

  return ok([{ type: 'TicketAssigned', ticketId: c.ticketId, occurredAt: now, actor: c.actor, payload: { assignee } }]);
};

// ---------- Commentaire / note interne ----------

const decideComment = (state: TicketState, c: CommentTicket, now: Timestamp): Decision => {
  const target = ensureModifiable(state, c.ticketId);
  if (!target.ok) return target;

  const body = c.body.trim();
  if (body.length === 0) return err(DomainErrors.validation('Le commentaire est vide.'));
  if (body.length > LIMITS.comment) return tooLong('Le commentaire', LIMITS.comment);

  return ok([
    {
      type: 'TicketCommented',
      ticketId: c.ticketId,
      occurredAt: now,
      actor: c.actor,
      payload: { commentId: c.commentId, body, internal: c.internal },
    },
  ]);
};

// ---------- Satisfaction ----------

/**
 * Règle : on évalue une résolution, donc uniquement un ticket RESOLVED (pas encore clôturé).
 * La note est un entier de 1 à 5 ; le commentaire est facultatif.
 */
const decideRate = (state: TicketState, c: RateTicket, now: Timestamp): Decision => {
  const target = ensureModifiable(state, c.ticketId);
  if (!target.ok) return target;
  if (target.value.status !== 'RESOLVED')
    return err(DomainErrors.validation('Seule une demande résolue peut être évaluée.'));
  if (!Number.isInteger(c.rating) || c.rating < 1 || c.rating > 5)
    return err(DomainErrors.validation('La note doit être comprise entre 1 et 5.'));
  const comment = c.comment.trim();
  if (comment.length > LIMITS.feedback) return tooLong('Le commentaire', LIMITS.feedback);

  return ok([
    { type: 'TicketRated', ticketId: c.ticketId, occurredAt: now, actor: c.actor, payload: { rating: c.rating, comment } },
  ]);
};

// ---------- Suppression logique ----------

const decideDelete = (state: TicketState, c: DeleteTicket, now: Timestamp): Decision => {
  switch (state.kind) {
    case 'NotFound':
      return err(DomainErrors.notFound(c.ticketId));
    case 'Deleted':
      return err(DomainErrors.deleted(c.ticketId));
    case 'Active':
      return ok([{ type: 'TicketDeleted', ticketId: c.ticketId, occurredAt: now, actor: c.actor, payload: {} }]);
  }
};
