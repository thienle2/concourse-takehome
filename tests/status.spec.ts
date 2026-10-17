// Derived status rules, tested as pure functions plus against the real cases.json.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { applyAction } from '../src/lib/actions';
import { TODAY } from '../src/lib/date';
import { canMarkReady, canSetFollowUp, caseStatus, isSnoozed, needsAction, nextAction, statusLabel, validateFollowUpDate } from '../src/lib/status';
import { normalizeCase, type Case, type ReqStatus } from '../src/lib/types';

const allCases: Case[] = JSON.parse(readFileSync(new URL('../public/cases.json', import.meta.url), 'utf8')).map(normalizeCase);
const byId = (id: string) => allCases.find((c) => c.id === id)!;

function mk(ver: string, extra: Partial<Case> = {}): Case {
  const [inc, id, res, hh, shl] = ver.split('') as ReqStatus[];
  return normalizeCase({ id: 'T-1', name: 'Test Person', hh: 2, due: '2026-10-30', addr: '1 Test St', lang: 'English', ver: { inc, id, res, hh, shl }, ev: [], ...extra });
}

test.describe('caseStatus', () => {
  test('decided wins over everything', () => {
    expect(caseStatus(mk('rmaav', { decided: 'Decision recorded Oct 8' }))).toBe('decided');
    expect(caseStatus(mk('vvvvv', { ready: true, decided: 'x' }))).toBe('decided');
  });
  test('all verified + ready flag is ready, otherwise verified', () => {
    expect(caseStatus(mk('vvvvv', { ready: true }))).toBe('ready');
    expect(caseStatus(mk('vvvvv'))).toBe('verified');
  });
  test('ready flag alone is not enough', () => {
    expect(caseStatus(mk('vvvva', { ready: true }))).toBe('waiting');
  });
  test('any received beats missing and awaiting', () => {
    expect(caseStatus(mk('rmaav'))).toBe('review');
  });
  test('missing beats awaiting', () => {
    expect(caseStatus(mk('vmaav'))).toBe('missing');
  });
  test('only awaiting left is waiting', () => {
    expect(caseStatus(mk('vvaav'))).toBe('waiting');
  });
  test('labels', () => {
    expect(statusLabel(mk('rvvvv'))).toBe('Ready to review');
    expect(statusLabel(mk('mvvvv'))).toBe('Documents missing');
    expect(statusLabel(mk('avvvv'))).toBe('Waiting on household');
    expect(statusLabel(mk('vvvvv'))).toBe('All verified');
    expect(statusLabel(mk('vvvvv', { ready: true }))).toBe('Ready for decision');
    expect(statusLabel(mk('vvvvv', { decided: 'x' }))).toBe('Decided');
  });
  test('raw status field in data is ignored', () => {
    expect(caseStatus(normalizeCase({ ...mk('rvvvv'), status: 'decided' }))).toBe('review');
  });
  test('data set derives the expected mix', () => {
    const counts: Record<string, number> = {};
    for (const c of allCases) counts[caseStatus(c)] = (counts[caseStatus(c)] ?? 0) + 1;
    expect(allCases).toHaveLength(72);
    expect(counts).toEqual({ review: 29, waiting: 18, ready: 6, verified: 5, decided: 5, missing: 9 });
  });
});

test.describe('snooze and needs action', () => {
  test('today is fixed', () => expect(TODAY).toBe('2026-10-12'));
  test('waiting with follow-up after today is snoozed', () => {
    expect(isSnoozed(mk('avvvv', { fu: '2026-10-13' }))).toBe(true);
    expect(needsAction(mk('avvvv', { fu: '2026-10-13' }))).toBe(false);
  });
  test('follow-up today or earlier is not snoozed', () => {
    expect(isSnoozed(mk('avvvv', { fu: TODAY }))).toBe(false);
    expect(isSnoozed(mk('avvvv', { fu: '2026-10-01' }))).toBe(false);
    expect(needsAction(mk('avvvv', { fu: TODAY }))).toBe(true);
  });
  test('only waiting cases snooze', () => {
    expect(isSnoozed(mk('rvvva', { fu: '2026-10-20' }))).toBe(false);
    expect(isSnoozed(mk('mvvva', { fu: '2026-10-20' }))).toBe(false);
  });
  test('ready and decided never need action', () => {
    expect(needsAction(mk('vvvvv', { ready: true }))).toBe(false);
    expect(needsAction(mk('vvvvv', { decided: 'x' }))).toBe(false);
    expect(needsAction(mk('vvvvv'))).toBe(true);
  });
  test('real data: RC-10260 snoozed, RC-10672 follow-up due today', () => {
    expect(isSnoozed(byId('RC-10260'))).toBe(true);
    expect(isSnoozed(byId('RC-10672'))).toBe(false);
    expect(nextAction(byId('RC-10672')).kind).toBe('follow-up');
  });
});

