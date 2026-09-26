import { test } from '@playwright/test';
import { createQaNote, expectNoteAfterReload } from './helpers/notes';

test('Verify note editing functionality works correctly', async ({ page }) => {
  await createQaNote(page, 'What is Playwright?', 'What is Playwright?', 'A browser testing tool.');
  await page.getByRole('textbox', { name: 'Question', exact: true }).fill('Why use Playwright?');
  await page.getByRole('textbox', { name: 'Answer', exact: true }).fill('To verify real browser workflows.');
  await page.getByRole('textbox', { name: 'Note title', exact: true }).fill('Why we use Playwright');
  await page.getByRole('textbox', { name: 'Note title', exact: true }).blur();
  await expectNoteAfterReload(page, 'Why we use Playwright', 'Why use Playwright?', 'To verify real browser workflows.');
});
