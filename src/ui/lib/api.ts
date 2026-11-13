import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
// Import de TYPE uniquement : aucun code serveur n'est embarqué dans le bundle React.
import type { AppRouter } from '../../infrastructure/trpc/router';
import { getActor } from './session';

export const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
      // Les en-têtes HTTP n'acceptent que l'ASCII : le nom de l'acteur est encodé.
      headers: () => ({ 'x-actor': encodeURIComponent(getActor()) }),
    }),
  ],
});

type Outputs = inferRouterOutputs<AppRouter>;
export type TicketDto = Outputs['tickets']['listActive'][number];
export type TicketDetailsDto = Outputs['tickets']['byId'];
export type AuditEntryDto = Outputs['events']['auditLog'][number];
export type DashboardDto = Outputs['dashboard']['stats'];
export type IntegrityDto = Outputs['events']['verifyIntegrity'];
export type TeamMemberDto = Outputs['meta']['team'][number];

export const errorMessage = (error: unknown): string =>
  error instanceof TRPCClientError || error instanceof Error ? error.message : String(error);
