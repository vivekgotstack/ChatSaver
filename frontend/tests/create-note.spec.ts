import { test, expect } from '@playwright/test';

test('Verify note creation functionality works correctly', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Import ChatGPT chats' }).click();

    await page.getByRole('textbox', { name: 'ChatGPT shared link' }).fill('https://chatgpt.com/share/6a7af3de-0cc0-83ea-8404-b3b5c21b90c8');

    await page.getByRole('button', { name: 'Read shared chat' }).click();
    await page.getByRole('button', { name: 'Save as editable note' }).click();

    await page.getByRole('button', { name: 'New note Local' }).click();

    await page.getByRole('textbox', { name: 'Question' }).click();
    await page.getByRole('textbox', { name: 'Question' }).fill('What is your goal');
    await expect(page.getByRole('textbox', { name: 'Question' })).toHaveValue('What is your goal');

    await page.getByRole('textbox', { name: 'Answer' }).click();
    await page.getByRole('textbox', { name: 'Answer' }).fill('i dont have any goal right now');
    await expect(page.getByRole('textbox', { name: 'Answer' })).toHaveValue('i dont have any goal right now');
});