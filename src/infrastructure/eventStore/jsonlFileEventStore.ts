import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EventStoreRepository, StoredEvent } from '../../application';
import { createInMemoryEventStore } from './inMemoryEventStore';

const readLines = async (filePath: string): Promise<string> => {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
};

/**
 * Event Store persistant sur un fichier JSON Lines append-only :
 * une ligne = un événement. Le fichier n'est jamais réécrit, seulement complété.
 * Au démarrage, le journal est rechargé puis servi depuis la mémoire.
 */
export const createJsonlFileEventStore = async (filePath: string): Promise<EventStoreRepository> => {
  await mkdir(dirname(filePath), { recursive: true });

  const seed: StoredEvent[] = (await readLines(filePath))
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as StoredEvent);

  return createInMemoryEventStore(seed, (events) =>
    appendFile(filePath, events.map((e) => JSON.stringify(e) + '\n').join(''), 'utf8'),
  );
};
