/**
 * Composition root : seul endroit où les implémentations concrètes sont assemblées.
 */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { makeIdentityService, makePortalService, makeTicketCommands, makeTicketQueries } from '../application';
import { createJsonlFileEventStore } from './eventStore/jsonlFileEventStore';
import { createScryptHasher } from './security/passwordHasher';
import {
  createRateLimiter,
  createSessionTokens,
  loadOrCreateSecret,
  parseCookies,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookie,
} from './security/session';
import { createAppRouter, type Context } from './trpc/router';
import { createJsonUserRepository } from './users/userRepositories';

const PORT = Number(process.env.API_PORT ?? 3001);
const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');
const EVENT_STORE_FILE = resolve(process.env.EVENT_STORE_FILE ?? `${DATA_DIR}/events.jsonl`);
const USERS_FILE = resolve(process.env.USERS_FILE ?? `${DATA_DIR}/users.json`);
/** À activer derrière HTTPS (reverse proxy) : le cookie ne circule alors jamais en clair. */
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true';
/** N'utiliser X-Forwarded-For que derrière un proxy de confiance (sinon l'en-tête est falsifiable). */
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

const eventStore = await createJsonlFileEventStore(EVENT_STORE_FILE);
const users = await createJsonUserRepository(USERS_FILE);
const clock = () => new Date().toISOString();

const commands = makeTicketCommands({ eventStore, clock, newId: () => randomUUID() });
const queries = makeTicketQueries({ eventStore, clock });
const identity = makeIdentityService({ users, hasher: createScryptHasher(), newId: () => randomUUID() });
// Première installation : création du compte administrateur à partir des variables d'environnement.
if ((await users.list()).length === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const admin = await identity.createUser({
    name: process.env.ADMIN_NAME ?? 'Administrateur',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    role: 'ADMIN',
    department: 'DSI',
  });
  console.log(admin.ok ? `[api] Compte administrateur créé : ${admin.value.email}` : `[api] Création de l'administrateur impossible : ${JSON.stringify(admin.error)}`);
}
const tokens = createSessionTokens(loadOrCreateSecret(`${DATA_DIR}/session.secret`));

const router = createAppRouter({
  commands,
  queries,
  portal: makePortalService({ commands, queries }),
  identity,
  loginLimiter: createRateLimiter({ max: 5, windowMs: 5 * 60_000 }),
});

createHTTPServer({
  router,
  createContext: async ({ req, res }): Promise<Context> => {
    const userId = tokens.verify(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    const forwarded = TRUST_PROXY ? req.headers['x-forwarded-for'] : undefined;
    return {
      user: userId ? await identity.getActiveUser(userId) : null,
      clientKey: (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'local',
      session: {
        open: (id) => res.setHeader('Set-Cookie', sessionCookie(tokens.issue(id), { maxAgeMs: SESSION_TTL_MS, secure: SECURE_COOKIES })),
        close: () => res.setHeader('Set-Cookie', sessionCookie('', { maxAgeMs: 0, secure: SECURE_COOKIES })),
      },
    };
  },
}).listen(PORT);

const integrity = await eventStore.verifyIntegrity();
const accounts = (await users.list()).length;
console.log(`[api] tRPC prêt sur http://localhost:${PORT}`);
console.log(`[api] Event Store : ${EVENT_STORE_FILE} (${integrity.checkedEvents} événements, intègre : ${integrity.valid ? 'oui' : 'NON'})`);
console.log(`[api] Annuaire : ${USERS_FILE} (${accounts} comptes)${accounts === 0 ? ' — lancez « npm run seed » (démo) ou définissez ADMIN_EMAIL / ADMIN_PASSWORD' : ''}`);
