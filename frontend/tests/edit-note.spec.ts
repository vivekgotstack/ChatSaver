import { test, expect } from '@playwright/test';

test('Verify note editing functionality works correctly', async ({ page }) => {
    // Navigate to the application
  await page.goto('/');

  // Click on the "Import ChatGPT chats" button
  await page.getByRole('button', { name: 'Import ChatGPT chats' }).click();
  await page.getByRole('textbox', { name: 'ChatGPT shared link' }).fill('https://chatgpt.com/share/6a7af3de-0cc0-83ea-8404-b3b5c21b90c8');
  await page.getByRole('button', { name: 'Read shared chat' }).click();
  await page.getByRole('button', { name: 'Save as editable note' }).click();

    // Click on the "New note Local" button and fill in the question field
  await page.getByRole('button', { name: 'New note Local' }).click();
  await page.getByRole('textbox', { name: 'Question' }).click();
  await page.getByRole('textbox', { name: 'Question' }).fill('What is playwright?');

  await expect(page.getByRole('textbox', { name: 'Question' })).toHaveValue('What is playwright?');

  // Fill in the answer field
  await page.getByRole('textbox', { name: 'Answer' }).click();
  await page.getByRole('textbox', { name: 'Answer' }).fill('Playwright is an automation tool used for testing.');

  await expect(page.getByRole('textbox', { name: 'Answer' })).toHaveValue('Playwright is an automation tool used for testing.');  

    // Fill in the note title field
  await page.getByRole('textbox', { name: 'Note title' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('What is Playwright?');

  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('What is Playwright?');

  // Edit the question and answer fields
  await page.getByRole('textbox', { name: 'Question' }).click();
  await page.getByRole('textbox', { name: 'Question' }).fill('Why Playwright is used for?');

  await expect(page.getByRole('textbox', { name: 'Question' })).toHaveValue('Why Playwright is used for?');

  await page.getByRole('textbox', { name: 'Answer' }).click();
  await page.getByRole('textbox', { name: 'Answer' }).press('ControlOrMeta+a');
  await page.getByRole('textbox', { name: 'Answer' }).fill('Playwright is used for automation testing.');

  await expect(page.getByRole('textbox', { name: 'Answer' })).toHaveValue('Playwright is used for automation testing.');

    // Edit the note title field
  await page.getByRole('textbox', { name: 'Note title' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Why we use playwright?');

  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Why we use playwright?');

});