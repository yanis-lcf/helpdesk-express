/**
 * Réponses types : les messages que la DSI écrit vingt fois par jour, insérés en un clic
 * puis personnalisés. {prenom} = prénom du demandeur, {agent} = agent connecté.
 */
export type Macro = { readonly id: string; readonly label: string; readonly body: string; readonly internal?: boolean };

export const MACROS: readonly Macro[] = [
  {
    id: 'ack',
    label: 'Prise en charge',
    body: 'Bonjour {prenom},\n\nJe prends en charge votre demande et reviens vers vous dès que possible.\n\n{agent} — DSI',
  },
  {
    id: 'info',
    label: 'Demande de précisions',
    body: 'Bonjour {prenom},\n\nPour avancer, pourriez-vous m’indiquer le message d’erreur exact (une capture d’écran suffit) et depuis quand le problème se produit ?\n\nMerci, {agent}',
  },
  {
    id: 'remote',
    label: 'Prise en main à distance',
    body: 'Bonjour {prenom},\n\nJe vous propose une prise en main à distance. Êtes-vous disponible dans les 30 prochaines minutes ?\n\n{agent}',
  },
  {
    id: 'resolved',
    label: 'Résolution — merci de confirmer',
    body: 'Bonjour {prenom},\n\nLe problème est corrigé de notre côté. Pouvez-vous vérifier et confirmer la résolution depuis votre espace support ?\n\nBonne journée, {agent}',
  },
  {
    id: 'supplier',
    label: 'En attente fournisseur (note interne)',
    body: 'Escalade fournisseur — référence du dossier : …\nProchaine relance prévue le : …',
    internal: true,
  },
];

/** Remplit les variables d'une réponse type. */
export const fillMacro = (body: string, vars: { readonly requester: string; readonly agent: string }) =>
  body.replaceAll('{prenom}', vars.requester.split(' ')[0] || vars.requester).replaceAll('{agent}', vars.agent);
