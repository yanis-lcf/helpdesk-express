import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { UserRecord, UserRepository } from '../../application';

/** Annuaire en mémoire (tests, démonstration). */
export const createInMemoryUserRepository = (seed: readonly UserRecord[] = [], persist?: (all: readonly UserRecord[]) => Promise<void>): UserRepository => {
  const byId = new Map(seed.map((u) => [u.id, structuredClone(u)]));
  const clone = (u: UserRecord | undefined) => (u ? structuredClone(u) : null);
  return {
    list: async () => [...byId.values()].map((u) => structuredClone(u)),
    findById: async (id) => clone(byId.get(id)),
    findByEmail: async (email) => clone([...byId.values()].find((u) => u.email === email.trim().toLowerCase())),
    save: async (user) => {
      const next = new Map(byId).set(user.id, structuredClone(user));
      await persist?.([...next.values()]);
      byId.set(user.id, structuredClone(user));
    },
  };
};

/**
 * Annuaire persistant dans un fichier JSON. Écriture atomique (fichier temporaire puis renommage) :
 * un arrêt brutal ne laisse jamais un fichier à moitié écrit.
 */
export const createJsonUserRepository = async (file: string): Promise<UserRepository> => {
  await mkdir(dirname(file), { recursive: true });
  const seed = existsSync(file) ? (JSON.parse(await readFile(file, 'utf8')) as UserRecord[]) : [];
  let queue = Promise.resolve();
  return createInMemoryUserRepository(seed, (all) => {
    queue = queue.then(async () => {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
      await rename(tmp, file);
    });
    return queue;
  });
};
