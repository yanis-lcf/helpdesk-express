import { expect, test } from '@playwright/test';
import { createTicket, login, toast, uniqueTitle } from './helpers';

test.describe('Cycle de vie d’un ticket', () => {
  test.beforeEach(({ page }) => login(page, 'admin'));

  test('E2E-01 navigation : redirection vers le tableau de bord et menu principal', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    for (const [link, heading] of [
      ['Tickets', 'Tickets'],
      ['Kanban', 'Tableau Kanban'],
      ["Journal d'audit", "Journal d'audit"],
      ['Tableau de bord', /Bonjour|Bonsoir/],
    ] as const) {
      await page.getByRole('link', { name: link }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
  });

  test('E2E-02 création complète via la modale (raccourci N)', async ({ page }) => {
    const title = uniqueTitle('VPN impossible');
    await createTicket(page, { title, description: 'Erreur 809', priority: 'Haute', category: 'Réseau', assignee: 'Lucas Martin', tags: ['vpn'] });
    await expect(toast(page, 'Ticket créé')).toBeVisible();
    await expect(page.getByLabel('Priorité', { exact: true })).toHaveValue('HIGH');
    await expect(page.getByLabel('Catégorie')).toHaveValue('NETWORK');
    await expect(page.getByLabel('Assigné à')).toHaveValue('Lucas Martin');
    await expect(page.getByText('#vpn')).toBeVisible();

    await page.goto('/tickets');
    const row = page.getByRole('row', { name: new RegExp(title) });
    await expect(row).toContainText(/HD-\d{4}/);
    await expect(row).toContainText('Ouvert');
    await expect(row).toContainText('Lucas Martin');
  });

  test('E2E-03 le bouton de création reste désactivé sans titre', async ({ page }) => {
    await page.goto('/tickets');
    await page.getByRole('button', { name: 'Nouveau ticket' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau ticket' });
    await expect(dialog.getByRole('button', { name: 'Créer le ticket' })).toBeDisabled();
    await dialog.getByPlaceholder(/imprimante/i).fill('   ');
    await expect(dialog.getByRole('button', { name: 'Créer le ticket' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('E2E-04 mise à jour du statut, de la priorité et assignation « M’assigner »', async ({ page }) => {
    await createTicket(page, { title: uniqueTitle('Écran noir') });
    await page.getByLabel('Statut').selectOption('IN_PROGRESS');
    await expect(toast(page, 'Ticket mis à jour').first()).toBeVisible();
    await page.getByLabel('Priorité', { exact: true }).selectOption('LOW');
    await page.getByRole('button', { name: "M'assigner" }).click();
    await expect(page.getByLabel('Assigné à')).toHaveValue('Yanis Loucif');
    await expect(page.locator('.page-head .badge')).toHaveText('En cours');
    await expect(page.getByText(/version 4/)).toBeVisible();
  });

  test('E2E-05 modification du titre (en place) et de la description', async ({ page }) => {
    const title = uniqueTitle('Titre initial');
    await createTicket(page, { title });
    const field = page.getByLabel('Titre du ticket');
    await field.fill(`${title} (corrigé)`);
    await field.press('Enter');
    await expect(toast(page, 'Ticket mis à jour').first()).toBeVisible();
    await page.getByRole('button', { name: 'Modifier' }).click();
    await page.getByLabel('Description').fill('Nouvelle description détaillée');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Nouvelle description détaillée')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Titre du ticket')).toHaveValue(`${title} (corrigé)`);
  });

  test('E2E-06 conversation : réponse publique et note interne', async ({ page }) => {
    await createTicket(page, { title: uniqueTitle('Outlook plante') });
    const message = page.getByRole('textbox', { name: 'Message' });
    await message.fill('Bonjour, je prends en charge.');
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(toast(page, 'Réponse envoyée')).toBeVisible();

    await page.getByRole('button', { name: 'Note interne' }).click();
    await message.fill('Complément PDF suspect');
    await message.press('Control+Enter');
    await expect(toast(page, 'Note interne ajoutée')).toBeVisible();

    await expect(page.locator('.msg')).toHaveCount(2);
    await expect(page.locator('.msg.internal')).toContainText('Complément PDF suspect');
    await expect(page.getByRole('tab', { name: /Conversation \(2\)/ })).toBeVisible();
  });

  test('E2E-07 règle métier : un ticket fermé devient non modifiable', async ({ page }) => {
    await createTicket(page, { title: uniqueTitle('À fermer') });
    await page.getByRole('button', { name: 'Marquer résolu' }).click();
    await expect(page.locator('.page-head .badge')).toHaveText('Résolu');
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fermer définitivement' }).click();
    await expect(page.getByText('Ticket fermé : il ne peut plus être modifié')).toBeVisible();
    for (const label of ['Statut', 'Assigné à', 'Catégorie']) await expect(page.getByLabel(label)).toBeDisabled();
    await expect(page.getByLabel('Priorité', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Titre du ticket')).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveCount(0);
  });

  test('E2E-08 réouverture d’un ticket résolu', async ({ page }) => {
    await createTicket(page, { title: uniqueTitle('À rouvrir') });
    await page.getByRole('button', { name: 'Marquer résolu' }).click();
    await expect(page.locator('.page-head .badge')).toHaveText('Résolu');
    await page.getByRole('button', { name: 'Rouvrir' }).click();
    await expect(page.locator('.page-head .badge')).toHaveText('Ouvert');
  });

  test('E2E-09 suppression logique : disparaît des vues, reste dans l’audit', async ({ page }) => {
    const title = uniqueTitle('Doublon');
    const id = await createTicket(page, { title });
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    await page.getByRole('button', { name: /^Tous/ }).click();
    await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);

    await page.goto('/events');
    await page.getByLabel('Rechercher un ticket').fill(title);
    await expect(page.locator('.ev-TicketDeleted')).toHaveCount(1);
    await expect(page.locator('.ev-TicketCreated')).toHaveCount(1);

    await page.goto(`/tickets/${id}`);
    await expect(page.getByText(/Ticket supprimé le/)).toBeVisible();
  });

  test('E2E-10 un identifiant inconnu affiche une page « introuvable »', async ({ page }) => {
    await page.goto('/tickets/00000000-0000-0000-0000-000000000000');
    await expect(page.getByRole('heading', { name: 'Ticket introuvable' })).toBeVisible();
  });
});
