// Reminding the supervisor about cases awaiting a decision near or past the due date.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { applyAction } from '../src/lib/actions';
import { canRemindSupervisor, decisionAtRisk, nextAction } from '../src/lib/status';
import { caseSummary } from '../src/lib/summary';
import { normalizeCase, type Case } from '../src/lib/types';

const allCases: Case[] = JSON.parse(readFileSync(new URL('../public/cases.json', import.meta.url), 'utf8')).map(normalizeCase);
const byId = (id: string) => allCases.find((c) => c.id === id)!;
const ready = (due: string, extra: Record<string, unknown> = {}) =>
  normalizeCase({ id: 'T-1', name: 'Test Person', hh: 1, due, addr: '1 Test St, Alder Falls', lang: 'English', ver: { inc: 'v', id: 'v', res: 'v', hh: 'v', shl: 'v' }, ready: true, ev: [], ...extra });

test.describe('rules', () => {
  test('at risk when ready and due within 3 days or past', () => {
    expect(allCases.filter(decisionAtRisk).map((c) => c.id).sort()).toEqual(['RC-10201', 'RC-10295', 'RC-10364']);
    expect(decisionAtRisk(ready('2026-10-15'))).toBe(true);
    expect(decisionAtRisk(ready('2026-10-16'))).toBe(false);
  });
  test('reminding becomes the next step only for at-risk cases', () => {
    expect(nextAction(byId('RC-10364')).kind).toBe('remind-supervisor');
    expect(nextAction(byId('RC-10364')).reason).toBe('Still waiting on a supervisor decision and the case is overdue since Oct 10. No reminder sent yet.');
    expect(nextAction(byId('RC-10268')).kind).toBe('awaiting-decision');
  });
  test('once a day, ready cases only, never on read-only cases', () => {
    const { next, message } = applyAction(byId('RC-10364'), { type: 'remindSupervisor', note: 'Due date passed' });
    expect(message).toBe('Reminder to the supervisor recorded. Nothing was actually sent. Case status: Ready for decision.');
    expect(next.ev.at(-1)!.text).toBe('Supervisor reminded about pending decision. Note: Due date passed');
    expect(canRemindSupervisor(next).reason).toMatch(/already reminded the supervisor today/);
    expect(nextAction(next)).toMatchObject({ kind: 'awaiting-decision', reason: expect.stringContaining('You reminded the supervisor today') });
    expect(canRemindSupervisor(ready('2026-10-12', { reminders: ['2026-10-11'] })).ok).toBe(true);
    expect(canRemindSupervisor(byId('RC-10106')).reason).toMatch(/Only cases marked ready/);
    expect(canRemindSupervisor(ready('2026-10-12', { locked: 'J. Reyes' })).ok).toBe(false);
  });
  test('summary mentions the pending decision and reminders', () => {
    expect(caseSummary(byId('RC-10201'))[1]).toBe('The decision is still pending close to the due date. No reminder sent to the supervisor yet.');
    expect(caseSummary(byId('RC-10364'))[1]).toBe('The decision is still pending past the due date. No reminder sent to the supervisor yet.');
    const { next } = applyAction(byId('RC-10364'), { type: 'remindSupervisor', note: '' });
    expect(caseSummary(next)[1]).toBe('The decision is still pending past the due date. Supervisor last reminded Oct 12.');
  });
});

test('worker reminds the supervisor from the case and sees it in the queue', async ({ page }) => {
  await page.goto('/#/case/RC-10364');
  const next = page.getByTestId('next-block');
  await expect(next).toContainText('Remind supervisor');
  await next.getByRole('button', { name: 'Remind supervisor' }).click();
  await page.getByLabel('Message for the supervisor (optional)').fill('Due date has passed; household is waiting.');
  await page.getByRole('button', { name: 'Send reminder' }).click();

  await expect(page.getByTestId('toast')).toContainText('Reminder to the supervisor recorded. Nothing was actually sent. Case status: Ready for decision.');
  await expect(page.getByTestId('remind-blocked')).toContainText('already reminded the supervisor today');
  await expect(next).toContainText('You reminded the supervisor today');
  await expect(page.getByTestId('activity-feed').locator('li').first()).toContainText('Supervisor reminded about pending decision');

  await page.getByRole('button', { name: /Back to queue/ }).click();
  const awaiting = page.getByRole('button', { name: /^Awaiting decision/ });
  await expect(awaiting).toContainText('3 near due date');
  await awaiting.click();
  await expect(page.getByTestId('queue-row').filter({ hasText: 'RC-10364' })).toContainText('reminded Oct 12');
  await expect(page.getByTestId('queue-row').filter({ hasText: 'RC-10295' })).toContainText('not reminded');
});
