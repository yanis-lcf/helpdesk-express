import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { PasswordHasher } from '../../application';

const scryptAsync = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))),
  );

const KEYLEN = 32;

/**
 * Hachage scrypt (résistant au matériel spécialisé), sel aléatoire de 16 octets par compte.
 * Format stocké : scrypt$N$r$p$sel$empreinte (paramètres conservés pour pouvoir les durcir plus tard).
 */
export const createScryptHasher = ({ N = 16384, r = 8, p = 1 } = {}): PasswordHasher => ({
  hash: async (password) => {
    const salt = randomBytes(16);
    const key = await scryptAsync(password.normalize('NFKC'), salt, KEYLEN, { N, r, p });
    return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
  },
  verify: async (password, stored) => {
    const [algo, n, rr, pp, salt, expected] = stored.split('$');
    if (algo !== 'scrypt' || !salt || !expected) return false;
    const expectedKey = Buffer.from(expected, 'base64url');
    const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expectedKey.length, {
      N: Number(n),
      r: Number(rr),
      p: Number(pp),
    });
    return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
  },
});
