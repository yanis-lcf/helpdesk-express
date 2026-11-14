import { isStaff, type User } from '../identity/types';
import type { Comment, Ticket } from '../ticket/types';

/**
 * Politique d'accès (pure) : qui peut voir quoi, et qui peut faire quoi.
 * Appliquée côté serveur : l'interface ne fait que refléter ces règles.
 */

/** Un ticket appartient à l'employé qui l'a déclaré (lien par identifiant, pas par nom). */
export const ownsTicket = (user: Pick<User, 'id'>, ticket: Pick<Ticket, 'requesterId'>): boolean =>
  ticket.requesterId !== null && ticket.requesterId === user.id;

/** La DSI voit tout ; un employé ne voit que ses propres demandes. */
export const canViewTicket = (user: Pick<User, 'id' | 'role'>, ticket: Pick<Ticket, 'requesterId'>): boolean =>
  isStaff(user.role) || ownsTicket(user, ticket);

/** Les notes internes de la DSI ne sont jamais exposées au demandeur. */
export const publicComments = (comments: readonly Comment[]): readonly Comment[] => comments.filter((c) => !c.internal);

export type RequesterAction = 'REPLY' | 'CONFIRM_RESOLUTION' | 'REOPEN';

/** Actions possibles pour le demandeur selon l'état de son ticket. */
export const requesterCan = (ticket: Pick<Ticket, 'status'>, action: RequesterAction): boolean => {
  switch (action) {
    case 'REPLY':
      return ticket.status !== 'CLOSED';
    case 'CONFIRM_RESOLUTION':
    case 'REOPEN':
      return ticket.status === 'RESOLVED';
  }
};

/** Ce que le demandeur a le droit de faire maintenant (affiché par le portail). */
export const requesterActions = (ticket: Pick<Ticket, 'status'>): readonly RequesterAction[] =>
  (['REPLY', 'CONFIRM_RESOLUTION', 'REOPEN'] as const).filter((a) => requesterCan(ticket, a));
