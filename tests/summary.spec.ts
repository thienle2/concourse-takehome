// Case summary ("At a glance") and per-requirement timelines.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { applyAction } from '../src/lib/actions';
import { caseSummary } from '../src/lib/summary';
import { eventReqKey, requirementTimeline, waitingDays } from '../src/lib/timeline';
import { normalizeCase, type Case } from '../src/lib/types';

const allCases: Case[] = JSON.parse(readFileSync(new URL('../public/cases.json', import.meta.url), 'utf8')).map(normalizeCase);
const byId = (id: string) => allCases.find((c) => c.id === id)!;

test.describe('case summary', () => {
  test('overdue case with mixed requirements and returned mail', () => {
    expect(caseSummary(byId('RC-10231'))).toEqual([
      'Overdue by 3 days (was due Oct 9). 2 of 5 requirements verified.',
      "Household members form (arrived Sep 30) is waiting for your review. Shelter costs hasn't been requested yet. Waiting on the household for income (requested 10 days ago); follow-up is due today.",
      'Note: mail to this address came back undeliverable. Last activity Oct 6: Recertification notice returned as undeliverable (Mail room).',
    ]);
  });
  test('snoozed case mentions the snooze and missing contact details', () => {
    const s = caseSummary(byId('RC-10260'));
    expect(s[1]).toBe('Waiting on the household for income (requested 10 days ago); snoozed until Oct 14.');
    expect(s[2]).toMatch(/^Note: no phone number on file, the household's language is Vietnamese and no income reported\./);
  });
  test('ready, verified and decided cases', () => {
    expect(caseSummary(byId('RC-10268'))[0]).toBe(
      'Due Oct 16 (in 4 days). All 5 requirements verified and marked ready for decision Oct 8; a supervisor makes the decision.',
    );
    expect(caseSummary(byId('RC-10106'))[1]).toBe("Everything is verified. It hasn't been marked ready for decision yet.");
    expect(caseSummary(byId('RC-10198'))[0]).toBe('Decision recorded Oct 8. All 5 requirements were verified.');
  });
  test('never states an eligibility outcome', () => {
    for (const c of allCases) expect(caseSummary(c).join(' ')).not.toMatch(/\b(eligible|ineligible|approved?|denied|deny)\b/i);
  });
});

test.describe('requirement timeline', () => {
  test('matches data events to requirements by name, ignoring notes and case-level events', () => {
    expect(eventReqKey({ date: '', by: '', text: 'Employer statement uploaded' })).toBe('inc');
    expect(eventReqKey({ date: '', by: '', text: 'Lease received' })).toBe('shl');
    expect(eventReqKey({ date: '', by: '', text: 'Document request recorded: household members (mailed letter)' })).toBe('hh');
    expect(eventReqKey({ date: '', by: '', text: 'Recertification notice returned as undeliverable' })).toBeNull();
    expect(eventReqKey({ date: '', by: '', text: 'Called about income', kind: 'note' })).toBeNull();
  });
  test('ends with where the requirement stands, including waiting time', () => {
    const c = byId('RC-10231');
    expect(waitingDays(c, 'inc')).toBe(10);
    expect(requirementTimeline(c, 'inc').map((s) => s.text)).toEqual([
      'Document request recorded: income (mailed letter)',
      'Waiting on the household · 10 days since the request',
    ]);
    expect(requirementTimeline(c, 'shl').at(-1)!.text).toBe('Not requested from the household yet');
  });
  test('actions taken here are tagged and appear in order', () => {
    let c = byId('RC-10231');
    c = applyAction(c, { type: 'receive', key: 'inc', via: 'Mail' }).next;
    c = applyAction(c, { type: 'verify', key: 'inc', note: 'Matches employer letter' }).next;
    const steps = requirementTimeline(c, 'inc').map((s) => s.text);
    expect(steps).toEqual([
      'Document request recorded: income (mailed letter)',
      'Pay statement logged as received (mail)',
      'Income verified (pay statement). Note: Matches employer letter',
      'Verified',
    ]);
  });
});

test('case page shows the summary and expands a requirement history', async ({ page }) => {
  await page.goto('/#/case/RC-10231');
  await expect(page.getByTestId('case-summary')).toContainText('Overdue by 3 days (was due Oct 9)');
  await expect(page.getByTestId('req-inc')).toContainText('10 days ago');

  const toggle = page.getByTestId('req-inc').getByRole('button', { name: /Show history \(1\)/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByTestId('history-inc')).toContainText('Document request recorded: income (mailed letter)');
  await expect(page.getByTestId('history-inc')).toContainText('Waiting on the household · 10 days since the request');

  // A new action shows up in the open history and the summary straight away.
  await page.getByTestId('req-inc').getByRole('button', { name: 'Log as received' }).click();
  await page.getByTestId('req-inc').getByRole('button', { name: 'Log as received' }).last().click();
  await expect(page.getByTestId('history-inc')).toContainText('Pay statement logged as received (mail)');
  await expect(page.getByTestId('case-summary')).toContainText('Pay statement (arrived Oct 12)');
});
