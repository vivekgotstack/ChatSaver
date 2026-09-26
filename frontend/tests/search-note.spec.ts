import { test, expect } from '@playwright/test';
import { createQaNote } from './helpers/notes';

test('Verify note search functionality works correctly', async ({ page }) => {
  await createQaNote(page, 'Who are you?', 'Who are you?', 'I am a human being.');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('button', { name: /^Q&A note/ }).click();
  await page.getByRole('textbox', { name: 'Note title', exact: true }).fill('Another topic');
  await page.getByRole('textbox', { name: 'Note title', exact: true }).blur();
  await expect(page.getByRole('button', { name: 'Another topic', exact: true })).toBeVisible();
  await page.getByPlaceholder('Search files', { exact: true }).fill('Who are you?');
  const matchingNote = page.getByRole('button', { name: 'Who are you?', exact: true });
  await expect(matchingNote).toBeVisible();
  await expect(page.getByRole('button', { name: 'Another topic', exact: true })).toHaveCount(0);
  await matchingNote.click();
  await expect(page.getByRole('textbox', { name: 'Note title', exact: true })).toHaveValue('Who are you?');
  await expect(page).toHaveURL(/\/$/);
});
