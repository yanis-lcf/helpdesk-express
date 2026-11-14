import { err, ok, type Result } from '../result';

/**
 * Identité et rôles. Trois profils :
 * - EMPLOYEE : collaborateur de l'entreprise, utilise le portail pour déclarer et suivre SES demandes ;
 * - AGENT    : technicien de la DSI, traite tous les tickets dans le back-office ;
 * - ADMIN    : responsable DSI, comme AGENT + gestion des comptes.
 */
export const ROLES = ['EMPLOYEE', 'AGENT', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];
export type UserId = string;

export type User = {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly department: string;
  readonly jobTitle: string;
  readonly active: boolean;
};

export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/** Membre de la DSI : accès au back-office. */
export const isStaff = (role: Role): boolean => role === 'AGENT' || role === 'ADMIN';
export const isAdmin = (role: Role): boolean => role === 'ADMIN';

export const IDENTITY_LIMITS = { name: 80, email: 160, department: 80, jobTitle: 80, passwordMin: 8, passwordMax: 200 } as const;

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NewUserInput = {
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly department?: string;
  readonly jobTitle?: string;
};

export type ValidatedUser = Omit<User, 'id' | 'active'>;

/** Validation pure d'un nouveau compte (le mot de passe est contrôlé à part, il ne fait pas partie du modèle). */
export const validateNewUser = (input: NewUserInput): Result<string, ValidatedUser> => {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const email = normalizeEmail(input.email);
  const department = (input.department ?? '').trim();
  const jobTitle = (input.jobTitle ?? '').trim();
  if (name.length < 2) return err('Le nom est obligatoire.');
  if (name.length > IDENTITY_LIMITS.name) return err(`Le nom ne doit pas dépasser ${IDENTITY_LIMITS.name} caractères.`);
  if (!EMAIL.test(email) || email.length > IDENTITY_LIMITS.email) return err('Adresse e-mail invalide.');
  if (!isRole(input.role)) return err('Rôle invalide.');
  if (department.length > IDENTITY_LIMITS.department) return err('Service trop long.');
  if (jobTitle.length > IDENTITY_LIMITS.jobTitle) return err('Fonction trop longue.');
  return ok({ name, email, role: input.role, department, jobTitle });
};

/** Politique de mot de passe : longueur minimale + au moins une lettre et un chiffre. */
export const validatePassword = (password: string): Result<string, string> => {
  if (password.length < IDENTITY_LIMITS.passwordMin)
    return err(`Le mot de passe doit contenir au moins ${IDENTITY_LIMITS.passwordMin} caractères.`);
  if (password.length > IDENTITY_LIMITS.passwordMax) return err('Mot de passe trop long.');
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return err('Le mot de passe doit contenir au moins une lettre et un chiffre.');
  return ok(password);
};
