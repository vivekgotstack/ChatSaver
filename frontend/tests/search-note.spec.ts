import { test, expect } from '@playwright/test';

test('Verify note search functionality works correctly', async ({ page }) => {
    // Navigate to the application and import a shared ChatGPT chat, then save it as an editable note

  await page.goto('/');
  await page.getByRole('button', { name: 'Import ChatGPT chats' }).click();
  await page.getByRole('textbox', { name: 'ChatGPT shared link' }).fill('https://chatgpt.com/share/6a7af3de-0cc0-83ea-8404-b3b5c21b90c8');

  await page.getByRole('button', { name: 'Read shared chat' }).click();
  await page.getByRole('button', { name: 'Save as editable note' }).click();

  // Click on the "New note Local" button and fill in the question and answer fields
  await page.getByRole('button', { name: 'New note Local' }).click();
  await page.getByRole('button', { name: 'Q&A note' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Who are you?');

  await page.getByRole('textbox', { name: 'Question' }).click();
  await page.getByRole('textbox', { name: 'Question' }).fill('Who are you?');
  await page.getByRole('textbox', { name: 'Answer' }).click();
  await page.getByRole('textbox', { name: 'Answer' }).fill('I am a human being.');

  // Click on the search box and search for the note by its title
  await page.getByRole('searchbox', { name: 'Ctrl K' }).click();
  await page.getByRole('searchbox', { name: 'Ctrl K' }).fill('Who are you?');
  await expect(page.getByRole('button', { name: 'Who are you? 1 blocks Manual' })).toBeVisible();

  // Click on the note in the search results and verify that it opens correctly
  await page.getByRole('searchbox', { name: 'Ctrl K' }).press('Enter');
  await page.getByRole('button', { name: 'Who are you? 1 blocks Manual' }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Who are you?');
  
});
