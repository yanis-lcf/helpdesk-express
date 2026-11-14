import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ArticleRepository } from '../../application';
import type { Article } from '../../domain';

/** Base de connaissances en mémoire (tests). Les écritures sont sérialisées : aucun compteur perdu. */
export const createInMemoryArticleRepository = (
  seed: readonly Article[] = [],
  persist?: (all: readonly Article[]) => Promise<void>,
): ArticleRepository => {
  const byId = new Map(seed.map((a) => [a.id, structuredClone(a)]));
  const write = async (article: Article) => {
    byId.set(article.id, structuredClone(article));
    await persist?.([...byId.values()]);
  };
  return {
    list: async () => [...byId.values()].map((a) => structuredClone(a)),
    findById: async (id) => {
      const found = byId.get(id);
      return found ? structuredClone(found) : null;
    },
    save: write,
    update: async (id, change) => {
      const current = byId.get(id);
      if (!current) return null;
      // Lecture et calcul synchrones : deux mises à jour concurrentes ne peuvent pas s'entrelacer.
      const next = change(structuredClone(current));
      await write(next);
      return structuredClone(next);
    },
  };
};

/** Base de connaissances persistée dans un fichier JSON (écriture atomique, une à la fois). */
export const createJsonArticleRepository = async (file: string): Promise<ArticleRepository> => {
  await mkdir(dirname(file), { recursive: true });
  const seed = existsSync(file) ? (JSON.parse(await readFile(file, 'utf8')) as Article[]) : [];
  let queue = Promise.resolve();
  return createInMemoryArticleRepository(seed, (all) => {
    const snapshot = JSON.stringify(all, null, 2);
    queue = queue.then(async () => {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, file);
    });
    return queue;
  });
};
