import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { CATEGORIES, LIMITS, PRIORITIES, STATUSES, type Actor, type Result } from '../../domain';
import type { ApplicationError, TicketCommands, TicketQueries } from '../../application';
import type { TeamMember } from '../config/team';

type TRPCErrorCode = ConstructorParameters<typeof TRPCError>[0]['code'];

const ERROR_MAPPING: Record<ApplicationError['code'], { code: TRPCErrorCode; message: string }> = {
  VALIDATION: { code: 'BAD_REQUEST', message: 'Données invalides.' },
  TICKET_ALREADY_EXISTS: { code: 'CONFLICT', message: 'Ce ticket existe déjà.' },
  TICKET_NOT_FOUND: { code: 'NOT_FOUND', message: 'Ticket introuvable.' },
  TICKET_CLOSED: { code: 'PRECONDITION_FAILED', message: 'Ce ticket est fermé : il ne peut plus être modifié.' },
  TICKET_DELETED: { code: 'PRECONDITION_FAILED', message: 'Ce ticket a été supprimé.' },
  NO_CHANGES: { code: 'BAD_REQUEST', message: 'Aucune modification à enregistrer.' },
  CONCURRENCY_CONFLICT: { code: 'CONFLICT', message: 'Le ticket a été modifié entre-temps, veuillez réessayer.' },
};

export class DomainTRPCError extends TRPCError {
  constructor(
    readonly domainCode: ApplicationError['code'],
    code: TRPCErrorCode,
    message: string,
  ) {
    super({ code, message });
  }
}

/** Adaptateur : convertit un Result applicatif en réponse ou en erreur HTTP/tRPC. */
export const unwrap = <A>(result: Result<ApplicationError, A>): A => {
  if (result.ok) return result.value;
  const mapping = ERROR_MAPPING[result.error.code];
  const message = result.error.code === 'VALIDATION' ? result.error.message : mapping.message;
  throw new DomainTRPCError(result.error.code, mapping.code, message);
};

/** Contexte de requête : l'acteur courant (en V1, transmis par l'en-tête x-actor). */
export type Context = { readonly actor: Actor };

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

const ticketId = z.string().min(1).max(100);
const priority = z.enum(PRIORITIES);
const category = z.enum(CATEGORIES);
const tags = z.array(z.string().max(LIMITS.tag)).max(LIMITS.tags);

export type RouterDeps = {
  readonly commands: TicketCommands;
  readonly queries: TicketQueries;
  readonly team: readonly TeamMember[];
};

/** Le routeur ne contient aucune règle métier : il valide la forme et délègue aux use cases. */
export const createAppRouter = ({ commands, queries, team }: RouterDeps) =>
  t.router({
    tickets: t.router({
      // ----- Commands -----
      create: t.procedure
        .input(
          z.object({
            title: z.string().max(LIMITS.title + 50),
            description: z.string().max(LIMITS.description + 50).default(''),
            priority,
            category: category.default('OTHER'),
            requester: z.string().max(LIMITS.requester + 50).optional(),
            tags: tags.optional(),
            assignee: z.string().max(120).nullable().optional(),
          }),
        )
        .mutation(async ({ input, ctx }) => unwrap(await commands.createTicket(input, ctx.actor))),

      update: t.procedure
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
        .mutation(async ({ input, ctx }) => unwrap(await commands.updateTicket(input, ctx.actor))),

      assign: t.procedure
        .input(z.object({ ticketId, assignee: z.string().max(120).nullable() }))
        .mutation(async ({ input, ctx }) => unwrap(await commands.assignTicket(input, ctx.actor))),

      comment: t.procedure
        .input(z.object({ ticketId, body: z.string().max(LIMITS.comment + 50), internal: z.boolean().default(false) }))
        .mutation(async ({ input, ctx }) => unwrap(await commands.commentTicket(input, ctx.actor))),

      delete: t.procedure
        .input(z.object({ ticketId }))
        .mutation(async ({ input, ctx }) => unwrap(await commands.deleteTicket(input, ctx.actor))),

      // ----- Queries -----
      listActive: t.procedure.query(() => queries.listActiveTickets()),
      byId: t.procedure.input(z.object({ ticketId })).query(async ({ input }) => unwrap(await queries.getTicket(input.ticketId))),
    }),

    dashboard: t.router({
      stats: t.procedure.query(() => queries.getDashboard()),
    }),

    events: t.router({
      auditLog: t.procedure.query(() => queries.getAuditLog()),
      verifyIntegrity: t.procedure.query(() => queries.verifyIntegrity()),
    }),

    meta: t.router({
      team: t.procedure.query(() => team),
    }),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;
