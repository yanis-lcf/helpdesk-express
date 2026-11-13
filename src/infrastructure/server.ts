/**
 * Composition root : seul endroit où les implémentations concrètes sont assemblées.
 */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { makeTicketCommands, makeTicketQueries } from '../application';
import { SYSTEM_ACTOR, TEAM } from './config/team';
import { createJsonlFileEventStore } from './eventStore/jsonlFileEventStore';
import { createAppRouter, type Context } from './trpc/router';

const PORT = Number(process.env.API_PORT ?? 3001);
const EVENT_STORE_FILE = resolve(process.env.EVENT_STORE_FILE ?? 'data/events.jsonl');

const eventStore = await createJsonlFileEventStore(EVENT_STORE_FILE);
const clock = () => new Date().toISOString();

const router = createAppRouter({
  commands: makeTicketCommands({ eventStore, clock, newId: () => randomUUID() }),
  queries: makeTicketQueries({ eventStore, clock }),
  team: TEAM,
});

/** L'acteur est transmis encodé (les en-têtes HTTP n'acceptent que l'ASCII). */
const actorFrom = (header: string | string[] | undefined): string => {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return SYSTEM_ACTOR;
  try {
    return decodeURIComponent(raw).trim().slice(0, 120) || SYSTEM_ACTOR;
  } catch {
    return SYSTEM_ACTOR;
  }
};

createHTTPServer({
  router,
  createContext: ({ req }): Context => ({ actor: actorFrom(req.headers['x-actor']) }),
}).listen(PORT);

const integrity = await eventStore.verifyIntegrity();
console.log(`[api] tRPC prêt sur http://localhost:${PORT}`);
console.log(`[api] Event Store : ${EVENT_STORE_FILE} (${integrity.checkedEvents} événements, intègre : ${integrity.valid ? 'oui' : 'NON'})`);
