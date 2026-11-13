import { createHash } from 'node:crypto';
import type { IntegrityReport, StoredEvent } from '../../application';

export const GENESIS_HASH = '0'.repeat(64);

/** Sérialisation canonique (clés triées) : même contenu ⇒ même empreinte, quel que soit l'ordre des clés. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const hashEvent = (previousHash: string, content: Pick<StoredEvent, 'position' | 'streamVersion' | 'event'>) =>
  createHash('sha256')
    .update(previousHash)
    .update(canonicalJson({ position: content.position, streamVersion: content.streamVersion, event: content.event }))
    .digest('hex');

/** Vérifie la chaîne d'empreintes du journal complet. */
export const verifyChain = (log: readonly StoredEvent[]): IntegrityReport => {
  let previous = GENESIS_HASH;
  for (const [index, stored] of log.entries()) {
    const expected = hashEvent(previous, stored);
    if (stored.position !== index + 1 || stored.previousHash !== previous || stored.hash !== expected) {
      return { valid: false, checkedEvents: index, headHash: null, firstInvalidPosition: index + 1 };
    }
    previous = stored.hash;
  }
  return { valid: true, checkedEvents: log.length, headHash: log.length ? previous : null, firstInvalidPosition: null };
};
