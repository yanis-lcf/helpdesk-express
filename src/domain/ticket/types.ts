/**
 * Langage ubiquitaire de l'agrégat Ticket : valeurs, événements, état, commandes, erreurs.
 * Aucune dépendance externe.
 */

// ---------- Value objects ----------

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type Status = (typeof STATUSES)[number];

export const CATEGORIES = ['HARDWARE', 'SOFTWARE', 'NETWORK', 'ACCESS', 'OTHER'] as const;
export type Category = (typeof CATEGORIES)[number];

export type TicketId = string;
export type CommentId = string;
/** Personne (agent ou système) à l'origine d'une action : indispensable à la traçabilité. */
export type Actor = string;

/** Date ISO-8601 (fournie de l'extérieur : le domaine ne lit jamais l'horloge). */
export type Timestamp = string;

const includes = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

export const isPriority = (value: unknown): value is Priority => includes(PRIORITIES, value);
export const isStatus = (value: unknown): value is Status => includes(STATUSES, value);
export const isCategory = (value: unknown): value is Category => includes(CATEGORIES, value);

/** Statuts « en file » : le ticket attend encore une action de l'équipe. */
export const isBacklogStatus = (status: Status): boolean => status === 'OPEN' || status === 'IN_PROGRESS';

// ---------- Événements (faits immuables) ----------

interface DomainEvent<T extends string, P> {
  readonly type: T;
  readonly ticketId: TicketId;
  readonly occurredAt: Timestamp;
  readonly actor: Actor;
  readonly payload: P;
}

export type TicketChanges = {
  readonly title?: string;
  readonly description?: string;
  readonly status?: Status;
  readonly priority?: Priority;
  readonly category?: Category;
  readonly tags?: readonly string[];
};

export type TicketCreated = DomainEvent<
  'TicketCreated',
  {
    readonly title: string;
    readonly description: string;
    readonly priority: Priority;
    readonly category: Category;
    readonly requester: string;
    readonly tags: readonly string[];
  }
>;
export type TicketUpdated = DomainEvent<'TicketUpdated', TicketChanges>;
export type TicketAssigned = DomainEvent<'TicketAssigned', { readonly assignee: Actor | null }>;
export type TicketCommented = DomainEvent<
  'TicketCommented',
  { readonly commentId: CommentId; readonly body: string; readonly internal: boolean }
>;
export type TicketDeleted = DomainEvent<'TicketDeleted', Record<string, never>>;

export type TicketEvent = TicketCreated | TicketUpdated | TicketAssigned | TicketCommented | TicketDeleted;
export type TicketEventType = TicketEvent['type'];
export const EVENT_TYPES: readonly TicketEventType[] = [
  'TicketCreated',
  'TicketUpdated',
  'TicketAssigned',
  'TicketCommented',
  'TicketDeleted',
];

// ---------- État (reconstitué par rejeu) ----------

export type Comment = {
  readonly id: CommentId;
  readonly body: string;
  readonly internal: boolean;
  readonly author: Actor;
  readonly createdAt: Timestamp;
};

export type Ticket = {
  readonly id: TicketId;
  readonly title: string;
  readonly description: string;
  readonly priority: Priority;
  readonly category: Category;
  readonly status: Status;
  readonly requester: string;
  readonly assignee: Actor | null;
  readonly tags: readonly string[];
  readonly comments: readonly Comment[];
  readonly createdBy: Actor;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  /** Date de passage en RESOLVED/CLOSED ; remise à null en cas de réouverture. */
  readonly resolvedAt: Timestamp | null;
  /** Nombre d'événements appliqués (version de l'agrégat). */
  readonly version: number;
};

export type TicketState =
  | { readonly kind: 'NotFound' }
  | { readonly kind: 'Active'; readonly ticket: Ticket }
  | { readonly kind: 'Deleted'; readonly ticket: Ticket; readonly deletedAt: Timestamp; readonly deletedBy: Actor };

// ---------- Commandes (intentions) ----------

type CommandBase<T extends string> = { readonly type: T; readonly ticketId: TicketId; readonly actor: Actor };

export type CreateTicket = CommandBase<'CreateTicket'> & {
  readonly title: string;
  readonly description: string;
  readonly priority: Priority;
  readonly category: Category;
  readonly requester: string;
  readonly tags: readonly string[];
};
export type UpdateTicket = CommandBase<'UpdateTicket'> & { readonly changes: TicketChanges };
export type AssignTicket = CommandBase<'AssignTicket'> & { readonly assignee: Actor | null };
export type CommentTicket = CommandBase<'CommentTicket'> & {
  readonly commentId: CommentId;
  readonly body: string;
  readonly internal: boolean;
};
export type DeleteTicket = CommandBase<'DeleteTicket'>;

export type TicketCommand = CreateTicket | UpdateTicket | AssignTicket | CommentTicket | DeleteTicket;

// ---------- Erreurs métier ----------

export type DomainError =
  | { readonly code: 'VALIDATION'; readonly message: string }
  | { readonly code: 'TICKET_ALREADY_EXISTS'; readonly ticketId: TicketId }
  | { readonly code: 'TICKET_NOT_FOUND'; readonly ticketId: TicketId }
  | { readonly code: 'TICKET_CLOSED'; readonly ticketId: TicketId }
  | { readonly code: 'TICKET_DELETED'; readonly ticketId: TicketId }
  | { readonly code: 'NO_CHANGES'; readonly ticketId: TicketId };

export const DomainErrors = {
  validation: (message: string): DomainError => ({ code: 'VALIDATION', message }),
  alreadyExists: (ticketId: TicketId): DomainError => ({ code: 'TICKET_ALREADY_EXISTS', ticketId }),
  notFound: (ticketId: TicketId): DomainError => ({ code: 'TICKET_NOT_FOUND', ticketId }),
  closed: (ticketId: TicketId): DomainError => ({ code: 'TICKET_CLOSED', ticketId }),
  deleted: (ticketId: TicketId): DomainError => ({ code: 'TICKET_DELETED', ticketId }),
  noChanges: (ticketId: TicketId): DomainError => ({ code: 'NO_CHANGES', ticketId }),
} as const;
