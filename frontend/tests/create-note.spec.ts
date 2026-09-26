import { test } from '@playwright/test';
import { createQaNote, expectNoteAfterReload } from './helpers/notes';

test('Verify note creation functionality works correctly', async ({ page }) => {
  await createQaNote(page, 'My goals', 'What is your goal?', 'Build a reliable knowledge workspace.');
  await expectNoteAfterReload(page, 'My goals', 'What is your goal?', 'Build a reliable knowledge workspace.');
});
