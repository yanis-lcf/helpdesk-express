import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, DEMO_PASSWORD, login, toast, uniqueTitle } from './helpers';

/** Déclaration d'une demande depuis le portail ; renvoie son identifiant. */
const submitRequest = async (page: Page, title: string, description = 'Détails du problème') => {
  await page.goto('/portal');
  await page.getByRole('link', { name: /Réseau/ }).first().click();
  await expect(page.getByRole('radio', { name: /Réseau/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByPlaceholder(/VPN/).fill(title);
  await page.getByPlaceholder(/Décrivez ce qui se passe/).fill(description);
  await page.getByRole('radio', { name: /Je suis bloqué/ }).click();
  await page.getByRole('button', { name: 'Envoyer à la DSI' }).click();
  await expect(toast(page, 'Demande envoyée à la DSI')).toBeVisible();
  await expect(page).toHaveURL(/\/portal\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
};

const uiLogin = async (page: Page, email: string, password = DEMO_PASSWORD) => {
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
};

test.describe('Authentification et rôles', () => {
  test('E2E-21 connexion : erreur sur mauvais mot de passe, puis redirection selon le profil', async ({ page }) => {
    await page.goto('/login');
    await uiLogin(page, ACCOUNTS.employee.email, 'mauvais123');
    await expect(page.getByRole('alert')).toContainText('E-mail ou mot de passe incorrect');
    await uiLogin(page, ACCOUNTS.employee.email);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole('heading', { name: /Bonjour Claire/ })).toBeVisible();
  });

  test('E2E-22 page protégée sans session ⇒ connexion, puis retour à la page demandée', async ({ page }) => {
    await page.goto('/events');
    await expect(page).toHaveURL(/\/login$/);
    await uiLogin(page, ACCOUNTS.agent.email);
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByRole('heading', { level: 1, name: "Journal d'audit" })).toBeVisible();
  });

  test('E2E-23 un employé ne peut pas ouvrir le back-office DSI', async ({ page }) => {
    await login(page, 'employee');
    for (const path of ['/dashboard', '/tickets', '/board', '/events', '/admin/users']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/portal$/);
    }
    // Même en appelant l'API directement, le serveur refuse.
    const response = await page.request.get('/trpc/tickets.listActive');
    expect(response.status()).toBe(403);
  });

  test('E2E-24 déconnexion : la session est détruite côté serveur', async ({ page }) => {
    await login(page, 'agent');
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get('/trpc/tickets.listActive')).status()).toBe(401);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Portail employé ↔ back-office DSI', () => {
  test('E2E-25 parcours complet : déclaration → traitement DSI → confirmation par l’employé', async ({ browser }) => {
    const title = uniqueTitle('VPN coupé');
    const employee = await (await browser.newContext()).newPage();
    const agent = await (await browser.newContext()).newPage();
    await login(employee, 'employee');
    await login(agent, 'agent');

    // 1. L'employée déclare sa demande.
    const id = await submitRequest(employee, title, 'FortiClient se déconnecte toutes les 10 minutes.');
    await expect(employee.getByText('En attente de prise en charge')).toBeVisible();

    // 2. La DSI la voit, la prend en charge, note en interne, répond et résout.
    await agent.goto('/tickets');
    await agent.getByRole('row', { name: new RegExp(title) }).click();
    await expect(agent).toHaveURL(new RegExp(`/tickets/${id}$`));
    await expect(agent.getByLabel('Priorité', { exact: true })).toHaveValue('HIGH');
    await agent.getByRole('button', { name: "M'assigner" }).click();
    await expect(agent.getByLabel('Assigné à')).toHaveValue('Sarah Benali');
    const message = agent.getByRole('textbox', { name: 'Message' });
    await agent.getByRole('button', { name: 'Note interne' }).click();
    await message.fill('Certificat VPN expiré sur le poste');
    await agent.getByRole('button', { name: /Ajouter la note|Envoyer/ }).click();
    await expect(toast(agent, 'Note interne ajoutée')).toBeVisible();
    await agent.getByRole('button', { name: 'Réponse' }).click();
    await message.fill('Certificat renouvelé, pouvez-vous réessayer ?');
    await agent.getByRole('button', { name: 'Envoyer' }).click();
    await expect(toast(agent, 'Réponse envoyée')).toBeVisible();
    await agent.getByRole('button', { name: 'Marquer résolu' }).click();
    await expect(agent.locator('.page-head .badge')).toHaveText('Résolu');

    // 3. L'employée voit la réponse (jamais la note interne) et confirme.
    await employee.reload();
    await expect(employee.getByText('Certificat renouvelé, pouvez-vous réessayer ?')).toBeVisible();
    await expect(employee.getByText('Certificat VPN expiré sur le poste')).toHaveCount(0);
    await expect(employee.getByText('Sarah Benali').first()).toBeVisible();
    await employee.getByRole('button', { name: 'Oui, c’est résolu' }).click();
    await expect(toast(employee, 'Votre demande est clôturée')).toBeVisible();
    await expect(employee.locator('.page-head .badge')).toHaveText('Fermé');
    await expect(employee.getByRole('textbox', { name: 'Votre message' })).toHaveCount(0);

    // 4. Côté DSI, le ticket est fermé et la confirmation est tracée au nom de l'employée.
    await agent.goto('/events');
    await agent.getByLabel('Rechercher un ticket').fill(title);
    await expect(agent.locator('tbody tr').first()).toContainText('Claire Dubois');
  });

  test('E2E-26 « le problème persiste » : l’employé rouvre sa demande avec un motif', async ({ browser }) => {
    const title = uniqueTitle('Imprimante');
    const employee = await (await browser.newContext()).newPage();
    await login(employee, 'employee');
    const id = await submitRequest(employee, title);

    const agent = await (await browser.newContext()).newPage();
    await login(agent, 'agent');
    await agent.goto(`/tickets/${id}`);
    await agent.getByRole('button', { name: 'Marquer résolu' }).click();
    await expect(agent.locator('.page-head .badge')).toHaveText('Résolu');

    await employee.reload();
    await employee.getByRole('button', { name: 'Non, le problème persiste' }).click();
    await employee.getByRole('dialog').getByRole('textbox').fill('Toujours un bourrage papier au bac 2');
    await employee.getByRole('button', { name: 'Rouvrir la demande' }).click();
    await expect(toast(employee, 'Demande rouverte')).toBeVisible();
    await expect(employee.locator('.page-head .badge')).toHaveText('Ouvert');
    await expect(employee.getByText('Toujours un bourrage papier au bac 2')).toBeVisible();
  });

  test('E2E-27 isolation : un employé ne peut pas ouvrir la demande d’un collègue', async ({ browser }) => {
    const claire = await (await browser.newContext()).newPage();
    await login(claire, 'employee');
    const id = await submitRequest(claire, uniqueTitle('Confidentiel'));

    const marc = await (await browser.newContext()).newPage();
    await login(marc, 'employee2');
    await marc.goto(`/portal/${id}`);
    await expect(marc.getByRole('heading', { name: 'Demande introuvable' })).toBeVisible();
    await marc.goto('/portal');
    await expect(marc.getByText(/Confidentiel/)).toHaveCount(0);
  });
});

test.describe('Administration', () => {
  test('E2E-28 l’administrateur crée un compte employé, qui peut aussitôt se connecter', async ({ page, browser }) => {
    await login(page, 'admin');
    await page.goto('/admin/users');
    const email = `julie.${Date.now()}@demo.fr`;
    await page.getByRole('button', { name: 'Nouveau compte' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau compte' });
    await dialog.getByLabel('Nom complet *').fill('Julie Bernard');
    await dialog.getByLabel('E-mail professionnel *').fill(email);
    await dialog.getByLabel('Service').fill('RH');
    await dialog.getByLabel(/Mot de passe provisoire/).fill('bienvenue1');
    await dialog.getByRole('button', { name: 'Créer le compte' }).click();
    await expect(toast(page, 'Compte créé pour Julie Bernard')).toBeVisible();

    const julie = await (await browser.newContext()).newPage();
    await julie.goto('/login');
    await uiLogin(julie, email, 'bienvenue1');
    await expect(julie).toHaveURL(/\/portal$/);
  });

  test('E2E-29 un compte désactivé ne peut plus se connecter ; un agent n’a pas accès à l’administration', async ({ page, browser }) => {
    await login(page, 'admin');
    await page.goto('/admin/users');
    await page.getByLabel('Rechercher un utilisateur').fill('Léa Fontaine');
    const toggle = page.getByRole('switch', { name: 'Compte de Léa Fontaine actif' });
    await toggle.click();
    await expect(toast(page, 'Compte de Léa Fontaine mis à jour')).toBeVisible();
    await expect(toggle).not.toBeChecked();

    const lea = await (await browser.newContext()).newPage();
    await lea.goto('/login');
    await uiLogin(lea, 'lea.fontaine@demo.fr');
    await expect(lea.getByRole('alert')).toBeVisible();
    await toggle.click();
    await expect(toggle).toBeChecked();

    const agent = await (await browser.newContext()).newPage();
    await login(agent, 'agent');
    await agent.goto('/admin/users');
    await expect(agent).toHaveURL(/\/dashboard$/);
    await expect(agent.getByRole('link', { name: 'Utilisateurs' })).toHaveCount(0);
  });

  test('E2E-30 portail sur mobile : aucune barre de défilement horizontale', async ({ page }) => {
    await login(page, 'employee');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/portal', '/portal/new', '/login']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `débordement horizontal sur ${path}`).toBeLessThanOrEqual(0);
    }
  });
});
