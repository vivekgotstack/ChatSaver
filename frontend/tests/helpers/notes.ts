import { expect, type Page } from '@playwright/test';

export async function createQaNote(page: Page, title: string, question: string, answer: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a blank note', exact: true }).click();
  await page.getByRole('button', { name: /^Q&A note/ }).click();
  await page.getByRole('textbox', { name: 'Note title', exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'Question', exact: true }).fill(question);
  await page.getByRole('textbox', { name: 'Answer', exact: true }).fill(answer);
  await page.getByRole('textbox', { name: 'Answer', exact: true }).blur();
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
}

export async function expectNoteAfterReload(page: Page, title: string, question: string, answer: string) {
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note title', exact: true })).toHaveValue(title);
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Question', exact: true })).toHaveValue(question);
  await expect(page.getByRole('textbox', { name: 'Answer', exact: true })).toHaveValue(answer);
  await expect(page).toHaveURL(/\/$/);
}
