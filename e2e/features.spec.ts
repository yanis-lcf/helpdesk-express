import { expect, test } from '@playwright/test';
import { createTicket, toast, uniqueTitle } from './helpers';

test.describe('Fonctionnalités avancées', () => {
  test('E2E-11 Kanban : glisser-déposer change le statut (et la fermeture demande confirmation)', async ({ page }) => {
    const title = uniqueTitle('Kanban');
    await createTicket(page, { title });
    await page.goto('/board');
    const card = page.locator('.kcard', { hasText: title });
    await expect(page.locator('[data-status="OPEN"]').locator('.kcard', { hasText: title })).toBeVisible();

    await card.dragTo(page.locator('[data-status="IN_PROGRESS"]'));
    await expect(toast(page, /→ En cours/)).toBeVisible();
    await expect(page.locator('[data-status="IN_PROGRESS"]').locator('.kcard', { hasText: title })).toBeVisible();

    await page.locator('.kcard', { hasText: title }).dragTo(page.locator('[data-status="CLOSED"]'));
    await expect(page.getByRole('dialog')).toContainText('Fermer définitivement ce ticket ?');
    await page.getByRole('dialog').getByRole('button', { name: 'Fermer le ticket' }).click();
    await expect(page.locator('[data-status="CLOSED"]').locator('.kcard', { hasText: title })).toBeVisible();
    await expect(page.locator('.kcard', { hasText: title })).toHaveAttribute('draggable', 'false');
  });

  test('E2E-12 voyage dans le temps : l’état passé est reconstitué par rejeu', async ({ page }) => {
    await createTicket(page, { title: uniqueTitle('Historique') });
    await page.getByLabel('Statut').selectOption('IN_PROGRESS');
    await expect(page.locator('.page-head .badge')).toHaveText('En cours');
    await page.getByLabel('Priorité', { exact: true }).selectOption('HIGH');
    await expect(page.getByText(/version 3/)).toBeVisible();

    await page.getByRole('tab', { name: /Historique/ }).click();
    const slider = page.getByLabel('Version du ticket');
    await expect(slider).toHaveValue('3');
    await slider.fill('1');
    await expect(page.getByText(/État reconstitué par rejeu des 1 premiers événements/)).toBeVisible();
    const snapshot = page.locator('.snapshot');
    await expect(snapshot).toContainText('Ouvert');
    await expect(snapshot).toContainText('Moyenne');
    await expect(snapshot.locator('.changed')).toHaveCount(2);
    await page.getByRole('button', { name: 'Revenir au présent' }).click();
    await expect(slider).toHaveValue('3');
  });

  test('E2E-13 palette de commandes (Ctrl+K) : recherche et ouverture d’un ticket', async ({ page }) => {
    const title = uniqueTitle('Palette introuvable ailleurs');
    const id = await createTicket(page, { title });
    await page.goto('/dashboard');
    await page.keyboard.press('Control+k');
    await page.getByLabel('Rechercher', { exact: true }).fill(title);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/tickets/${id}$`));
  });

  test('E2E-14 recherche et vues enregistrées de la liste', async ({ page }) => {
    const title = uniqueTitle('Recherche accentuée Élément');
    await createTicket(page, { title, assignee: 'Yanis Loucif', priority: 'Haute' });
    await page.goto('/tickets');
    await page.getByLabel('Rechercher dans les tickets').fill('element');
    await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
    await page.getByRole('button', { name: /^Mes tickets/ }).click();
    await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
    await page.getByRole('button', { name: /^Non assignés/ }).click();
    await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);
    await page.getByLabel('Rechercher dans les tickets').fill('zzz-aucun-resultat');
    await expect(page.getByText('Aucun ticket ne correspond')).toBeVisible();
  });

  test('E2E-15 changement d’agent : les actions sont attribuées au bon acteur', async ({ page }) => {
    await page.goto('/tickets');
    await page.getByLabel('Agent connecté').selectOption('Sarah Benali');
    const title = uniqueTitle('Attribution');
    await createTicket(page, { title });
    await expect(page.getByText(/Ouvert par Sarah Benali/)).toBeVisible();
    await page.goto('/events');
    await page.getByLabel('Rechercher un ticket').fill(title);
    await expect(page.locator('tbody tr').first()).toContainText('Sarah Benali');
    await page.getByLabel('Agent connecté').selectOption('Yanis Loucif');
  });

  test('E2E-16 journal d’audit : intégrité vérifiée et export CSV', async ({ page }) => {
    await createTicket(page, { title: uniqueTitle('Audit') });
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: 'Journal intègre' })).toBeVisible();
    await expect(page.getByText(/Sceau du journal : [0-9a-f]{64}/)).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^audit-.*\.csv$/);
    const content = await (await file.createReadStream()).toArray();
    expect(Buffer.concat(content).toString('utf8')).toContain('Empreinte SHA-256');
  });

  test('E2E-17 tableau de bord : les indicateurs reflètent les nouveaux tickets', async ({ page }) => {
    await page.goto('/dashboard');
    const kpi = page.locator('.kpi', { hasText: 'Non assignés' }).locator('.kpi-value');
    await expect(kpi).toHaveText(/\d+/);
    const before = Number(await kpi.textContent());
    await createTicket(page, { title: uniqueTitle('KPI') });
    await page.goto('/dashboard');
    await expect(kpi).toHaveText(String(before + 1));
  });

  test('E2E-18 thème sombre mémorisé après rechargement', async ({ page }) => {
    await page.goto('/dashboard');
    const html = page.locator('html');
    const initial = await html.getAttribute('data-theme');
    await page.getByRole('button', { name: 'Changer de thème' }).click();
    const toggled = initial === 'dark' ? 'light' : 'dark';
    await expect(html).toHaveAttribute('data-theme', toggled);
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', toggled);
  });

  test('E2E-19 mobile : aucune barre de défilement horizontale', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/dashboard', '/tickets', '/board', '/events']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `débordement horizontal sur ${path}`).toBeLessThanOrEqual(0);
    }
  });

  test('E2E-20 accessibilité clavier : la liste s’ouvre avec Entrée', async ({ page }) => {
    const title = uniqueTitle('Clavier');
    const id = await createTicket(page, { title });
    await page.goto('/tickets');
    await page.getByRole('row', { name: new RegExp(title) }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/tickets/${id}$`));
  });
});
