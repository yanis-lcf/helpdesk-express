import { err, ok, projectTickets, type Result, type UserId } from '../domain';
import type { IdentityError, IdentityService } from './identity';
import type { KnowledgeService } from './knowledge';
import type { Clock, EventStoreRepository } from './ports';

export const EXPORT_FORMAT = 'helpdesk-express/export@1';

/**
 * Réversibilité et RGPD : les données appartiennent au client.
 * - export complet, dans un format ouvert (JSON) et vérifiable (empreintes SHA-256 incluses) ;
 * - export des données d'une personne (droit d'accès et portabilité, art. 15 et 20 du RGPD).
 * Les empreintes de mots de passe ne sortent jamais.
 */
export const makePortabilityService = ({
  eventStore,
  identity,
  knowledge,
  clock,
}: {
  readonly eventStore: EventStoreRepository;
  readonly identity: IdentityService;
  readonly knowledge: KnowledgeService;
  readonly clock: Clock;
}) => ({
  exportAll: async () => {
    const [events, integrity, users, articles] = await Promise.all([
      eventStore.readAll(),
      eventStore.verifyIntegrity(),
      identity.listUsers(),
      knowledge.listAll(),
    ]);
    return {
      format: EXPORT_FORMAT,
      exportedAt: clock(),
      integrity,
      counts: { events: events.length, users: users.length, articles: articles.length },
      events,
      users,
      articles,
    };
  },

  exportPerson: async (userId: UserId): Promise<Result<IdentityError, unknown>> => {
    const user = await identity.getUser(userId);
    if (!user) return err({ code: 'USER_NOT_FOUND' });
    const stored = await eventStore.readAll();
    const tickets = projectTickets(
      stored.map((s) => s.event),
      clock(),
    ).filter((t) => t.requesterId === user.id || t.requester === user.name);
    const actions = stored.filter((s) => s.event.actor === user.name);
    return ok({
      format: `${EXPORT_FORMAT}/personne`,
      exportedAt: clock(),
      person: user,
      requestedTickets: tickets.map(({ sla: _sla, ...t }) => t),
      actions: actions.map((s) => ({ position: s.position, ...s.event, hash: s.hash })),
    });
  },
});

export type PortabilityService = ReturnType<typeof makePortabilityService>;
