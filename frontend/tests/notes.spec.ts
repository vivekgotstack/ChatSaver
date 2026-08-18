import { test, expect } from '@playwright/test';

test('Verify import ChatGPT shared chat and save as editable note functionality works correctly', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Import ChatGPT chats' }).click();

  await page
    .getByRole('textbox', { name: 'ChatGPT shared link' })
    .fill('https://chatgpt.com/share/6a7af3de-0cc0-83ea-8404-b3b5c21b90c8');

  await page.getByRole('button', { name: 'Read shared chat' }).click();

  await page.getByRole('button', { name: 'Save as editable note' }).click();

  await expect(page.getByRole('button', { name: 'New chat' })).toBeVisible();
});