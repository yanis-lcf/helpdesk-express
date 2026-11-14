import {
  err,
  isRole,
  normalizeEmail,
  ok,
  validateNewUser,
  validatePassword,
  type NewUserInput,
  type Result,
  type Role,
  type User,
  type UserId,
} from '../domain';
import type { IdGenerator, PasswordHasher, UserRecord, UserRepository } from './ports';

export type IdentityError =
  | { readonly code: 'INVALID_CREDENTIALS' }
  | { readonly code: 'USER_VALIDATION'; readonly message: string }
  | { readonly code: 'EMAIL_TAKEN' }
  | { readonly code: 'USER_NOT_FOUND' }
  | { readonly code: 'SELF_LOCKOUT' };

/** Retire l'empreinte du mot de passe avant toute sortie de la couche application. */
export const toPublicUser = ({ passwordHash: _hash, ...user }: UserRecord): User => user;

export type UserPatch = {
  readonly role?: Role;
  readonly active?: boolean;
  readonly department?: string;
  readonly jobTitle?: string;
};

/** Empreinte factice : on vérifie toujours un mot de passe, même si le compte n'existe pas (pas de fuite par le temps de réponse). */
const DUMMY_HASH_PASSWORD = 'compte-inexistant-0';

export const makeIdentityService = ({
  users,
  hasher,
  newId,
}: {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly newId: IdGenerator;
}) => {
  let dummyHash: Promise<string> | null = null;

  return {
    /** Connexion : même message d'erreur que le compte existe ou non, et compte désactivé = refus. */
    authenticate: async (email: string, password: string): Promise<Result<IdentityError, User>> => {
      const record = await users.findByEmail(normalizeEmail(email));
      dummyHash ??= hasher.hash(DUMMY_HASH_PASSWORD);
      const valid = await hasher.verify(password, record?.passwordHash ?? (await dummyHash));
      if (!record || !valid || !record.active) return err({ code: 'INVALID_CREDENTIALS' });
      return ok(toPublicUser(record));
    },

    /** Utilisateur courant d'une session : null si le compte a été supprimé ou désactivé entre-temps. */
    getActiveUser: async (id: UserId): Promise<User | null> => {
      const record = await users.findById(id);
      return record?.active ? toPublicUser(record) : null;
    },

    findByName: async (name: string): Promise<User | null> => {
      const wanted = name.trim().toLowerCase();
      const found = (await users.list()).find((u) => u.name.toLowerCase() === wanted);
      return found ? toPublicUser(found) : null;
    },

    listUsers: async (): Promise<readonly User[]> =>
      [...(await users.list())].map(toPublicUser).sort((a, b) => a.name.localeCompare(b.name, 'fr')),

    createUser: async (input: NewUserInput & { readonly password: string }): Promise<Result<IdentityError, User>> => {
      const valid = validateNewUser(input);
      if (!valid.ok) return err({ code: 'USER_VALIDATION', message: valid.error });
      const password = validatePassword(input.password);
      if (!password.ok) return err({ code: 'USER_VALIDATION', message: password.error });
      if (await users.findByEmail(valid.value.email)) return err({ code: 'EMAIL_TAKEN' });

      const record: UserRecord = { id: newId(), ...valid.value, active: true, passwordHash: await hasher.hash(password.value) };
      await users.save(record);
      return ok(toPublicUser(record));
    },

    /** Un administrateur ne peut ni se retirer ses propres droits, ni désactiver son propre compte. */
    updateUser: async (id: UserId, patch: UserPatch, by: User): Promise<Result<IdentityError, User>> => {
      const record = await users.findById(id);
      if (!record) return err({ code: 'USER_NOT_FOUND' });
      if (patch.role !== undefined && !isRole(patch.role)) return err({ code: 'USER_VALIDATION', message: 'Rôle invalide.' });
      if (id === by.id && ((patch.role !== undefined && patch.role !== 'ADMIN') || patch.active === false))
        return err({ code: 'SELF_LOCKOUT' });

      const updated: UserRecord = {
        ...record,
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.department !== undefined ? { department: patch.department.trim().slice(0, 80) } : {}),
        ...(patch.jobTitle !== undefined ? { jobTitle: patch.jobTitle.trim().slice(0, 80) } : {}),
      };
      await users.save(updated);
      return ok(toPublicUser(updated));
    },

    resetPassword: async (id: UserId, newPassword: string): Promise<Result<IdentityError, User>> => {
      const record = await users.findById(id);
      if (!record) return err({ code: 'USER_NOT_FOUND' });
      const password = validatePassword(newPassword);
      if (!password.ok) return err({ code: 'USER_VALIDATION', message: password.error });
      const updated = { ...record, passwordHash: await hasher.hash(password.value) };
      await users.save(updated);
      return ok(toPublicUser(updated));
    },

    changeOwnPassword: async (user: User, current: string, next: string): Promise<Result<IdentityError, User>> => {
      const record = await users.findById(user.id);
      if (!record || !(await hasher.verify(current, record.passwordHash))) return err({ code: 'INVALID_CREDENTIALS' });
      const password = validatePassword(next);
      if (!password.ok) return err({ code: 'USER_VALIDATION', message: password.error });
      await users.save({ ...record, passwordHash: await hasher.hash(password.value) });
      return ok(toPublicUser(record));
    },
  };
};

export type IdentityService = ReturnType<typeof makeIdentityService>;
