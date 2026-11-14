import type { NewUserInput } from '../../domain';

/**
 * Comptes de démonstration créés par `npm run seed`.
 * En production, les comptes viennent de l'écran d'administration (ou d'un annuaire d'entreprise).
 */
export const DEMO_PASSWORD = 'demo2026';

export const DEMO_STAFF: readonly NewUserInput[] = [
  { name: 'Yanis Loucif', email: 'yanis.loucif@demo.fr', role: 'ADMIN', department: 'DSI', jobTitle: 'Responsable support' },
  { name: 'Sarah Benali', email: 'sarah.benali@demo.fr', role: 'AGENT', department: 'DSI', jobTitle: 'Technicienne N2' },
  { name: 'Lucas Martin', email: 'lucas.martin@demo.fr', role: 'AGENT', department: 'DSI', jobTitle: 'Technicien N1' },
  { name: 'Inès Moreau', email: 'ines.moreau@demo.fr', role: 'AGENT', department: 'DSI', jobTitle: 'Ingénieure réseau' },
  { name: 'Thomas Petit', email: 'thomas.petit@demo.fr', role: 'AGENT', department: 'DSI', jobTitle: 'Administrateur systèmes' },
];

export const DEMO_EMPLOYEES: readonly NewUserInput[] = [
  { name: 'Claire Dubois', email: 'claire.dubois@demo.fr', role: 'EMPLOYEE', department: 'Commercial', jobTitle: 'Chargée de clientèle' },
  { name: 'Marc Leroy', email: 'marc.leroy@demo.fr', role: 'EMPLOYEE', department: 'Commercial', jobTitle: 'Commercial terrain' },
  { name: 'Nadia Haddad', email: 'nadia.haddad@demo.fr', role: 'EMPLOYEE', department: 'Marketing', jobTitle: 'Cheffe de projet' },
  { name: 'Paul Girard', email: 'paul.girard@demo.fr', role: 'EMPLOYEE', department: 'Direction', jobTitle: 'Directeur des opérations' },
  { name: 'Émilie Robert', email: 'emilie.robert@demo.fr', role: 'EMPLOYEE', department: 'Comptabilité', jobTitle: 'Comptable' },
  { name: 'Hugo Lambert', email: 'hugo.lambert@demo.fr', role: 'EMPLOYEE', department: 'Logistique', jobTitle: 'Responsable entrepôt' },
  { name: 'Sophie Laurent', email: 'sophie.laurent@demo.fr', role: 'EMPLOYEE', department: 'RH', jobTitle: 'Chargée de recrutement' },
  { name: 'Karim Mansour', email: 'karim.mansour@demo.fr', role: 'EMPLOYEE', department: 'Commercial', jobTitle: 'Analyste data' },
  { name: 'Léa Fontaine', email: 'lea.fontaine@demo.fr', role: 'EMPLOYEE', department: 'Accueil', jobTitle: 'Hôtesse d’accueil' },
];

export const SYSTEM_ACTOR = 'Système';
