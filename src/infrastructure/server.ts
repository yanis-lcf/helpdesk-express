/**
 * Composition root : seul endroit où les implémentations concrètes sont assemblées.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import {
  makeIdentityService,
  makeKnowledgeService,
  makePortabilityService,
  makePortalService,
  makeTicketCommands,
  makeTicketQueries,
} from '../application';
import { createJsonlFileEventStore } from './eventStore/jsonlFileEventStore';
import { applySecurityHeaders, createStaticHandler } from './http/staticFiles';
import { createJsonArticleRepository } from './knowledge/articleRepositories';
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

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');
const EVENT_STORE_FILE = resolve(process.env.EVENT_STORE_FILE ?? `${DATA_DIR}/events.jsonl`);
const USERS_FILE = resolve(process.env.USERS_FILE ?? `${DATA_DIR}/users.json`);
const ARTICLES_FILE = resolve(process.env.ARTICLES_FILE ?? `${DATA_DIR}/articles.json`);
/** Interface compilée (`npm run build`) : servie par ce même processus en production. */
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? 'dist');
/** À activer derrière HTTPS (reverse proxy) : le cookie ne circule alors jamais en clair. */
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true';
/** N'utiliser X-Forwarded-For que derrière un proxy de confiance (sinon l'en-tête est falsifiable). */
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

const eventStore = await createJsonlFileEventStore(EVENT_STORE_FILE);
const users = await createJsonUserRepository(USERS_FILE);
const articles = await createJsonArticleRepository(ARTICLES_FILE);
const clock = () => new Date().toISOString();
const newId = () => randomUUID();

const commands = makeTicketCommands({ eventStore, clock, newId });
const queries = makeTicketQueries({ eventStore, clock });
const identity = makeIdentityService({ users, hasher: createScryptHasher(), newId });
const knowledge = makeKnowledgeService({ articles, clock, newId });

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
  knowledge,
  portability: makePortabilityService({ eventStore, identity, knowledge, clock }),
  loginLimiter: createRateLimiter({ max: 5, windowMs: 5 * 60_000 }),
});

const trpc = createHTTPHandler({
  router,
  basePath: '/trpc/',
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
});
const serveStatic = existsSync(STATIC_DIR) ? createStaticHandler(STATIC_DIR) : null;

createServer(async (req, res) => {
  applySecurityHeaders(res);
  const path = req.url ?? '/';
  if (path === '/healthz') {
    const integrity = await eventStore.verifyIntegrity();
    res.writeHead(integrity.valid ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: integrity.valid ? 'ok' : 'integrity-error', events: integrity.checkedEvents }));
    return;
  }
  if (path.startsWith('/trpc/')) return trpc(req, res);
  if (serveStatic?.(req, res)) return;
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
}).listen(PORT);

const integrity = await eventStore.verifyIntegrity();
const accounts = (await users.list()).length;
console.log(`[api] Prêt sur http://localhost:${PORT}${serveStatic ? ' (interface + API)' : ' (API seule — interface via « npm run dev »)'}`);
console.log(`[api] Event Store : ${EVENT_STORE_FILE} (${integrity.checkedEvents} événements, intègre : ${integrity.valid ? 'oui' : 'NON'})`);
console.log(`[api] Annuaire : ${USERS_FILE} (${accounts} comptes)${accounts === 0 ? ' — lancez « npm run seed » (démo) ou définissez ADMIN_EMAIL / ADMIN_PASSWORD' : ''}`);
