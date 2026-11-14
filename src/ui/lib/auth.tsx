import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { isAdmin, isStaff } from '../../domain';
import { api, type CurrentUserDto } from './api';

export const ME_KEY = ['me'] as const;

type Auth = {
  user: CurrentUserDto | null;
  loading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<CurrentUserDto>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

/** Page d'accueil selon le profil : back-office pour la DSI, portail pour les employés. */
export const homeFor = (user: Pick<CurrentUserDto, 'role'>) => (isStaff(user.role) ? '/dashboard' : '/portal');

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_KEY, queryFn: () => api.auth.me.query(), staleTime: 60_000, retry: false });

  const login = useCallback(
    async (email: string, password: string) => {
      const user = await api.auth.login.mutate({ email, password });
      // Une vérification de session lancée AVANT la connexion (réponse « non connecté ») ne doit pas
      // écraser l'utilisateur qui vient de se connecter : on l'annule avant d'enregistrer la session.
      await queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] }); // aucune donnée d'une session précédente
      queryClient.setQueryData(ME_KEY, user);
      return user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await api.auth.logout.mutate().catch(() => undefined);
    // D'abord quitter les écrans protégés, puis purger les données de la session.
    await queryClient.cancelQueries();
    queryClient.setQueryData(ME_KEY, null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
  }, [queryClient]);

  const user = me.data ?? null;
  const value = useMemo<Auth>(
    () => ({
      user,
      loading: me.isPending,
      isStaff: user ? isStaff(user.role) : false,
      isAdmin: user ? isAdmin(user.role) : false,
      login,
      logout,
    }),
    [user, me.isPending, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): Auth => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
};
