import {
  decide,
  ok,
  rehydrate,
  type Actor,
  type Category,
  type DomainError,
  type Priority,
  type Result,
  type Ticket,
  type TicketChanges,
  type TicketCommand,
  type TicketEvent,
  type TicketId,
} from '../domain';
import type { Clock, ConcurrencyConflict, EventStoreRepository, IdGenerator } from './ports';

export type ApplicationError = DomainError | ConcurrencyConflict;

export type CommandOutcome = {
  readonly ticketId: TicketId;
  readonly events: readonly TicketEvent[];
  /** État courant après application (null si le ticket vient d'être supprimé). */
  readonly ticket: Ticket | null;
};

export type CommandResult = Result<ApplicationError, CommandOutcome>;

export type CommandDeps = {
  readonly eventStore: EventStoreRepository;
  readonly clock: Clock;
  readonly newId: IdGenerator;
};

/**
 * Pipeline générique d'une commande Event Sourcing :
 * 1. charger le flux de l'agrégat, 2. rejouer, 3. décider (pur), 4. ajouter les nouveaux événements.
 */
const execute =
  ({ eventStore, clock }: Pick<CommandDeps, 'eventStore' | 'clock'>) =>
  async (command: TicketCommand): Promise<CommandResult> => {
    const history = (await eventStore.readStream(command.ticketId)).map((stored) => stored.event);
    const decision = decide(rehydrate(history), command, clock());
    if (!decision.ok) return decision;

    const appended = await eventStore.append(command.ticketId, history.length, decision.value);
    if (!appended.ok) return appended;

    const after = rehydrate([...history, ...decision.value]);
    return ok({
      ticketId: command.ticketId,
      events: decision.value,
      ticket: after.kind === 'Active' ? after.ticket : null,
    });
  };

export type CreateTicketInput = {
  readonly title: string;
  readonly description: string;
  readonly priority: Priority;
  readonly category: Category;
  readonly requester?: string;
  readonly tags?: readonly string[];
  readonly assignee?: Actor | null;
};

/** Use cases d'écriture (Commands). Chaque action est attribuée à un acteur. */
export const makeTicketCommands = (deps: CommandDeps) => {
  const run = execute(deps);

  return {
    createTicket: async (input: CreateTicketInput, actor: Actor): Promise<CommandResult> => {
      const ticketId = deps.newId();
      const created = await run({
        type: 'CreateTicket',
        ticketId,
        actor,
        title: input.title,
        description: input.description,
        priority: input.priority,
        category: input.category,
        requester: input.requester ?? '',
        tags: input.tags ?? [],
      });
      // Assignation immédiate optionnelle : un second événement, explicite dans l'historique.
      if (!created.ok || !input.assignee) return created;
      const assigned = await run({ type: 'AssignTicket', ticketId, actor, assignee: input.assignee });
      return assigned.ok
        ? ok({ ...assigned.value, events: [...created.value.events, ...assigned.value.events] })
        : created;
    },

    updateTicket: (input: { readonly ticketId: TicketId; readonly changes: TicketChanges }, actor: Actor) =>
      run({ type: 'UpdateTicket', ticketId: input.ticketId, actor, changes: input.changes }),

    assignTicket: (input: { readonly ticketId: TicketId; readonly assignee: Actor | null }, actor: Actor) =>
      run({ type: 'AssignTicket', ticketId: input.ticketId, actor, assignee: input.assignee }),

    commentTicket: (
      input: { readonly ticketId: TicketId; readonly body: string; readonly internal: boolean },
      actor: Actor,
    ) =>
      run({
        type: 'CommentTicket',
        ticketId: input.ticketId,
        actor,
        commentId: deps.newId(),
        body: input.body,
        internal: input.internal,
      }),

    deleteTicket: (input: { readonly ticketId: TicketId }, actor: Actor) =>
      run({ type: 'DeleteTicket', ticketId: input.ticketId, actor }),
  };
};

export type TicketCommands = ReturnType<typeof makeTicketCommands>;
