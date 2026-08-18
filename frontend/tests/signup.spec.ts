import { test, expect, APIRequestContext } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface MailtrapMessage {
  id: number;
  to_email: string;
  subject: string;
}

/**
 * Robust Mailtrap Sandbox OTP Fetcher
 */
async function getOTPFromMailtrap(
  request: APIRequestContext,
  userEmail: string,
  timeoutMs: number = 45000
): Promise<string> {
  const apiToken = process.env.MAILTRAP_API_TOKEN;
  const inboxId = process.env.MAILTRAP_INBOX_ID;

  if (!apiToken || !inboxId) {
    throw new Error('MAILTRAP_API_TOKEN or MAILTRAP_INBOX_ID is missing from .env.local');
  }

  const startTime = Date.now();
  const pollInterval = 3000;

  console.log(`Polling Mailtrap Sandbox (Inbox: ${inboxId}) for email sent to: ${userEmail}...`);

  while (Date.now() - startTime < timeoutMs) {
    // 1. Fetch message list from inbox
    const response = await request.get(
      `https://mailtrap.io/api/inboxes/${inboxId}/messages`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Api-Token': apiToken,
          'Accept': 'application/json',
        },
      }
    );

    if (response.ok()) {
      const messages: MailtrapMessage[] = await response.json();
      console.log(`[DEBUG] API returned ${messages ? messages.length : 0} messages in Inbox.`);

      if (messages && messages.length > 0) {
        // Target specifically matching email recipient or latest message
        const matchedMessage =
          messages.find((m) => m.to_email && m.to_email.toLowerCase() === userEmail.toLowerCase()) ||
          messages[0];

        if (matchedMessage) {
          console.log(`[DEBUG] Processing message ID: ${matchedMessage.id}, Subject: "${matchedMessage.subject}"`);

          // 2. Fetch Text Body
          let emailContent = '';
          const textRes = await request.get(
            `https://mailtrap.io/api/inboxes/${inboxId}/messages/${matchedMessage.id}/body.txt`,
            {
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Api-Token': apiToken,
              },
            }
          );

          if (textRes.ok()) {
            emailContent = await textRes.text();
          }

          // 3. Fetch HTML Body fallback
          if (!emailContent || emailContent.trim() === '') {
            const htmlRes = await request.get(
              `https://mailtrap.io/api/inboxes/${inboxId}/messages/${matchedMessage.id}/body.html`,
              {
                headers: {
                  'Authorization': `Bearer ${apiToken}`,
                  'Api-Token': apiToken,
                },
              }
            );
            if (htmlRes.ok()) {
              emailContent = await htmlRes.text();
            }
          }

          // 4. Extract OTP
          const cleanContent = emailContent.replace(/<[^>]*>/g, ' ');
          const otpMatch = cleanContent.match(/\b\d{6}\b/);

          if (otpMatch) {
            console.log(`[DEBUG] OTP Extracted Successfully: ${otpMatch[0]}`);
            return otpMatch[0];
          } else {
            console.warn(`[DEBUG] Email body found, but no 6-digit numeric OTP regex match. Preview: ${cleanContent.substring(0, 100)}`);
          }
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timeout: OTP email not received for ${userEmail} within ${timeoutMs / 1000} seconds.`);
}

test.describe('Signup & Auth Suite', () => {

  test('Verify successful signup with valid credentials and OTP verification', async ({ page, request }) => {
    test.setTimeout(60000);

    const randomTag = Date.now();
    const email = `testuser_${randomTag}@inbox.mailtrap.io`;
    const password = 'password123456789';
    const displayName = 'Playwright Test User';

    console.log(`Test Email generated: ${email}`);

    // Step 1: Open Home Page
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Step 2: Open Auth Modal via Header Button
    const openModalBtn = page.getByRole('button', { name: /sign in.*sign up/i }).first();
    await expect(openModalBtn).toBeVisible({ timeout: 15000 });
    await openModalBtn.click();

    // Step 3: Switch to "Sign up" Tab inside Modal
    const signUpTab = page.getByRole('button', { name: /^sign up$/i }).first();
    await expect(signUpTab).toBeVisible({ timeout: 10000 });
    await signUpTab.click();

    // Step 4: Fill Signup Inputs
    const nameInput = page.getByRole('textbox', { name: /display name/i }).or(page.getByPlaceholder(/display name/i)).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill(displayName);

    const emailInput = page.getByRole('textbox', { name: /email/i }).or(page.getByPlaceholder(/email/i)).first();
    await emailInput.fill(email);

    const passwordInput = page.getByRole('textbox', { name: /password/i }).or(page.getByPlaceholder(/password/i)).first();
    await passwordInput.fill(password);

    // Step 5: Submit Form ("Email me a code" Button)
    const submitBtn = page.getByRole('button', { name: /email me a code/i }).first();
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click({ force: true });
    console.log('"Email me a code" button clicked successfully.');

    // Step 6: OTP Fetching via Mailtrap Sandbox API
    const otp = await getOTPFromMailtrap(request, email, 45000);
    console.log(`OTP received successfully: ${otp}`);

    // Step 7: Enter OTP
    const otpInput = page.getByRole('textbox').first();
    await expect(otpInput).toBeVisible({ timeout: 15000 });
    await otpInput.pressSequentially(otp, { delay: 100 });

    // Step 8: Verify / Submit OTP
    const verifyButton = page.getByRole('button', { name: /verify|confirm|continue|complete|submit/i }).first();
    await expect(verifyButton).toBeVisible({ timeout: 10000 });
    await verifyButton.click({ force: true });

    // Step 9: Final Assertion
    await expect(page.getByText(/chats|vault|library/i).first()).toBeVisible({ timeout: 30000 });
    console.log('Signup and OTP verification successful!');
  });


  // NEGATIVE TEST 1: Invalid Email Format
  test('Verify signup validation fails and blocks submission when entering an invalid email format', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const openModalBtn = page.getByRole('button', { name: /sign in.*sign up/i }).first();
    await expect(openModalBtn).toBeVisible({ timeout: 15000 });
    await openModalBtn.click();

    const signUpTab = page.getByRole('button', { name: /^sign up$/i }).first();
    await expect(signUpTab).toBeVisible({ timeout: 10000 });
    await signUpTab.click();

    const nameInput = page.getByRole('textbox', { name: /display name/i }).or(page.getByPlaceholder(/display name/i)).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill('Invalid Email User');

    const emailInput = page.getByRole('textbox', { name: /email/i }).or(page.getByPlaceholder(/email/i)).first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    
    await emailInput.fill('plainaddress_without_at_symbol');

    const passwordInput = page.getByRole('textbox', { name: /password/i }).or(page.getByPlaceholder(/password/i)).first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await passwordInput.fill('password123456789');

    const submitBtn = page.getByRole('button', { name: /email me a code/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();

    // Assertion 1: HTML5 Native validation triggers (Field marked invalid)
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.checkValidity());
    expect(isInvalid).toBe(true);

    // Assertion 2: Form submit button stays on screen (No navigation / No OTP screen)
    await expect(submitBtn).toBeVisible({ timeout: 3000 });
    await expect(nameInput).toBeVisible();
  });

  // NEGATIVE TEST 2: Short Password (< 12 characters)
  test('Verify signup is blocked and triggers validation error when entering a password under minimum length requirements', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const openModalBtn = page.getByRole('button', { name: /sign in.*sign up/i }).first();
    await expect(openModalBtn).toBeVisible({ timeout: 15000 });
    await openModalBtn.click();

    const signUpTab = page.getByRole('button', { name: /^sign up$/i }).first();
    await expect(signUpTab).toBeVisible({ timeout: 10000 });
    await signUpTab.click();

    const nameInput = page.getByRole('textbox', { name: /display name/i }).or(page.getByPlaceholder(/display name/i)).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill('Short Pass User');

    const emailInput = page.getByRole('textbox', { name: /email/i }).or(page.getByPlaceholder(/email/i)).first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill(`shortpass_${Date.now()}@inbox.mailtrap.io`);

    const passwordInput = page.getByRole('textbox', { name: /password/i }).or(page.getByPlaceholder(/password/i)).first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await passwordInput.fill('12345'); // Under 12 characters

    const submitBtn = page.getByRole('button', { name: /email me a code/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();

    // Assertion: Form does not proceed to OTP screen
    await expect(submitBtn).toBeVisible({ timeout: 3000 });
    const otpInput = page.getByRole('textbox', { name: /otp|code|verification/i });
    await expect(otpInput).not.toBeVisible();
  });


});