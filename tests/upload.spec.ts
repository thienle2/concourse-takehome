// Attaching files when logging a document received outside the workspace.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { MAX_FILE_BYTES, validateFiles } from '../src/lib/attachments';

const pdf = { name: 'pay-stub-sept.pdf', mimeType: 'application/pdf', buffer: readFileSync(new URL('../public/sample-application.pdf', import.meta.url)) };
// 1x1 PNG
const png = {
  name: 'pay-stub-photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
};

async function openReceive(page: Page) {
  await page.goto('/#/case/RC-10231'); // income was requested Oct 2
  await page.getByTestId('req-inc').getByRole('button', { name: 'Log as received' }).click();
  return page.getByTestId('receive-form-inc');
}

test('validateFiles: type, size and count', () => {
  expect(validateFiles([{ name: 'a.pdf', type: 'application/pdf', size: 1000 }])).toBe('');
  expect(validateFiles([{ name: 'notes.txt', type: 'text/plain', size: 10 }])).toBe("notes.txt isn't a PDF, JPG or PNG. Choose a different file.");
  expect(validateFiles([{ name: 'big.pdf', type: 'application/pdf', size: MAX_FILE_BYTES + 1 }])).toMatch(/big\.pdf \(10\.0 MB\) is over the 10\.0 MB limit/);
  expect(validateFiles(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.pdf`, type: 'application/pdf', size: 1 })))).toMatch(/up to 5 files/);
});

test('worker attaches files when logging a document as received', async ({ page }) => {
  const form = await openReceive(page);
  await form.locator('input[type=file]').setInputFiles([pdf, png]);
  await expect(form.getByRole('list', { name: 'Files to attach' })).toContainText('pay-stub-sept.pdf');
  await expect(form.getByRole('list', { name: 'Files to attach' })).toContainText('pay-stub-photo.png');
  await form.getByRole('button', { name: 'Remove pay-stub-photo.png' }).click();
  await expect(form.getByRole('list', { name: 'Files to attach' }).locator('li')).toHaveCount(1);

  await form.getByLabel(/How did the pay statement arrive/).selectOption('In person');
  await form.getByRole('button', { name: 'Log as received' }).click();

  await expect(page.getByTestId('toast')).toContainText('Pay statement logged as received with 1 file attached. Requirement: Received, needs review. Case status: Ready to review.');
  await expect(page.getByTestId('req-inc')).toContainText('1 file attached');
  await expect(page.getByTestId('activity-feed')).toContainText('Pay statement logged as received (in person). 1 file attached: pay-stub-sept.pdf');

  await page.getByTestId('req-inc').getByRole('button', { name: 'Review document' }).click();
  const attached = page.getByTestId('popout').getByTestId('attached-files');
  await expect(attached).toContainText('pay-stub-sept.pdf');
  await expect(attached.locator('iframe')).toHaveAttribute('src', /^blob:/);
  await expect(attached.getByRole('link', { name: /Open/ })).toHaveAttribute('target', '_blank');
});

test('a file of the wrong type is refused and nothing is saved', async ({ page }) => {
  const form = await openReceive(page);
  await form.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(form).toContainText("notes.txt isn't a PDF, JPG or PNG.");
  await form.getByRole('button', { name: 'Log as received' }).click();
  await expect(page.getByTestId('toast')).toHaveCount(0);
  await expect(page.getByTestId('req-inc')).toContainText('Requested, awaiting household');
});

test('a failed save keeps the chosen files', async ({ page }) => {
  const form = await openReceive(page);
  await page.getByRole('checkbox', { name: 'Make the next save fail' }).check();
  await form.locator('input[type=file]').setInputFiles(pdf);
  await form.getByRole('button', { name: 'Log as received' }).click();
  await expect(form.getByTestId('not-saved')).toContainText('Nothing was recorded');
  await expect(form.getByRole('list', { name: 'Files to attach' })).toContainText('pay-stub-sept.pdf');
  await form.getByRole('button', { name: 'Log as received' }).click();
  await expect(page.getByTestId('req-inc')).toContainText('1 file attached');
});
