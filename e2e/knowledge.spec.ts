import { expect, test, type Page } from '@playwright/test';
import { login, toast, uniqueTitle } from './helpers';

/** Appels directs à l'API (préparation rapide des scénarios). */
const call = async <T,>(page: Page, path: string, input?: unknown): Promise<T> => {
  const response =
    input === undefined ? await page.request.get(`/trpc/${path}`) : await page.request.post(`/trpc/${path}`, { data: input });
  expect(response.ok(), `${path} → ${response.status()}`).toBe(true);
  return ((await response.json()) as { result: { data: T } }).result.data;
};
const myTicketCount = async (page: Page) => (await call<unknown[]>(page, 'portal.myTickets')).length;

test.describe('Auto-dépannage (base de connaissances)', () => {
  test('E2E-31 une solution proposée pendant la saisie règle le problème : aucun ticket créé', async ({ page }) => {
    await login(page, 'employee');
    const before = await myTicketCount(page);
    await page.goto('/portal/new?category=HARDWARE');
    await page.getByPlaceholder(/VPN/).fill('Mon imprimante a un bourrage papier');
    const suggestions = page.getByRole('region', { name: 'Solutions suggérées' });
    await expect(suggestions).toBeVisible();
    await suggestions.getByRole('button', { name: /Imprimante : bourrage papier/ }).click();
    await expect(suggestions.getByText(/Ouvrez le capot avant/)).toBeVisible();
    await suggestions.getByRole('button', { name: 'Cela a résolu mon problème' }).click();
    await expect(page).toHaveURL(/\/portal$/);
    expect(await myTicketCount(page)).toBe(before);
  });

  test('E2E-32 centre d’aide : recherche tolérante (accents, pluriels), lecture et retour « c’est réglé »', async ({ page }) => {
    await login(page, 'employee');
    await page.goto('/portal');
    await page.getByLabel('Chercher une solution dans le centre d’aide').fill('wifi deconnexions');
    await page.getByLabel('Chercher une solution dans le centre d’aide').press('Enter');
    await expect(page).toHaveURL(/\/portal\/help\?q=/);
    await page.getByRole('link', { name: /Wi-Fi lent ou qui se déconnecte/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Wi-Fi lent/ })).toBeVisible();
    await page.getByRole('button', { name: 'Oui, c’est réglé' }).click();
    await expect(toast(page, 'Merci pour votre retour')).toBeVisible();
  });

  test('E2E-33 la DSI publie un article ; il devient aussitôt trouvable par les employés', async ({ page, browser }) => {
    const title = uniqueTitle('Badge d’accès refusé');
    await login(page, 'agent');
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Nouvel article' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouvel article' });
    await dialog.getByLabel('Titre *').fill(title);
    await dialog.getByLabel('Catégorie').selectOption({ label: 'Accès & comptes' });
    await dialog.getByLabel(/Mots-clés/).fill('badge, tourniquet');
    await dialog.getByLabel('Solution').fill('1. Passez le badge à plat.\n2. Si le voyant reste rouge, demandez un nouveau badge à l’accueil.');
    await dialog.getByRole('button', { name: 'Aperçu' }).click();
    await expect(dialog.locator('.kb-preview li')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(toast(page, /Article « .* » créé/)).toBeVisible();

    const employee = await (await browser.newContext()).newPage();
    await login(employee, 'employee');
    await employee.goto('/portal/help?q=badge%20tourniquet');
    await expect(employee.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  });
});

test.describe('Satisfaction et réponses types', () => {
  test('E2E-34 l’employée note l’intervention en confirmant ; la DSI voit l’avis', async ({ page, browser }) => {
    await login(page, 'employee');
    const { ticketId } = await call<{ ticketId: string }>(page, 'portal.submit', { title: uniqueTitle('Écran qui scintille'), category: 'HARDWARE' });
    const agent = await (await browser.newContext()).newPage();
    await login(agent, 'agent');
    await call(agent, 'tickets.update', { ticketId, changes: { status: 'RESOLVED' } });

    await page.goto(`/portal/${ticketId}`);
    const card = page.getByRole('region', { name: 'Confirmation de résolution' });
    await card.getByRole('radio', { name: /^4 sur 5/ }).click();
    await card.getByLabel('Commentaire pour la DSI').fill('Rapide et efficace');
    await card.getByRole('button', { name: 'Oui, c’est résolu' }).click();
    await expect(toast(page, 'Votre demande est clôturée')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Votre avis' })).toContainText('Rapide et efficace');

    await agent.goto(`/tickets/${ticketId}`);
    await expect(agent.getByText('Avis du demandeur')).toBeVisible();
    await expect(agent.getByText('« Rapide et efficace »')).toBeVisible();
  });

  test('E2E-35 réponse type : insérée et personnalisée avec le prénom du demandeur', async ({ page, browser }) => {
    const employee = await (await browser.newContext()).newPage();
    await login(employee, 'employee');
    const { ticketId } = await call<{ ticketId: string }>(employee, 'portal.submit', { title: uniqueTitle('Clavier') });

    await login(page, 'agent');
    await page.goto(`/tickets/${ticketId}`);
    await page.getByLabel('Réponses types').selectOption({ label: 'Prise en charge' });
    const message = page.getByRole('textbox', { name: 'Message' });
    await expect(message).toHaveValue(/^Bonjour Claire,/);
    await expect(message).toHaveValue(/Sarah Benali — DSI/);
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(toast(page, 'Réponse envoyée')).toBeVisible();
  });
});

test.describe('Réversibilité et import', () => {
  test('E2E-36 l’administrateur importe un CSV d’annuaire puis exporte toutes les données', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/users');
    const stamp = Date.now();
    await page.getByRole('button', { name: 'Importer (CSV)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Importer des comptes (CSV)' });
    await dialog.getByLabel('Fichier CSV').setInputFiles({
      name: 'annuaire.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`nom;email;profil;service\nAlice Martin;alice.${stamp}@demo.fr;Employé;Finance\nSans adresse;pas-un-email;;\n`),
    });
    await expect(dialog.getByText('2 ligne(s) détectée(s)')).toBeVisible();
    await dialog.getByRole('button', { name: /Importer 2 compte/ }).click();
    await expect(dialog).toContainText('1 compte(s) créé(s), 1 ligne(s) ignorée(s)');
    const credentials = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Identifiants provisoires' }).click();
    expect((await credentials).suggestedFilename()).toBe('identifiants-provisoires.csv');
    await dialog.getByRole('button', { name: 'Terminer' }).click();

    const exported = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export complet' }).click();
    const file = await exported;
    expect(file.suggestedFilename()).toMatch(/^helpdesk-export-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8'));
    expect(data.integrity.valid).toBe(true);
    expect(data.users.some((u: { email: string }) => u.email === `alice.${stamp}@demo.fr`)).toBe(true);
    expect(JSON.stringify(data)).not.toContain('scrypt$');
  });
});
