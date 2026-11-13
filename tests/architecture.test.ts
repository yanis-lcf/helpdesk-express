import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../src');

const filesIn = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesIn(full) : /\.tsx?$/.test(name) ? [full] : [];
  });

type Import = { specifier: string; typeOnly: boolean };
const importsOf = (file: string): Import[] =>
  [...readFileSync(file, 'utf8').matchAll(/import\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => ({
    specifier: m[2]!,
    typeOnly: Boolean(m[1]),
  }));

/** Couche (domain, application, …) ciblée par un import, ou 'external' pour un package npm/node. */
const targetLayer = (file: string, specifier: string): string =>
  specifier.startsWith('.') ? relative(SRC, resolve(dirname(file), specifier)).split(sep)[0]! : 'external';

const violations = (layer: string, allowed: string[], typeOnlyAllowed: string[] = []) =>
  filesIn(join(SRC, layer)).flatMap((file) =>
    importsOf(file)
      .filter(({ specifier, typeOnly }) => {
        const target = targetLayer(file, specifier);
        return !allowed.includes(target) && !(typeOnly && typeOnlyAllowed.includes(target));
      })
      .map(({ specifier }) => `${relative(SRC, file)} → ${specifier}`),
  );

describe('Règle de dépendance de la Clean Architecture', () => {
  it("ARC-01 le domaine n'a AUCUNE dépendance (ni npm, ni Node, ni autre couche)", () => {
    expect(violations('domain', ['domain'])).toEqual([]);
  });

  it("ARC-02 l'application ne dépend que du domaine", () => {
    expect(violations('application', ['domain', 'application'])).toEqual([]);
  });

  it("ARC-03 l'interface n'importe de l'infrastructure que des TYPES (contrat d'API), jamais de code serveur", () => {
    expect(violations('ui', ['ui', 'domain', 'external'], ['infrastructure'])).toEqual([]);
  });

  it('ARC-04 le domaine ne lit jamais l’horloge système ni l’aléatoire (pureté)', () => {
    const impure = filesIn(join(SRC, 'domain')).filter((f) => /Date\.now\(|new Date\(\)|Math\.random|crypto\./.test(readFileSync(f, 'utf8')));
    expect(impure.map((f) => relative(SRC, f))).toEqual([]);
  });
});