test.describe('follow-up guard', () => {
  test('blocked while something is waiting for review', () => {
    const g = canSetFollowUp(mk('rvvva'));
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/waiting for your review/);
  });
  test('blocked while something is unrequested', () => {
    const g = canSetFollowUp(mk('mvvva'));
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/hasn't been requested/);
  });
  test('blocked when no request is out', () => {
    expect(canSetFollowUp(mk('vvvvv')).reason).toMatch(/No request is out/);
  });
  test('blocked when the due date has passed', () => {
    expect(canSetFollowUp(mk('avvvv', { due: '2026-10-10' })).reason).toMatch(/due date/);
  });
  test('blocked when locked or decided', () => {
    expect(canSetFollowUp(mk('avvvv', { locked: 'M. Okafor' })).reason).toMatch(/M\. Okafor/);
    expect(canSetFollowUp(mk('avvvv', { decided: 'x' })).ok).toBe(false);
  });
  test('allowed when a request is out and nothing else pending', () => {
    expect(canSetFollowUp(mk('avvav')).ok).toBe(true);
  });
  test('date must be after today and on or before due', () => {
    const c = mk('avvvv', { due: '2026-10-30' });
    expect(validateFollowUpDate(c, '')).toMatch(/Enter/);
    expect(validateFollowUpDate(c, TODAY)).toMatch(/after today/);
    expect(validateFollowUpDate(c, '2026-10-01')).toMatch(/after today/);
    expect(validateFollowUpDate(c, '2026-10-31')).toMatch(/on or before the due date/);
    expect(validateFollowUpDate(c, '2026-10-13')).toBe('');
    expect(validateFollowUpDate(c, '2026-10-30')).toBe('');
  });
  test('saving a follow-up snoozes the case and says so', () => {
    const { next, message } = applyAction(mk('avvvv'), { type: 'setFollowUp', date: '2026-10-20', note: '' });
    expect(isSnoozed(next)).toBe(true);
    expect(message).toMatch(/Case status: Waiting on household \(snoozed until Oct 20\)\.$/);
    expect(next.ev.at(-1)!.text).toMatch(/Follow-up date set for Oct 20, 2026/);
  });
});

test.describe('next action order', () => {
  test('review > request > set follow-up > follow up > mark ready', () => {
    expect(nextAction(mk('rmavv')).kind).toBe('review');
    expect(nextAction(mk('vmavv')).kind).toBe('request');
    expect(nextAction(mk('vvavv')).kind).toBe('set-followup');
    expect(nextAction(mk('vvavv', { fu: '2026-10-05' })).kind).toBe('follow-up');
    expect(nextAction(mk('vvavv', { fu: '2026-10-20' })).kind).toBe('snoozed');
    expect(nextAction(mk('vvvvv')).kind).toBe('mark-ready');
    expect(nextAction(mk('vvvvv', { ready: true })).kind).toBe('awaiting-decision');
  });
  test('mark ready blocked until all five verified', () => {
    expect(canMarkReady(mk('vvvva')).reason).toMatch(/4 of 5 requirements are verified\. Verify Shelter costs first/);
    expect(canMarkReady(mk('vvvvv')).ok).toBe(true);
  });
  test('every save message ends with the new case status', () => {
    const c = mk('rvvvv');
    expect(applyAction(c, { type: 'verify', key: 'inc', note: '' }).message).toMatch(/Case status: All verified\.$/);
    expect(applyAction(c, { type: 'note', text: 'hi' }).message).toMatch(/Case status: Ready to review\.$/);
  });
});
