import { test, expect } from '@playwright/test';
import { createQaNote } from './helpers/notes';

test('Verify note deletion functionality works correctly', async ({ page }) => {
  await createQaNote(page, 'Delete this note', 'What is your name?', 'My name is Playwright.');
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start a blank note', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start a blank note', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete this note', exact: true })).toHaveCount(0);
});
