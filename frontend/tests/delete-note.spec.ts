import { test, expect } from '@playwright/test';

test('Verify note deletion functionality works correctly', async ({ page }) => {

  // Navigate to the application and import a shared ChatGPT chat, then save it as an editable note

  await page.goto('/');
  await page.getByRole('button', { name: 'Import ChatGPT chats' }).click();
  await page.getByRole('textbox', { name: 'ChatGPT shared link' }).fill('https://chatgpt.com/share/6a7af3de-0cc0-83ea-8404-b3b5c21b90c8');

  await page.getByRole('button', { name: 'Read shared chat' }).click();
  await page.getByRole('button', { name: 'Save as editable note' }).click();

  // Click on the "New note Local" button and fill in the question and answer fields

  await page.getByRole('button', { name: 'New note Local' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Who are you?');

  await page.getByRole('textbox', { name: 'Question' }).click();
  await page.getByRole('textbox', { name: 'Question' }).fill('What is your name?');

  await page.getByRole('textbox', { name: 'Answer' }).click();
  await page.getByRole('textbox', { name: 'Answer' }).fill('My name is Playwright.');


  // Click on the "Delete note" button and confirm the deletion

  await page.getByRole('button', { name: 'Delete note' }).click();
  await page.getByRole('button', { name: 'Delete note' }).click();
  await page.getByRole('button', { name: 'All notes' }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).not.toHaveValue('Who are you?');

});