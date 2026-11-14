import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
// Import de TYPE uniquement : aucun code serveur n'est embarqué dans le bundle React.
import type { AppRouter } from '../../infrastructure/trpc/router';

/**
 * L'identité voyage dans un cookie HttpOnly posé par le serveur : le JavaScript de la page
 * n'y a jamais accès (protection contre le vol de session par XSS).
 */
export const api = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/trpc', fetch: (url, options) => fetch(url, { ...options, credentials: 'same-origin' }) })],
});

type Outputs = inferRouterOutputs<AppRouter>;
export type TicketDto = Outputs['tickets']['listActive'][number];
export type TicketDetailsDto = Outputs['tickets']['byId'];
export type AuditEntryDto = Outputs['events']['auditLog'][number];
export type DashboardDto = Outputs['dashboard']['stats'];
export type IntegrityDto = Outputs['events']['verifyIntegrity'];
export type TeamMemberDto = Outputs['meta']['team'][number];
export type CurrentUserDto = NonNullable<Outputs['auth']['me']>;
export type PortalTicketDto = Outputs['portal']['ticket'];
export type UserDto = Outputs['admin']['users'][number];

export const errorMessage = (error: unknown): string =>
  error instanceof TRPCClientError || error instanceof Error ? error.message : String(error);

/** Code tRPC d'une erreur (UNAUTHORIZED, FORBIDDEN…), si disponible. */
export const errorCode = (error: unknown): string | null =>
  error instanceof TRPCClientError ? ((error.data as { code?: string } | undefined)?.code ?? null) : null;
