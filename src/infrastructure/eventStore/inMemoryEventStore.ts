import { err, ok, type TicketEvent, type TicketId } from '../../domain';
import type { EventStoreRepository, StoredEvent } from '../../application';
import { GENESIS_HASH, hashEvent, verifyChain } from './integrity';

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/** Hook de persistance appelé AVANT de valider l'écriture en mémoire. */
export type PersistHook = (events: readonly StoredEvent[]) => Promise<void>;

/**
 * Event Store append-only en mémoire.
 * - Les événements stockés sont gelés (Object.freeze) : impossible de les altérer.
 * - Chaque événement est chaîné au précédent par une empreinte SHA-256.
 * - Les écritures sont sérialisées et soumises à un contrôle de concurrence optimiste.
 */
export const createInMemoryEventStore = (
  seed: readonly StoredEvent[] = [],
  persist?: PersistHook,
): EventStoreRepository => {
  let log: readonly StoredEvent[] = deepFreeze([...seed]);
  let queue: Promise<unknown> = Promise.resolve();

  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };

  const streamOf = (ticketId: TicketId) => log.filter((stored) => stored.event.ticketId === ticketId);

  return {
    readStream: async (ticketId) => streamOf(ticketId),
    readAll: async () => log,
    verifyIntegrity: async () => verifyChain(log),
    append: (ticketId, expectedVersion, events: readonly TicketEvent[]) =>
      exclusive(async () => {
        const actualVersion = streamOf(ticketId).length;
        if (actualVersion !== expectedVersion) {
          return err({ code: 'CONCURRENCY_CONFLICT' as const, ticketId, expectedVersion, actualVersion });
        }

        let previousHash = log.at(-1)?.hash ?? GENESIS_HASH;
        const stored: StoredEvent[] = events.map((event, i) => {
          const content = {
            position: log.length + i + 1,
            streamVersion: expectedVersion + i + 1,
            event: structuredClone(event),
          };
          const hash = hashEvent(previousHash, content);
          const entry = { ...content, previousHash, hash };
          previousHash = hash;
          return entry;
        });

        if (persist) await persist(stored);
        log = Object.freeze([...log, ...deepFreeze(stored)]);
        return ok(stored);
      }),
  };
};
