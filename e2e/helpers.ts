import { expect, type Page } from '@playwright/test';

let counter = 0;
/** Titre unique par test (le journal est partagé entre les tests d'une même exécution). */
export const uniqueTitle = (label: string) => `${label} #${Date.now().toString(36)}${++counter}`;

export type NewTicket = {
  title: string;
  description?: string;
  priority?: 'Basse' | 'Moyenne' | 'Haute';
  category?: string;
  assignee?: string;
  tags?: string[];
};

/** Crée un ticket via l'interface (raccourci N) et attend l'arrivée sur sa fiche. */
export const createTicket = async (page: Page, t: NewTicket) => {
  await page.goto('/tickets');
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'Nouveau ticket' });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/imprimante/i).fill(t.title);
  if (t.description) await dialog.getByPlaceholder(/symptômes/i).fill(t.description);
  if (t.priority) await dialog.getByRole('button', { name: new RegExp(t.priority) }).click();
  if (t.category) await dialog.getByLabel('Catégorie').selectOption({ label: t.category });
  if (t.assignee) await dialog.getByLabel('Assigner à').selectOption({ label: t.assignee });
  for (const tag of t.tags ?? []) {
    await dialog.getByPlaceholder(/étiquette/i).fill(tag);
    await dialog.getByPlaceholder(/étiquette/i).press('Enter');
  }
  await dialog.getByRole('button', { name: 'Créer le ticket' }).click();
  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel('Titre du ticket')).toHaveValue(t.title);
  return page.url().split('/').pop()!;
};

export const toast = (page: Page, text: string | RegExp) => page.locator('.toast').filter({ hasText: text });
