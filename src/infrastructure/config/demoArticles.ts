import type { ArticleInput } from '../../domain';

/** Articles de démonstration : les incidents les plus fréquents d'un parc de PME, résolus en autonomie. */
export const DEMO_ARTICLES: readonly (ArticleInput & { readonly author: string; readonly views: number; readonly deflections: number })[] = [
  {
    title: 'Mot de passe expiré ou compte verrouillé',
    category: 'ACCESS',
    keywords: ['mot de passe', 'verrouillé', 'bloqué', 'expiré', 'connexion', 'session'],
    published: true,
    author: 'Thomas Petit',
    views: 64,
    deflections: 23,
    body: `Votre compte se verrouille après 5 tentatives incorrectes et se débloque seul au bout de 15 minutes.

Pour changer un mot de passe expiré :
1. Sur un poste de l'entreprise, appuyez sur Ctrl + Alt + Suppr puis choisissez « Modifier un mot de passe ».
2. Saisissez l'ancien mot de passe, puis deux fois le nouveau (12 caractères minimum, dont un chiffre).
3. Sur votre téléphone, mettez à jour le mot de passe de la messagerie quand il vous est demandé.

Si le compte reste bloqué après 15 minutes, créez une demande « Accès & comptes » : la DSI le débloque en quelques minutes.`,
  },
  {
    title: 'VPN : erreur « authentification échouée » sur FortiClient',
    category: 'NETWORK',
    keywords: ['vpn', 'forticlient', 'télétravail', 'domicile', 'certificat', 'authentification'],
    published: true,
    author: 'Inès Moreau',
    views: 41,
    deflections: 14,
    body: `Cette erreur vient presque toujours d'un mot de passe récemment changé ou d'un certificat expiré.

1. Vérifiez que vous pouvez ouvrir votre messagerie web avec le même mot de passe.
2. Dans FortiClient, supprimez le mot de passe enregistré puis ressaisissez-le.
3. Redémarrez l'ordinateur en étant branché au réseau de l'entreprise une fois par mois : le certificat se renouvelle automatiquement.

Si l'erreur persiste depuis votre domicile, créez une demande « Réseau » en précisant l'heure de l'erreur.`,
  },
  {
    title: 'Imprimante : bourrage papier ou file d’impression bloquée',
    category: 'HARDWARE',
    keywords: ['imprimante', 'impression', 'bourrage', 'papier', 'file', 'imprimer'],
    published: true,
    author: 'Lucas Martin',
    views: 37,
    deflections: 11,
    body: `Bourrage papier :
1. Ouvrez le capot avant puis le bac indiqué sur l'écran de l'imprimante.
2. Retirez la feuille en tirant doucement dans le sens du papier.
3. Aérez la ramette avant de la remettre dans le bac (pas plus haut que le trait).

Documents qui ne sortent pas :
- Dans Windows, ouvrez « Imprimantes et scanners », sélectionnez l'imprimante puis « Ouvrir la file d'attente ».
- Annulez le document bloqué en tête de file et relancez l'impression.

Si le voyant reste orange, créez une demande « Matériel » avec le nom de l'imprimante (étiquette sur le capot).`,
  },
  {
    title: 'Outlook se ferme au démarrage ou ne s’ouvre plus',
    category: 'SOFTWARE',
    keywords: ['outlook', 'messagerie', 'mail', 'plantage', 'ferme', 'démarrage'],
    published: true,
    author: 'Sarah Benali',
    views: 29,
    deflections: 8,
    body: `Dans la plupart des cas, un complément (PDF, signature, CRM) est en cause.

1. Fermez Outlook, puis maintenez la touche Ctrl en cliquant sur l'icône Outlook : acceptez le « mode sans échec ».
2. Si Outlook fonctionne ainsi, allez dans Fichier > Options > Compléments > Gérer « Compléments COM » et décochez les compléments récents.
3. Redémarrez Outlook normalement.

En attendant, votre messagerie reste accessible sur le web : https://outlook.office.com`,
  },
  {
    title: 'Wi-Fi lent ou qui se déconnecte',
    category: 'NETWORK',
    keywords: ['wifi', 'wi-fi', 'internet', 'déconnexion', 'lent', 'réseau', 'visio'],
    published: true,
    author: 'Inès Moreau',
    views: 33,
    deflections: 9,
    body: `1. Vérifiez que vous êtes connecté au réseau « ENTREPRISE » et non « INVITES » (débit limité).
2. Désactivez puis réactivez le Wi-Fi de votre ordinateur.
3. Pour les visioconférences, préférez une prise réseau : chaque salle de réunion en dispose sous la table.

Si plusieurs collègues de la même zone sont touchés, créez une seule demande « Réseau » en indiquant la salle ou l'étage : la DSI vérifiera la borne.`,
  },
  {
    title: 'Brancher un second écran ou un vidéoprojecteur',
    category: 'HARDWARE',
    keywords: ['écran', 'projecteur', 'vidéoprojecteur', 'hdmi', 'affichage', 'dupliquer'],
    published: true,
    author: 'Lucas Martin',
    views: 22,
    deflections: 7,
    body: `1. Branchez le câble HDMI ou USB-C sur l'ordinateur allumé.
2. Appuyez sur les touches Windows + P et choisissez « Dupliquer » (présentation) ou « Étendre » (deux écrans).
3. Sur un vidéoprojecteur, sélectionnez la source HDMI avec la télécommande.

Besoin d'un écran supplémentaire pour votre poste ? Créez une demande « Matériel » : le délai de livraison est d'environ une semaine.`,
  },
  {
    title: 'Obtenir l’accès à un dossier partagé',
    category: 'ACCESS',
    keywords: ['partage', 'dossier', 'droits', 'accès refusé', 'lecteur réseau', 'fichiers'],
    published: true,
    author: 'Thomas Petit',
    views: 18,
    deflections: 4,
    body: `Les accès aux dossiers partagés sont accordés par groupe, avec l'accord du responsable du dossier.

1. Créez une demande « Accès & comptes » en précisant le chemin du dossier (ex. \\\\fs-01\\Projets) et le type d'accès (lecture ou modification).
2. Indiquez le nom de votre responsable : la DSI lui demandera sa validation.
3. Une fois l'accès accordé, fermez puis rouvrez votre session Windows.`,
  },
  {
    title: 'Teams : micro ou caméra non détectés',
    category: 'SOFTWARE',
    keywords: ['teams', 'micro', 'caméra', 'visio', 'son', 'réunion', 'casque'],
    published: true,
    author: 'Sarah Benali',
    views: 26,
    deflections: 10,
    body: `1. Dans Teams, cliquez sur … > Paramètres > Périphériques et choisissez le bon micro et la bonne caméra.
2. Vérifiez qu'aucune autre application (Zoom, navigateur) n'utilise la caméra.
3. Débranchez puis rebranchez le casque USB, et testez avec « Passer un appel test ».
4. Si rien n'apparaît, redémarrez l'ordinateur.`,
  },
  {
    title: 'Procédure d’arrivée d’un nouveau collaborateur (brouillon)',
    category: 'ACCESS',
    keywords: ['onboarding', 'arrivée', 'nouveau'],
    published: false,
    author: 'Yanis Loucif',
    views: 0,
    deflections: 0,
    body: `À compléter avec les RH : délais de création des comptes, matériel standard, remise des badges.`,
  },
];
