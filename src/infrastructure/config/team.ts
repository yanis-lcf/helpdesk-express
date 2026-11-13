/**
 * Équipe support (configuration). Dans une version SaaS, cette liste viendrait
 * de l'annuaire de l'entreprise (SSO / Azure AD / Google Workspace).
 */
export type TeamMember = { readonly name: string; readonly role: string };

export const TEAM: readonly TeamMember[] = [
  { name: 'Yanis Loucif', role: 'Responsable support' },
  { name: 'Sarah Benali', role: 'Technicienne N2' },
  { name: 'Lucas Martin', role: 'Technicien N1' },
  { name: 'Inès Moreau', role: 'Ingénieure réseau' },
  { name: 'Thomas Petit', role: 'Administrateur systèmes' },
];

export const SYSTEM_ACTOR = 'Système';
