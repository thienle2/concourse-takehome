import { test, expect, type Page } from '@playwright/test';

const openCase = async (page: Page, id: string) => {
  await page.goto(`/#/case/${id}`);
  await expect(page.locator('#case-title')).toBeVisible();
};

test('verify a document with a mismatch: confirmations, note, toast, history, undo', async ({ page }) => {
  await openCase(page, 'RC-10275'); // income received; pay statement name is misspelled
  await expect(page.getByTestId('case-status').first()).toHaveText(/Ready to review/);

  await page.getByTestId('req-inc').getByRole('button', { name: 'Review document' }).click();
  const pop = page.getByTestId('popout');
  await expect(pop).toBeVisible();
  // Split screen: case panel stays and highlights the open requirement.
  await expect(page.getByTestId('case-panel')).toBeVisible();
  await expect(page.getByTestId('req-inc')).toHaveAttribute('aria-current', 'true');
  await expect(pop.getByTestId('compare')).toContainText('Does not match verified record');
  await expect(pop.getByTestId('compare')).toContainText('Verified from photo ID');
  await expect(pop.getByTestId('compare')).toContainText('Self-reported on application');
  await expect(pop.getByTestId('trust-summary')).toContainText('Monthly income is only self-reported');
  await expect(pop.getByTestId('compare')).toContainText('Tyrone Bassett');

  await pop.getByRole('button', { name: 'Mark verified' }).click();
  const summary = pop.locator('.error-summary');
  await expect(summary.locator('li')).toHaveCount(4);
  await expect(summary).toContainText('does not match');

  await summary.locator('a').first().click();
  await expect(pop.locator('#confirm-0')).toBeFocused();

  for (const i of [0, 1, 2]) await pop.locator(`#confirm-${i}`).check();
  await pop.getByRole('button', { name: 'Mark verified' }).click();
  await expect(summary.locator('li')).toHaveCount(1);

  await pop.getByLabel(/Note \(required/).fill('Employer misspelled the surname; SSN and address match.');
  await pop.getByRole('button', { name: 'Mark verified' }).click();

  await expect(pop).toHaveCount(0);
  await expect(page.getByTestId('toast')).toHaveText(/Income marked verified\. Requirement: Verified\. Case status: All verified\./);
  await expect(page.getByTestId('req-inc')).toContainText('Verified');
  await expect(page.getByTestId('case-status').first()).toHaveText(/All verified/);
  await expect(page.getByTestId('activity-feed').locator('li').first()).toContainText('Income verified (pay statement). Note: Employer misspelled');
  await expect(page.getByTestId('next-block')).toContainText('Mark ready for decision');

  await page.getByTestId('toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('case-status').first()).toHaveText(/Ready to review/);
  await expect(page.getByTestId('req-inc')).toContainText('Received, needs review');
  await expect(page.getByTestId('activity-feed').locator('li').first()).toContainText('Undid: Income marked verified');
});

test('verify without a mismatch does not require a note', async ({ page }) => {
  await openCase(page, 'RC-10555');
  await page.getByTestId('req-id').getByRole('button', { name: 'Review document' }).click();
  const pop = page.getByTestId('popout');
  await expect(pop.getByTestId('compare')).not.toContainText('Does not match');
  for (const i of [0, 1, 2]) await pop.locator(`#confirm-${i}`).check();
  await pop.getByRole('button', { name: 'Mark verified' }).click();
  await expect(page.getByTestId('toast')).toContainText('Case status: All verified.');
});

test('failed verify keeps confirmations and note, records nothing', async ({ page }) => {
  await openCase(page, 'RC-10555');
  await page.getByTestId('fail-next').check();
  await page.getByTestId('req-id').getByRole('button', { name: 'Review document' }).click();
  const pop = page.getByTestId('popout');
  for (const i of [0, 1, 2]) await pop.locator(`#confirm-${i}`).check();
  await pop.getByLabel('Note (optional)').fill('Looks good');
  await pop.getByRole('button', { name: 'Mark verified' }).click();
  await expect(pop.getByTestId('not-saved')).toContainText('Nothing was recorded');
  await expect(pop.locator('#confirm-2')).toBeChecked();
  await expect(pop.getByLabel('Note (optional)')).toHaveValue('Looks good');
  await expect(page.getByTestId('req-id')).toContainText('Received, needs review');
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('reject asks for a reason and records a request for a new copy', async ({ page }) => {
  await openCase(page, 'RC-10694');
  await page.getByTestId('req-inc').getByRole('button', { name: 'Review document' }).click();
  const pop = page.getByTestId('popout');
  await pop.getByRole('button', { name: 'Reject document' }).click();
  await pop.getByRole('button', { name: 'Reject and record request' }).click();
  await expect(pop.locator('.error-summary li')).toHaveCount(2);
  await pop.getByLabel('Reason').selectOption('Out of date');
  await pop.getByLabel('Portal message').check();
  await pop.getByRole('button', { name: 'Reject and record request' }).click();
  await expect(page.getByTestId('toast')).toContainText('Pay statement rejected and a new copy requested by portal message. Nothing was actually sent.');
  await expect(page.getByTestId('req-inc')).toContainText('Requested Oct 12 by portal message');
});

test('notes over 500 characters show an inline error and keep the text', async ({ page }) => {
  await openCase(page, 'RC-10275');
  const long = 'x'.repeat(520);
  await page.getByLabel('Add a note').fill(long);
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#note-text-error')).toContainText('500 characters at most');
  await expect(page.getByLabel('Add a note')).toHaveValue(long);
});

test('locked and decided cases are read-only with the reason stated', async ({ page }) => {
  await openCase(page, 'RC-10304');
  await expect(page.getByText('M. Okafor has this case open').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review document' })).toHaveCount(0);
  await expect(page.getByLabel('Add a note')).toHaveCount(0);
  await openCase(page, 'RC-10198');
  await expect(page.getByText('A decision has been recorded').first()).toBeVisible();
});
