import {
  canViewTicket,
  DomainErrors,
  err,
  ok,
  publicComments,
  requesterActions,
  requesterCan,
  type Category,
  type DomainError,
  type Priority,
  type RequesterAction,
  type Result,
  type TicketId,
  type TicketView,
  type User,
} from '../domain';
import type { CommandResult, TicketCommands } from './commands';
import type { TicketQueries } from './queries';

/**
 * Vue d'un ticket côté demandeur : jamais de notes internes, ni d'historique technique.
 * (Les étiquettes internes de la DSI sont également masquées.)
 */
export type RequesterTicketView = Omit<TicketView, 'tags' | 'createdBy'> & {
  readonly actions: readonly RequesterAction[];
};

export const toRequesterView = ({ tags: _tags, createdBy: _createdBy, ...ticket }: TicketView): RequesterTicketView => ({
  ...ticket,
  comments: publicComments(ticket.comments),
  actions: requesterActions(ticket),
});

export type PortalRequest = {
  readonly title: string;
  readonly description: string;
  readonly category: Category;
  readonly priority: Priority;
};

/**
 * Use cases du portail employé. Toutes les vérifications d'accès sont faites ici, côté serveur :
 * un ticket d'un autre employé est « introuvable » (on ne révèle même pas son existence).
 */
export const makePortalService = ({ commands, queries }: { readonly commands: TicketCommands; readonly queries: TicketQueries }) => {
  const loadOwned = async (ticketId: TicketId, user: User): Promise<Result<DomainError, TicketView>> => {
    const found = await queries.getTicket(ticketId);
    if (!found.ok) return found;
    const { ticket } = found.value;
    if (ticket.deleted || !canViewTicket({ id: user.id, role: 'EMPLOYEE' }, ticket)) return err(DomainErrors.notFound(ticketId));
    return ok(ticket);
  };

  const guard = async (ticketId: TicketId, user: User, action: RequesterAction): Promise<Result<DomainError, TicketView>> => {
    const owned = await loadOwned(ticketId, user);
    if (!owned.ok) return owned;
    if (!requesterCan(owned.value, action)) {
      return err(
        owned.value.status === 'CLOSED'
          ? DomainErrors.closed(ticketId)
          : DomainErrors.forbidden('Cette action n’est possible que lorsque la DSI a résolu la demande.'),
      );
    }
    return owned;
  };

  return {
    listMine: async (user: User): Promise<readonly RequesterTicketView[]> =>
      (await queries.listActiveTickets()).filter((t) => t.requesterId === user.id).map(toRequesterView),

    getMine: async (ticketId: TicketId, user: User): Promise<Result<DomainError, RequesterTicketView>> => {
      const owned = await loadOwned(ticketId, user);
      return owned.ok ? ok(toRequesterView(owned.value)) : owned;
    },

    submit: (request: PortalRequest, user: User): Promise<CommandResult> =>
      commands.createTicket({ ...request, tags: [], requester: user.name, requesterId: user.id }, user.name),

    reply: async (ticketId: TicketId, body: string, user: User): Promise<CommandResult> => {
      const allowed = await guard(ticketId, user, 'REPLY');
      if (!allowed.ok) return allowed;
      return commands.commentTicket({ ticketId, body, internal: false }, user.name);
    },

    /**
     * Le demandeur valide la solution : le ticket est clôturé définitivement.
     * Son avis facultatif (note 1-5 + commentaire) est enregistré juste avant la clôture,
     * dans le même parcours : pas d'e-mail d'enquête séparé que personne n'ouvre.
     */
    confirmResolution: async (
      ticketId: TicketId,
      user: User,
      feedback?: { readonly rating: number; readonly comment?: string },
    ): Promise<CommandResult> => {
      const allowed = await guard(ticketId, user, 'CONFIRM_RESOLUTION');
      if (!allowed.ok) return allowed;
      if (feedback) {
        const rated = await commands.rateTicket({ ticketId, rating: feedback.rating, comment: feedback.comment ?? '' }, user.name);
        if (!rated.ok) return rated;
      }
      return commands.updateTicket({ ticketId, changes: { status: 'CLOSED' } }, user.name);
    },

    /** Le problème persiste : le demandeur rouvre sa demande en expliquant pourquoi. */
    reopen: async (ticketId: TicketId, reason: string, user: User): Promise<CommandResult> => {
      const allowed = await guard(ticketId, user, 'REOPEN');
      if (!allowed.ok) return allowed;
      if (!reason.trim()) return err(DomainErrors.validation('Merci d’indiquer pourquoi le problème persiste.'));
      const commented = await commands.commentTicket({ ticketId, body: reason, internal: false }, user.name);
      if (!commented.ok) return commented;
      return commands.updateTicket({ ticketId, changes: { status: 'OPEN' } }, user.name);
    },
  };
};

export type PortalService = ReturnType<typeof makePortalService>;
