import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { errorCode } from './lib/api';
import { AuthProvider, ME_KEY } from './lib/auth';
import { SessionProvider } from './lib/session';
import { ToastProvider } from './lib/toast';
// Polices auto-hébergées : aucune requête vers un service tiers (RGPD, fonctionne hors ligne).
import '@fontsource-variable/inter/index.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000,
      refetchOnWindowFocus: true,
      // Pas de nouvelle tentative sur une erreur d'accès : elle ne se corrigera pas toute seule.
      retry: (count, error) => !['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(errorCode(error) ?? '') && count < 2,
    },
  },
  // Session expirée pendant l'utilisation : retour automatique à l'écran de connexion.
  queryCache: new QueryCache({
    onError: (error) => {
      if (errorCode(error) === 'UNAUTHORIZED') queryClient.setQueryData(ME_KEY, null);
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionProvider>
          <ToastProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
