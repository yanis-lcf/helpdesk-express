import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  CATEGORIES,
  IDENTITY_LIMITS,
  isAdmin,
  isStaff,
  LIMITS,
  PRIORITIES,
  ROLES,
  STATUSES,
  type Result,
  type User,
} from '../../domain';
import type {
  ApplicationError,
  IdentityError,
  IdentityService,
  PortalService,
  TicketCommands,
  TicketQueries,
} from '../../application';
import type { RateLimiter } from '../security/session';

type TRPCErrorCode = ConstructorParameters<typeof TRPCError>[0]['code'];
type AnyError = ApplicationError | IdentityError;

const ERROR_MAPPING: Record<AnyError['code'], { code: TRPCErrorCode; message: string }> = {
  VALIDATION: { code: 'BAD_REQUEST', message: 'Données invalides.' },
  TICKET_ALREADY_EXISTS: { code: 'CONFLICT', message: 'Ce ticket existe déjà.' },
  TICKET_NOT_FOUND: { code: 'NOT_FOUND', message: 'Ticket introuvable.' },
  TICKET_CLOSED: { code: 'PRECONDITION_FAILED', message: 'Ce ticket est fermé : il ne peut plus être modifié.' },
  TICKET_DELETED: { code: 'PRECONDITION_FAILED', message: 'Ce ticket a été supprimé.' },
  NO_CHANGES: { code: 'BAD_REQUEST', message: 'Aucune modification à enregistrer.' },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'Action non autorisée.' },
  CONCURRENCY_CONFLICT: { code: 'CONFLICT', message: 'Le ticket a été modifié entre-temps, veuillez réessayer.' },
  INVALID_CREDENTIALS: { code: 'UNAUTHORIZED', message: 'E-mail ou mot de passe incorrect.' },
  USER_VALIDATION: { code: 'BAD_REQUEST', message: 'Données invalides.' },
  EMAIL_TAKEN: { code: 'CONFLICT', message: 'Un compte existe déjà avec cette adresse e-mail.' },
  USER_NOT_FOUND: { code: 'NOT_FOUND', message: 'Compte introuvable.' },
  SELF_LOCKOUT: { code: 'BAD_REQUEST', message: 'Vous ne pouvez pas retirer vos propres droits d’administration.' },
};

export class DomainTRPCError extends TRPCError {
  constructor(
    readonly domainCode: AnyError['code'],
    code: TRPCErrorCode,
    message: string,
  ) {
    super({ code, message });
  }
}

/** Adaptateur : convertit un Result applicatif en réponse ou en erreur HTTP/tRPC. */
export const unwrap = <A>(result: Result<AnyError, A>): A => {
  if (result.ok) return result.value;
  const error = result.error;
  const mapping = ERROR_MAPPING[error.code];
  const message = 'message' in error ? error.message : mapping.message;
  throw new DomainTRPCError(error.code, mapping.code, message);
};

/** Contexte de requête : l'utilisateur authentifié (cookie de session vérifié) et la gestion de la session. */
export type Context = {
  readonly user: User | null;
  readonly session: { readonly open: (userId: string) => void; readonly close: () => void };
  /** Adresse du client : sert à limiter les tentatives de connexion. */
  readonly clientKey: string;
};

const t = initTRPC.context<Context>().create({
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      stack: undefined,
      domainCode: error instanceof DomainTRPCError ? error.domainCode : null,
    },
  }),
});

export const createCallerFactory = t.createCallerFactory;

// ---------- Contrôle d'accès (vérifié à chaque appel, côté serveur) ----------

