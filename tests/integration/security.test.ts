import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRateLimiter, createSessionTokens, parseCookies, sessionCookie } from '../../src/infrastructure/security/session';
import { createJsonUserRepository } from '../../src/infrastructure/users/userRepositories';
import { fastHasher, USERS } from '../helpers/fixtures';

const SECRET = 'x'.repeat(48);

describe('Sécurité — mots de passe', () => {
  it('SEC-01 scrypt : vérifie le bon mot de passe, rejette les autres, sel différent à chaque hachage', async () => {
    const a = await fastHasher.hash('bienvenue1');
    const b = await fastHasher.hash('bienvenue1');
    expect(a).not.toBe(b);
    expect(await fastHasher.verify('bienvenue1', a)).toBe(true);
    expect(await fastHasher.verify('Bienvenue1', a)).toBe(false);
    expect(await fastHasher.verify('bienvenue1', 'md5$abc')).toBe(false);
  });
});

describe('Sécurité — jetons de session', () => {
  it('SEC-02 un jeton émis est reconnu', () => {
    const tokens = createSessionTokens(SECRET);
    expect(tokens.verify(tokens.issue('u1'))).toBe('u1');
  });

  it('SEC-03 un jeton modifié (identifiant usurpé) ou signé avec un autre secret est rejeté', () => {
    const tokens = createSessionTokens(SECRET);
    const [, signature] = tokens.issue('u1').split('.');
    const forged = `${Buffer.from(JSON.stringify({ sub: 'u-admin', exp: Date.now() + 1e9 })).toString('base64url')}.${signature}`;
    expect(tokens.verify(forged)).toBeNull();
    expect(createSessionTokens('y'.repeat(48)).verify(tokens.issue('u1'))).toBeNull();
    for (const garbage of [undefined, '', 'abc', 'a.b.c', '.'] as const) expect(tokens.verify(garbage)).toBeNull();
  });

  it('SEC-04 un jeton expiré est rejeté', () => {
    let now = 0;
    const tokens = createSessionTokens(SECRET, () => now, 1000);
    const token = tokens.issue('u1');
    now = 999;
    expect(tokens.verify(token)).toBe('u1');
    now = 1000;
    expect(tokens.verify(token)).toBeNull();
  });

  it('SEC-05 cookie de session : HttpOnly, SameSite=Lax, Secure en HTTPS, effacement par Max-Age=0', () => {
    expect(sessionCookie('abc', { maxAgeMs: 3_600_000, secure: false })).toBe('hdx_session=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600');
    expect(sessionCookie('abc', { maxAgeMs: 1000, secure: true })).toContain('; Secure');
    expect(sessionCookie('', { maxAgeMs: 0, secure: false })).toContain('Max-Age=0');
    expect(parseCookies('a=1; hdx_session=x%2Ey; vide; b=%E0')).toEqual({ a: '1', hdx_session: 'x.y', b: '%E0' });
  });
});

describe('Sécurité — limitation des tentatives', () => {
  it('SEC-06 blocage après N échecs, levé après la fenêtre ou après un succès', () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 100, now: () => now });
    limiter.recordFailure('k');
    expect(limiter.isBlocked('k')).toBe(false);
    limiter.recordFailure('k');
    expect(limiter.isBlocked('k')).toBe(true);
    expect(limiter.isBlocked('autre')).toBe(false);
    now = 100;
    expect(limiter.isBlocked('k')).toBe(false);
    limiter.recordFailure('k');
    limiter.recordFailure('k');
    limiter.reset('k');
    expect(limiter.isBlocked('k')).toBe(false);
  });
});

describe('Annuaire persistant (fichier JSON)', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('USR-01 les comptes survivent à un redémarrage ; recherche e-mail insensible à la casse ; aucun fichier temporaire résiduel', async () => {
    dir = await mkdtemp(join(tmpdir(), 'hdx-users-'));
    const file = join(dir, 'sub', 'users.json');
    const repo = await createJsonUserRepository(file);
    await repo.save({ ...USERS.claire, passwordHash: 'h' });
    await repo.save({ ...USERS.claire, department: 'Ventes', passwordHash: 'h' });

    const reloaded = await createJsonUserRepository(file);
    expect(await reloaded.list()).toHaveLength(1);
    expect(await reloaded.findByEmail('CLAIRE@test.fr')).toMatchObject({ department: 'Ventes' });
    expect(JSON.parse(await readFile(file, 'utf8'))).toHaveLength(1);
    await expect(stat(`${file}.tmp`)).rejects.toThrow();
  });

  it('USR-02 les objets renvoyés sont des copies (pas de modification par référence)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'hdx-users-'));
    const repo = await createJsonUserRepository(join(dir, 'users.json'));
    await repo.save({ ...USERS.claire, passwordHash: 'h' });
    const found = (await repo.findById(USERS.claire.id))!;
    (found as { role: string }).role = 'ADMIN';
    expect((await repo.findById(USERS.claire.id))!.role).toBe('EMPLOYEE');
  });
});
