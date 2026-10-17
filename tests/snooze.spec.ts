import { test, expect } from '@playwright/test';

const openCase = async (page: import('@playwright/test').Page, id: string) => {
  await page.goto(`/#/case/${id}`);
  await expect(page.locator('#case-title')).toBeVisible();
};

test('follow-up is blocked with a stated reason while a document waits for review', async ({ page }) => {
  await openCase(page, 'RC-10244');
  await expect(page.getByTestId('followup-blocked')).toContainText('waiting for your review');
  await expect(page.locator('#fu-date')).toHaveCount(0);
});

test('follow-up is blocked while a requirement is unrequested', async ({ page }) => {
  await openCase(page, 'RC-10234');
  await expect(page.getByTestId('followup-blocked')).toContainText("hasn't been requested yet");
});

test('follow-up date must be after today and on or before the due date', async ({ page }) => {
  await openCase(page, 'RC-10281'); // due Oct 21, snoozed until Oct 16
  await page.getByTestId('followup-box').getByRole('button', { name: 'Change follow-up date' }).click();
  const date = page.locator('#fu-date');

  await date.fill('2026-10-12');
  await page.getByRole('button', { name: 'Save follow-up date' }).click();
  await expect(page.locator('.error-summary')).toContainText('Choose a date after today');

  await date.fill('2026-10-22');
  await page.getByRole('button', { name: 'Save follow-up date' }).click();
  await expect(page.locator('.error-summary')).toContainText('on or before the due date (Oct 21, 2026)');

  // Error summary links move focus to the field.
  await page.locator('.error-summary a').first().click();
  await expect(date).toBeFocused();

  await date.fill('2026-10-20');
  await page.getByRole('button', { name: 'Save follow-up date' }).click();
  await expect(page.getByTestId('toast')).toContainText(
    'Follow-up date changed from Oct 16, 2026 to Oct 20, 2026. Case status: Waiting on household (snoozed until Oct 20).',
  );
  await expect(page.getByTestId('activity-feed')).toContainText('Follow-up date changed from Oct 16, 2026 to Oct 20, 2026');
});

test('setting a follow-up moves a case from Needs action to Snoozed, and Undo brings it back', async ({ page }) => {
  await openCase(page, 'RC-10672'); // follow-up due today
  await expect(page.getByTestId('next-block')).toContainText('Follow-up date is today');
  await page.getByTestId('followup-box').getByRole('button', { name: 'Change follow-up date' }).click();
  await page.locator('#fu-date').fill('2026-10-19');
  await page.getByRole('button', { name: 'Save follow-up date' }).click();
  await expect(page.getByTestId('case-status').first()).toHaveText(/Waiting on household/);
  await expect(page.getByTestId('next-block')).toContainText('Waiting on the household until Oct 19');

  await page.getByRole('button', { name: /Back to queue/ }).click();
  await page.getByLabel('Search by name or case number').fill('RC-10672');
  await expect(page.getByTestId('empty-search')).toBeVisible();
  await page.getByRole('button', { name: /^Snoozed/ }).click();
  await expect(page.getByTestId('queue-row')).toHaveCount(1);
  await expect(page.getByTestId('queue-row')).toContainText('Snoozed until Oct 19');

  await page.getByTestId('toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('toast')).toContainText('Undone');
  await expect(page.getByTestId('empty-search')).toBeVisible();
  await page.getByRole('button', { name: /^Needs action/ }).click();
  await expect(page.getByTestId('queue-row')).toHaveCount(1);
});

test('a failed save keeps the date and records nothing', async ({ page }) => {
  await openCase(page, 'RC-10281');
  const before = await page.getByTestId('activity-feed').locator('li').count();
  await page.getByRole('checkbox', { name: 'Make the next save fail' }).check();
  await page.getByTestId('followup-box').getByRole('button', { name: 'Change follow-up date' }).click();
  await page.locator('#fu-date').fill('2026-10-19');
  await page.getByRole('button', { name: 'Save follow-up date' }).click();
  await expect(page.getByTestId('not-saved')).toContainText('Nothing was recorded');
  await expect(page.locator('#fu-date')).toHaveValue('2026-10-19');
  await expect(page.getByTestId('activity-feed').locator('li')).toHaveCount(before);
  await expect(page.getByTestId('fail-next')).not.toBeChecked();
  await page.getByRole('button', { name: 'Save follow-up date' }).click();
  await expect(page.getByTestId('toast')).toContainText('snoozed until Oct 19');
});
