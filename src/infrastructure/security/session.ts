import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const SESSION_COOKIE = 'hdx_session';
export const SESSION_TTL_MS = 10 * 60 * 60 * 1000; // une journée de travail

/**
 * Jeton de session sans état : base64url({ sub, exp }) + "." + HMAC-SHA256.
 * Toute modification du jeton (identifiant, expiration) invalide la signature.
 */
export const createSessionTokens = (secret: string, now: () => number = Date.now, ttlMs = SESSION_TTL_MS) => {
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    issue: (userId: string): string => {
      const payload = Buffer.from(JSON.stringify({ sub: userId, exp: now() + ttlMs })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    /** Renvoie l'identifiant du compte, ou null si le jeton est absent, falsifié ou expiré. */
    verify: (token: string | undefined): string | null => {
      if (!token) return null;
      const [payload, signature] = token.split('.');
      if (!payload || !signature) return null;
      const expected = Buffer.from(sign(payload));
      const given = Buffer.from(signature);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      try {
        const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown; exp?: unknown };
        return typeof sub === 'string' && typeof exp === 'number' && exp > now() ? sub : null;
      } catch {
        return null;
      }
    },
  };
};

export type SessionTokens = ReturnType<typeof createSessionTokens>;

/** Secret de signature : variable d'environnement, sinon fichier généré une fois (hors dépôt Git). */
export const loadOrCreateSecret = (file: string): string => {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return process.env.SESSION_SECRET;
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dirname(file), { recursive: true });
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
};

// ---------- Cookies ----------

export const parseCookies = (header: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.includes('='))
      .map((part) => {
        const i = part.indexOf('=');
        const raw = part.slice(i + 1);
        let value = raw;
        try {
          value = decodeURIComponent(raw);
        } catch {
          /* valeur non encodée : conservée telle quelle */
        }
        return [part.slice(0, i), value];
      }),
  );

/** Cookie de session : HttpOnly (inaccessible au JavaScript), SameSite=Lax (protection CSRF), Secure en HTTPS. */
export const sessionCookie = (value: string, { maxAgeMs, secure }: { maxAgeMs: number; secure: boolean }) =>
  [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');

// ---------- Limitation des tentatives de connexion ----------

/** Fenêtre glissante simple : au-delà de `max` échecs par clé, la connexion est bloquée pendant `windowMs`. */
export const createRateLimiter = ({ max, windowMs, now = Date.now }: { max: number; windowMs: number; now?: () => number }) => {
  const failures = new Map<string, number[]>();
  const recent = (key: string) => (failures.get(key) ?? []).filter((t) => now() - t < windowMs);
  return {
    isBlocked: (key: string) => recent(key).length >= max,
    recordFailure: (key: string) => failures.set(key, [...recent(key), now()]),
    reset: (key: string) => failures.delete(key),
  };
};

export type RateLimiter = ReturnType<typeof createRateLimiter>;
