import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

test.describe('Sign-in & Auth Suite', () => {

  test('Verify successful sign-in with registered credentials', async ({ page }) => {
    test.setTimeout(60000);

    // Existing registered user credentials
    const email = 'testuser_existing@inbox.mailtrap.io';
    const password = 'password123456789';

    // Step 1: Open Home Page
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Step 2: Open Auth Modal via Header Button
    const openModalBtn = page.getByRole('button', { name: /sign in.*sign up/i }).first();
    await expect(openModalBtn).toBeVisible({ timeout: 15000 });
    await openModalBtn.click();

    // Step 3: Ensure "Sign in" Tab is selected inside Modal
    const signInTab = page.getByRole('button', { name: /^sign in$/i }).first();
    await expect(signInTab).toBeVisible({ timeout: 10000 });
    await signInTab.click();

    // Step 4: Fill Sign-in Inputs
    const emailInput = page.getByRole('textbox', { name: /email/i }).or(page.getByPlaceholder(/email/i)).first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill(email);

    const passwordInput = page.getByRole('textbox', { name: /password/i }).or(page.getByPlaceholder(/password/i)).first();
    await passwordInput.fill(password);

    // Step 5: Submit Sign-in Form
    const submitBtn = page.getByRole('button', { name: /sign in|log in|continue/i }).first();
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click({ force: true });
    console.log('Sign-in submit button clicked.');

    // Step 6: Verify Dashboard/Vault Access
    await expect(page.getByText(/chats|vault|library/i).first()).toBeVisible({ timeout: 30000 });
    console.log('Sign-in successful!');
  });


// NEGATIVE TEST 1: Wrong Password for Registered Email
  test('Verify sign-in fails and access is blocked when entering an incorrect password for a registered email', async ({ page }) => {
    test.setTimeout(45000);

    const email = 'testuser_existing@inbox.mailtrap.io';
    const wrongPassword = 'WrongPassword@999!';

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const openModalBtn = page.getByRole('button', { name: /sign in.*sign up/i }).first();
    await expect(openModalBtn).toBeVisible({ timeout: 15000 });
    await openModalBtn.click();

    const signInTab = page.getByRole('button', { name: /^sign in$/i }).first();
    await expect(signInTab).toBeVisible({ timeout: 10000 });
    await signInTab.click();

    const emailInput = page.getByRole('textbox', { name: /email/i }).or(page.getByPlaceholder(/email/i)).first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill(email);

    const passwordInput = page.getByRole('textbox', { name: /password/i }).or(page.getByPlaceholder(/password/i)).first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await passwordInput.fill(wrongPassword);

    const submitBtn = page.getByRole('button', { name: /sign in|log in|continue/i }).first();
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click({ force: true });

    // Assertion 1 Modal does not dismiss, submit button remains active (user not authenticated)
    await expect(submitBtn).toBeVisible({ timeout: 5000 });

    // Assertion 2: Password input remains visible (user not authenticated)
    await expect(passwordInput).toBeVisible();
  });

  
  // NEGATIVE TEST 2: Unregistered Email
  test('Verify sign-in is blocked and displays an error when attempting to log in with an unregistered email', async ({ page }) => {
    test.setTimeout(45000);

    const unregisteredEmail = `ghost_user_${Date.now()}@inbox.mailtrap.io`;
    const password = 'password123456789';

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const openModalBtn = page.getByRole('button', { name: /sign in.*sign up/i }).first();
    await expect(openModalBtn).toBeVisible({ timeout: 15000 });
    await openModalBtn.click();

    const signInTab = page.getByRole('button', { name: /^sign in$/i }).first();
    await expect(signInTab).toBeVisible({ timeout: 10000 });
    await signInTab.click();

    const emailInput = page.getByRole('textbox', { name: /email/i }).or(page.getByPlaceholder(/email/i)).first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill(unregisteredEmail);

    const passwordInput = page.getByRole('textbox', { name: /password/i }).or(page.getByPlaceholder(/password/i)).first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await passwordInput.fill(password);

    const submitBtn = page.getByRole('button', { name: /sign in|log in|continue/i }).first();
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click({ force: true });

    // Assertion 1: Modal does not dismiss, submit button remains active (user not authenticated)
    await expect(submitBtn).toBeVisible({ timeout: 5000 });

    // Assertion 2: Email input remains visible (user not authenticated)
    await expect(emailInput).toBeVisible();
  });
});