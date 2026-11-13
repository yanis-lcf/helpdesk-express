import type { Result, TicketEvent, TicketId, Timestamp } from '../domain';

/** Événement tel qu'enregistré dans l'Event Store (enveloppe technique + fait métier). */
export type StoredEvent = {
  /** Position globale dans le journal (ordre chronologique d'écriture, 1-based). */
  readonly position: number;
  /** Version de l'agrégat après cet événement (1-based). */
  readonly streamVersion: number;
  readonly event: TicketEvent;
  /** Empreinte de l'événement précédent (chaînage). */
  readonly previousHash: string;
  /** Empreinte SHA-256 de (previousHash + contenu) : toute altération casse la chaîne. */
  readonly hash: string;
};

export type ConcurrencyConflict = {
  readonly code: 'CONCURRENCY_CONFLICT';
  readonly ticketId: TicketId;
  readonly expectedVersion: number;
  readonly actualVersion: number;
};

export type IntegrityReport = {
  readonly valid: boolean;
  readonly checkedEvents: number;
  /** Empreinte de tête : « sceau » de l'ensemble du journal. */
  readonly headHash: string | null;
  /** Première position dont l'empreinte ne correspond pas (null si intègre). */
  readonly firstInvalidPosition: number | null;
};

/**
 * Port de persistance (append-only). Aucune méthode de mise à jour ni de suppression :
 * un événement écrit est inaltérable.
 */
export interface EventStoreRepository {
  readStream(ticketId: TicketId): Promise<readonly StoredEvent[]>;
  readAll(): Promise<readonly StoredEvent[]>;
  /** Contrôle de concurrence optimiste : échoue si la version du flux ≠ expectedVersion. */
  append(
    ticketId: TicketId,
    expectedVersion: number,
    events: readonly TicketEvent[],
  ): Promise<Result<ConcurrencyConflict, readonly StoredEvent[]>>;
  /** Recalcule la chaîne d'empreintes pour détecter toute falsification du support. */
  verifyIntegrity(): Promise<IntegrityReport>;
}

/** L'horloge et la génération d'identifiants sont des effets : injectés par la couche externe. */
export type Clock = () => Timestamp;
export type IdGenerator = () => string;
