import type { Category, Priority, SlaStatus, Status, TicketEventType } from '../../domain';

export const PRIORITY_LABELS: Record<Priority, string> = { LOW: 'Basse', MEDIUM: 'Moyenne', HIGH: 'Haute' };

export const STATUS_LABELS: Record<Status, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  HARDWARE: 'Matériel',
  SOFTWARE: 'Logiciel',
  NETWORK: 'Réseau',
  ACCESS: 'Accès & comptes',
  OTHER: 'Autre',
};

export const EVENT_LABELS: Record<TicketEventType, string> = {
  TicketCreated: 'Création',
  TicketUpdated: 'Modification',
  TicketAssigned: 'Assignation',
  TicketCommented: 'Commentaire',
  TicketDeleted: 'Suppression',
};

export const SLA_LABELS: Record<SlaStatus, string> = {
  ON_TRACK: 'Dans les temps',
  AT_RISK: 'À risque',
  BREACHED: 'Dépassé',
  MET: 'Respecté',
  MISSED: 'Non respecté',
};

export const FIELD_LABELS: Record<string, string> = {
  title: 'Titre',
  description: 'Description',
  priority: 'Priorité',
  category: 'Catégorie',
  status: 'Statut',
  requester: 'Demandeur',
  assignee: 'Assigné à',
  tags: 'Étiquettes',
  deleted: 'Supprimé',
  comment: 'Réponse',
  internalNote: 'Note interne',
};

/** Valeur d'un champ d'audit traduite pour l'affichage. */
export const formatFieldValue = (field: string, value: string | null): string => {
  if (field === 'deleted') return value === 'oui' ? 'oui' : 'non';
  if (value === null || value === '') return '∅';
  if (field === 'status') return STATUS_LABELS[value as Status] ?? value;
  if (field === 'priority') return PRIORITY_LABELS[value as Priority] ?? value;
  if (field === 'category') return CATEGORY_LABELS[value as Category] ?? value;
  return value;
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const formatFullDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'medium' });

/** Durée lisible : « 45 min », « 3 h 20 », « 2 j 4 h ». */
export const formatDuration = (ms: number): string => {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const restH = hours % 24;
  return restH ? `${days} j ${restH} h` : `${days} j`;
};

/** Temps relatif : « à l'instant », « il y a 5 min », « il y a 3 j ». */
export const formatRelative = (iso: string, now: number = Date.now()): string => {
  const diff = now - Date.parse(iso);
  if (diff < 45_000) return "à l'instant";
  return `il y a ${formatDuration(diff)}`;
};

export const formatSla = (status: SlaStatus, remainingMs: number): string => {
  switch (status) {
    case 'ON_TRACK':
    case 'AT_RISK':
      return `${formatDuration(remainingMs)} restantes`;
    case 'BREACHED':
      return `Dépassé de ${formatDuration(remainingMs)}`;
    case 'MET':
      return 'SLA respecté';
    case 'MISSED':
      return `SLA manqué (${formatDuration(remainingMs)})`;
  }
};

export const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

const AVATAR_COLORS = ['#5048e5', '#0b8fd6', '#0f9b6c', '#c77700', '#d6336c', '#7c3aed', '#0e7490', '#b45309'];
/** Couleur stable dérivée du nom. */
export const colorFor = (name: string) =>
  AVATAR_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length]!;
