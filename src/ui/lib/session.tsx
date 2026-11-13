import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/** Accès sûr au localStorage (navigation privée, stockage bloqué…). */
export const storage = {
  get: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* stockage indisponible : préférence non mémorisée */
    }
  },
};

const ACTOR_KEY = 'hdx.actor';
const THEME_KEY = 'hdx.theme';
export const DEFAULT_ACTOR = 'Yanis Loucif';

// L'acteur courant est aussi lisible hors React (client tRPC).
let currentActor = storage.get(ACTOR_KEY) ?? DEFAULT_ACTOR;
export const getActor = () => currentActor;

export type Theme = 'light' | 'dark';
const systemTheme = (): Theme =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

type Session = {
  actor: string;
  setActor: (name: string) => void;
  theme: Theme;
  toggleTheme: () => void;
};

const SessionContext = createContext<Session | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [actor, setActorState] = useState(currentActor);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = storage.get(THEME_KEY);
    return saved === 'dark' || saved === 'light' ? saved : systemTheme();
  });

  const setActor = useCallback((name: string) => {
    currentActor = name;
    storage.set(ACTOR_KEY, name);
    setActorState(name);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      storage.set(THEME_KEY, next);
      return next;
    });
  }, []);

  return <SessionContext.Provider value={{ actor, setActor, theme, toggleTheme }}>{children}</SessionContext.Provider>;
};

export const useSession = (): Session => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  return ctx;
};