const authed = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Veuillez vous connecter.' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
/** Réservé à la DSI (agents et administrateurs). */
const staff = authed.use(({ ctx, next }) => {
  if (!isStaff(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Espace réservé à la DSI.' });
  return next();
});
/** Réservé aux administrateurs. */
const admin = authed.use(({ ctx, next }) => {
  if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Réservé aux administrateurs.' });
  return next();
});

// ---------- Schémas de forme ----------

const ticketId = z.string().min(1).max(100);
const priority = z.enum(PRIORITIES);
const category = z.enum(CATEGORIES);
const tags = z.array(z.string().max(LIMITS.tag)).max(LIMITS.tags);
const title = z.string().max(LIMITS.title + 50);
const description = z.string().max(LIMITS.description + 50);
const body = z.string().max(LIMITS.comment + 50);
const password = z.string().max(IDENTITY_LIMITS.passwordMax);
const email = z.string().max(IDENTITY_LIMITS.email + 20);

export type RouterDeps = {
  readonly commands: TicketCommands;
  readonly queries: TicketQueries;
  readonly portal: PortalService;
  readonly identity: IdentityService;
  readonly loginLimiter: RateLimiter;
};

/** Le routeur ne contient aucune règle métier : il authentifie, valide la forme et délègue aux use cases. */
export const createAppRouter = ({ commands, queries, portal, identity, loginLimiter }: RouterDeps) =>
  t.router({
    // ===== Authentification =====
    auth: t.router({
      login: t.procedure.input(z.object({ email, password })).mutation(async ({ input, ctx }) => {
        const key = `${ctx.clientKey}|${input.email.trim().toLowerCase()}`;
        if (loginLimiter.isBlocked(key))
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
        const result = await identity.authenticate(input.email, input.password);
        if (!result.ok) loginLimiter.recordFailure(key);
        const user = unwrap(result);
        loginLimiter.reset(key);
        ctx.session.open(user.id);
        return user;
      }),
      logout: t.procedure.mutation(({ ctx }) => {
        ctx.session.close();
        return { ok: true as const };
      }),
      me: t.procedure.query(({ ctx }) => ctx.user),
      changePassword: authed
        .input(z.object({ current: password, next: password }))
        .mutation(async ({ input, ctx }) => unwrap(await identity.changeOwnPassword(ctx.user, input.current, input.next))),
    }),

    // ===== Portail employé : uniquement SES demandes, sans notes internes =====
    portal: t.router({
      myTickets: authed.query(({ ctx }) => portal.listMine(ctx.user)),
      ticket: authed.input(z.object({ ticketId })).query(async ({ input, ctx }) => unwrap(await portal.getMine(input.ticketId, ctx.user))),
      submit: authed
        .input(z.object({ title, description: description.default(''), category: category.default('OTHER'), priority: priority.default('MEDIUM') }))
        .mutation(async ({ input, ctx }) => unwrap(await portal.submit(input, ctx.user))),
      reply: authed
        .input(z.object({ ticketId, body }))
        .mutation(async ({ input, ctx }) => unwrap(await portal.reply(input.ticketId, input.body, ctx.user))),
      confirmResolution: authed
        .input(z.object({ ticketId }))
        .mutation(async ({ input, ctx }) => unwrap(await portal.confirmResolution(input.ticketId, ctx.user))),
      reopen: authed
        .input(z.object({ ticketId, reason: body }))
        .mutation(async ({ input, ctx }) => unwrap(await portal.reopen(input.ticketId, input.reason, ctx.user))),
    }),

    // ===== Back-office DSI =====
    tickets: t.router({
      create: staff
        .input(
          z.object({
            title,
            description: description.default(''),
            priority,
            category: category.default('OTHER'),
            requester: z.string().max(LIMITS.requester + 50).optional(),
            tags: tags.optional(),
            assignee: z.string().max(120).nullable().optional(),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          // Demande saisie pour un collaborateur ayant un compte : elle apparaîtra dans SON portail.
          const requesterAccount = input.requester ? await identity.findByName(input.requester) : null;
          return unwrap(await commands.createTicket({ ...input, requesterId: requesterAccount?.id ?? null }, ctx.user.name));
        }),

      update: staff
        .input(
          z.object({
            ticketId,
            changes: z.object({
              title: z.string().optional(),
              description: z.string().optional(),
              status: z.enum(STATUSES).optional(),
              priority: priority.optional(),
              category: category.optional(),
              tags: tags.optional(),
            }),
          }),
        )
        .mutation(async ({ input, ctx }) => unwrap(await commands.updateTicket(input, ctx.user.name))),

      assign: staff
        .input(z.object({ ticketId, assignee: z.string().max(120).nullable() }))
        .mutation(async ({ input, ctx }) => unwrap(await commands.assignTicket(input, ctx.user.name))),

      comment: staff
        .input(z.object({ ticketId, body, internal: z.boolean().default(false) }))
        .mutation(async ({ input, ctx }) => unwrap(await commands.commentTicket(input, ctx.user.name))),

      delete: staff.input(z.object({ ticketId })).mutation(async ({ input, ctx }) => unwrap(await commands.deleteTicket(input, ctx.user.name))),

      listActive: staff.query(() => queries.listActiveTickets()),
      byId: staff.input(z.object({ ticketId })).query(async ({ input }) => unwrap(await queries.getTicket(input.ticketId))),
    }),

    dashboard: t.router({
      stats: staff.query(() => queries.getDashboard()),
    }),

    events: t.router({
      auditLog: staff.query(() => queries.getAuditLog()),
      verifyIntegrity: staff.query(() => queries.verifyIntegrity()),
    }),

    meta: t.router({
      /** Agents de la DSI (assignation). */
      team: staff.query(async () =>
        (await identity.listUsers())
          .filter((u) => u.active && isStaff(u.role))
          .map((u) => ({ name: u.name, role: u.jobTitle || (u.role === 'ADMIN' ? 'Administrateur' : 'Agent') })),
      ),
      /** Collaborateurs (choix du demandeur lors d'une saisie par la DSI). */
      directory: staff.query(async () =>
        (await identity.listUsers()).filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, department: u.department })),
      ),
    }),

    // ===== Administration des comptes =====
    admin: t.router({
      users: admin.query(() => identity.listUsers()),
      createUser: admin
        .input(
          z.object({
            name: z.string().max(IDENTITY_LIMITS.name + 20),
            email,
            role: z.enum(ROLES),
            department: z.string().max(IDENTITY_LIMITS.department + 20).default(''),
            jobTitle: z.string().max(IDENTITY_LIMITS.jobTitle + 20).default(''),
            password,
          }),
        )
        .mutation(async ({ input }) => unwrap(await identity.createUser(input))),
      updateUser: admin
        .input(
          z.object({
            userId: z.string().max(100),
            role: z.enum(ROLES).optional(),
            active: z.boolean().optional(),
            department: z.string().max(IDENTITY_LIMITS.department + 20).optional(),
            jobTitle: z.string().max(IDENTITY_LIMITS.jobTitle + 20).optional(),
          }),
        )
        .mutation(async ({ input: { userId, ...patch }, ctx }) => unwrap(await identity.updateUser(userId, patch, ctx.user))),
      resetPassword: admin
        .input(z.object({ userId: z.string().max(100), password }))
        .mutation(async ({ input }) => unwrap(await identity.resetPassword(input.userId, input.password))),
    }),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;
