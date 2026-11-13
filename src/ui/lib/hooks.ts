import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, errorMessage } from './api';
import { useToast } from './toast';

const LIVE = { refetchInterval: 5000 } as const;

export const keys = {
  tickets: ['tickets'] as const,
  ticket: (id: string) => ['ticket', id] as const,
  dashboard: ['dashboard'] as const,
  audit: ['audit'] as const,
  integrity: ['integrity'] as const,
  team: ['team'] as const,
};

// ---------- Lectures (projections), rafraîchies en continu ----------

export const useTickets = () => useQuery({ queryKey: keys.tickets, queryFn: () => api.tickets.listActive.query(), ...LIVE });

export const useTicket = (ticketId: string) =>
  useQuery({ queryKey: keys.ticket(ticketId), queryFn: () => api.tickets.byId.query({ ticketId }), ...LIVE, retry: false });

export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => api.dashboard.stats.query(), ...LIVE });

export const useAuditLog = () => useQuery({ queryKey: keys.audit, queryFn: () => api.events.auditLog.query(), ...LIVE });

export const useIntegrity = () =>
  useQuery({ queryKey: keys.integrity, queryFn: () => api.events.verifyIntegrity.query(), refetchInterval: 15000 });

export const useTeam = () =>
  useQuery({ queryKey: keys.team, queryFn: () => api.meta.team.query(), staleTime: Infinity });

// ---------- Écritures (commandes) ----------

/**
 * Exécute une commande, puis invalide toutes les projections (elles dérivent du même journal).
 * Les erreurs métier du serveur sont affichées telles quelles.
 */
export const useCommand = <TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
  successMessage?: string | ((output: TOutput, input: TInput) => string),
) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (output, input) => {
      void queryClient.invalidateQueries();
      if (successMessage) toast.success(typeof successMessage === 'string' ? successMessage : successMessage(output, input));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
};

// ---------- Raccourcis clavier ----------

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Raccourci global. `combo` : « n », « mod+k », « / »… Ignoré pendant la saisie (sauf mod+). */
export const useHotkey = (combo: string, handler: (e: KeyboardEvent) => void, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;
    const [mod, key] = combo.startsWith('mod+') ? [true, combo.slice(4)] : [false, combo];
    const listener = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      if (mod !== (e.ctrlKey || e.metaKey)) return;
      if (!mod && (isTyping(e.target) || e.altKey)) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [combo, handler, enabled]);
};
