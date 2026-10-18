// Correcting case facts: from a mismatched comparison row, or from the household card.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { applyAction } from '../src/lib/actions';
import { parseAddress } from '../src/lib/address';
import { buildDocument, trustSummary } from '../src/lib/documents';
import { validateFact, verifiedWarning } from '../src/lib/facts';
import { normalizeCase, type Case } from '../src/lib/types';

const allCases: Case[] = JSON.parse(readFileSync(new URL('../public/cases.json', import.meta.url), 'utf8')).map(normalizeCase);
const byId = (id: string) => allCases.find((c) => c.id === id)!;

test.describe('rules', () => {
  test('validates and normalizes values', () => {
    expect(validateFact('phone', '555.555.0199')).toEqual({ value: '(555) 555-0199', error: '' });
    expect(validateFact('phone', '')).toEqual({ value: null, error: '' });
    expect(validateFact('phone', '12345').error).toMatch(/10-digit/);
    expect(validateFact('hh', '0').error).toMatch(/between 1 and 20/);
    expect(validateFact('hh', '2.5').error).toMatch(/whole number/);
    expect(validateFact('income', '$2,640')).toEqual({ value: '2640', error: '' });
    expect(validateFact('income', 'lots').error).toMatch(/monthly amount/);
    expect(validateFact('name', '  ').error).toMatch(/name/);
  });

  test('an update keeps the old value, source and reason, and confirms the case status', () => {
    const c = byId('RC-10275');
    const { next, message } = applyAction(c, {
      type: 'updateFacts',
      changes: [{ field: 'name', value: 'Tyrone Bassett' }, { field: 'lang', value: 'English' }],
      source: 'Pay statement received Oct 10',
      reason: 'Household confirmed spelling by phone',
    });
    expect(next.name).toBe('Tyrone Bassett');
    expect(next.edits).toEqual([
      { field: 'name', from: 'Tyrone Basset', to: 'Tyrone Bassett', d: '2026-10-12', by: 'You', source: 'Pay statement received Oct 10', reason: 'Household confirmed spelling by phone' },
    ]); // language didn't change, so it isn't recorded
    expect(message).toBe('Case record updated: head of household name from Tyrone Basset to Tyrone Bassett. Case status: Ready to review.');
    expect(next.ev.at(-1)!.text).toBe(
      'Case record updated (Pay statement received Oct 10): head of household name from Tyrone Basset to Tyrone Bassett. Note: Household confirmed spelling by phone',
    );
  });

  test('a corrected value is marked as updated, never as verified', () => {
    const c = byId('RC-10275'); // identity verified, so the name was "verified" before
    expect(verifiedWarning(c, 'name')).toMatch(/verified from the photo ID/);
    expect(verifiedWarning(c, 'phone')).toBeNull();
    const { next } = applyAction(c, { type: 'updateFacts', changes: [{ field: 'name', value: 'Tyrone Bassett' }], source: 'Pay statement received Oct 10', reason: 'x' });
    const doc = buildDocument(next, 'inc');
    const row = doc.compare.find((r) => r.label === 'Name')!;
    expect(row.result).toBe('match');
    expect(row.source).toEqual({ trust: 'updated', label: 'Updated Oct 12 by you · Pay statement received Oct 10' });
    expect(trustSummary(doc)).toMatch(/not verified \(self-reported or updated by you\)/);
  });

  test('changing the street keeps the placeholder ZIP consistent', () => {
    const { next } = applyAction(byId('RC-10252'), { type: 'updateFacts', changes: [{ field: 'street', value: '77 Ferris Ln, Unit A' }], source: 'Lease', reason: 'x' });
    expect(next.address).toEqual(parseAddress('77 Ferris Ln, Unit A, Alder Falls'));
  });
});

async function openPayStatement(page: Page) {
  await page.goto('/#/case/RC-10275');
  await page.getByTestId('req-inc').getByRole('button', { name: 'Review document' }).click();
  return page.getByTestId('popout');
}

test('edit a mismatched value right in the comparison row, then verify without a mismatch note', async ({ page }) => {
  const pop = await openPayStatement(page);
  const compare = pop.getByTestId('compare');
  await compare.getByRole('button', { name: 'Edit name on the case' }).click();
  const editor = pop.getByTestId('fact-editor-name');
  // Pre-filled with what the document says.
  await expect(editor.getByLabel('New head of household name')).toHaveValue('Tyrone Bassett');
  await expect(editor).toContainText('Case has Tyrone Basset · document shows Tyrone Bassett');
  await expect(editor).toContainText('verified from the photo ID');

  await editor.getByRole('button', { name: 'Save to case' }).click();
  await expect(editor).toContainText('Add a short reason for the change.');
  await expect(editor.getByLabel('Reason (required)')).toBeFocused();

  await editor.getByLabel('Reason (required)').fill('Household confirmed the spelling by phone.');
  await editor.getByRole('button', { name: 'Save to case' }).click();

  await expect(page.getByTestId('toast')).toContainText('Case record updated: head of household name from Tyrone Basset to Tyrone Bassett.');
  await expect(page.locator('#case-title')).toHaveText('Tyrone Bassett');
  await expect(compare).toContainText('Matches value you updated');
  await expect(compare).not.toContainText('Does not match');

  // The mismatch is resolved, so verifying no longer needs a note.
  for (const i of [0, 1, 2]) await pop.locator(`#confirm-${i}`).check();
  await pop.getByRole('button', { name: 'Mark verified' }).click();
  await expect(page.getByTestId('toast')).toContainText('Income marked verified');
  await expect(page.getByTestId('activity-feed')).toContainText('Case record updated (Pay statement received Oct 10)');
});

test('the inline editor checks the value and lets the worker type their own', async ({ page }) => {
  const pop = await openPayStatement(page);
  await pop.getByTestId('compare').getByRole('button', { name: 'Edit monthly income on the case' }).click();
  const editor = pop.getByTestId('fact-editor-income');
  await expect(editor.getByLabel('New monthly income')).toHaveValue('2640'); // matches the case already
  await editor.getByLabel('Reason (required)').fill('Raise effective October.');
  await editor.getByRole('button', { name: 'Save to case' }).click();
  await expect(editor).toContainText('That is already the value on the case.');
  await editor.getByLabel('New monthly income').fill('abc');
  await editor.getByRole('button', { name: 'Save to case' }).click();
  await expect(editor).toContainText('Enter a monthly amount in dollars');
  await editor.getByLabel('New monthly income').fill('2,800');
  await expect(editor.getByRole('button', { name: 'Use document value' })).toBeVisible();
  await editor.getByRole('button', { name: 'Save to case' }).click();
  await expect(page.getByTestId('toast')).toContainText('monthly income from $2,640 per month to $2,800 per month');
});

test('undo restores the old value', async ({ page }) => {
  const pop = await openPayStatement(page);
  await pop.getByTestId('compare').getByRole('button', { name: 'Edit name on the case' }).click();
  await pop.getByLabel('Reason (required)').fill('Typo on file.');
  await pop.getByRole('button', { name: 'Save to case' }).click();
  await expect(page.locator('#case-title')).toHaveText('Tyrone Bassett');
  await page.getByTestId('toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#case-title')).toHaveText('Tyrone Basset');
  await expect(pop.getByTestId('compare')).toContainText('Does not match verified record');
});

test('the differences summary jumps to the row editor', async ({ page }) => {
  const pop = await openPayStatement(page);
  const diffs = pop.getByTestId('differences');
  await expect(diffs).toContainText("1 of 5 checked details doesn't match");
  await expect(diffs).toContainText('Document: Tyrone Bassett · Case: Tyrone Basset');
  await diffs.getByRole('button', { name: 'Edit name on the case' }).click();
  await expect(pop.getByTestId('fact-editor-name')).toBeVisible();
  await expect(pop.getByLabel('New head of household name')).toBeFocused();

  // A clean document says so, and its rows can still be edited.
  await page.goto('/#/case/RC-10555');
  await page.getByTestId('req-id').getByRole('button', { name: 'Review document' }).click();
  const clean = page.getByTestId('popout');
  await expect(clean.getByTestId('differences')).toContainText('All 4 checked details match the case');
  await clean.getByTestId('compare').getByRole('button', { name: 'Edit street address on the case' }).click();
  await clean.getByLabel('New street address').fill('2829 Millrace Dr, Apt 4');
  await clean.getByLabel('Reason (required)').fill('Unit number missing from the record.');
  await clean.getByRole('button', { name: 'Save to case' }).click();
  await expect(page.getByTestId('toast')).toContainText('street address from 2829 Millrace Dr to 2829 Millrace Dr, Apt 4');
  await expect(page.getByTestId('activity-feed')).toContainText('Case record updated (Photo ID received Oct 5)');
});

test('edit household details with a source and reason', async ({ page }) => {
  await page.goto('/#/case/RC-10275');
  await page.getByRole('button', { name: 'Edit details' }).click();
  const form = page.getByTestId('case-details-form');
  await form.getByRole('button', { name: /Save/ }).click();
  await expect(form.locator('.error-summary')).toContainText('Nothing has changed yet');

  await form.getByLabel('Phone').fill('555 555 0199');
  await form.getByLabel(/Household size/).fill('0');
  await form.getByRole('button', { name: /Save 2 changes/ }).click();
  const summary = form.locator('.error-summary');
  await expect(summary).toContainText('Household size must be between 1 and 20');
  await expect(summary).toContainText('Choose where the new information came from');
  await expect(summary).toContainText('Say why the case record should change');

  await form.getByLabel(/Household size/).fill('5');
  await form.getByLabel('Where did the new information come from?').selectOption('Phone call with household');
  await form.getByLabel(/Why is it changing/).fill('New number after switching carriers.');
  await form.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByTestId('toast')).toContainText('Case record updated: phone from (555) 555-0190 to (555) 555-0199.');
  await expect(page.locator('.household')).toContainText('(555) 555-0199');
  await expect(page.locator('.household')).toContainText('Updated Oct 12 by you · Phone call with household');
});

test('read-only cases cannot be edited', async ({ page }) => {
  await page.goto('/#/case/RC-10304'); // open by M. Okafor
  await expect(page.locator('#case-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0);
});

