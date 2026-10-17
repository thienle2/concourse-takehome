// Where each comparison value comes from, and how far it can be trusted.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { applyAction } from '../src/lib/actions';
import { buildDocument, trustSummary } from '../src/lib/documents';
import { normalizeCase, type Case, type ReqStatus } from '../src/lib/types';

const allCases: Case[] = JSON.parse(readFileSync(new URL('../public/cases.json', import.meta.url), 'utf8')).map(normalizeCase);
const byId = (id: string) => allCases.find((c) => c.id === id)!;

function mk(ver: string, extra: Record<string, unknown> = {}): Case {
  const [inc, id, res, hh, shl] = ver.split('') as ReqStatus[];
  return normalizeCase({ id: 'T-1', name: 'Test Person', hh: 2, due: '2026-10-30', addr: '1 Test St, Alder Falls', lang: 'English', income: '$1,000 per month, reported', ver: { inc, id, res, hh, shl }, ev: [], ...extra });
}
const row = (c: Case, k: Parameters<typeof buildDocument>[1], label: string) => buildDocument(c, k).compare.find((r) => r.label === label)!;

test('a fact is verified when a different, verified document proves it', () => {
  const c = mk('rvvvv', { ev: [['2026-10-05', 'Identity verified', 'You']] });
  expect(row(c, 'inc', 'Name').source).toEqual({ trust: 'verified', label: 'Verified Oct 5 from photo ID' });
});

test('verification without a date says so instead of guessing', () => {
  expect(row(byId('RC-10275'), 'inc', 'Name').source).toEqual({ trust: 'verified', label: 'Verified from photo ID · date not on file' });
});

test('unverified facts are self-reported', () => {
  const c = mk('rrvvv');
  expect(row(c, 'inc', 'Name').source!.trust).toBe('self-reported');
  expect(row(c, 'inc', 'Monthly income').source).toEqual({ trust: 'self-reported', label: 'Self-reported on application' });
});

test('a document never vouches for itself', () => {
  // Identity is verified, but viewing the photo ID compares the name with what was reported, not with itself.
  expect(row(mk('vvvvv'), 'id', 'Name').source!.trust).toBe('self-reported');
  expect(row(mk('vvvvv'), 'res', 'Street address').source!.trust).toBe('self-reported');
  expect(row(mk('vvvvv'), 'shl', 'Street address').source!.trust).toBe('verified');
});

test('verifying in this workspace names the date and reviewer', () => {
  const { next } = applyAction(mk('rrvvv'), { type: 'verify', key: 'id', note: '' });
  expect(row(next, 'inc', 'Name').source!.label).toBe('Verified Oct 12 from photo ID by you');
});

test('placeholder rules are marked as rules, and missing records have no source', () => {
  expect(row(mk('vvrvv'), 'res', 'Statement date (placeholder rule: within 60 days)').source!.trust).toBe('rule');
  expect(row(mk('rvvvv'), 'inc', 'Employer').source).toBeNull();
});

test('summary calls out self-reported details', () => {
  expect(trustSummary(buildDocument(byId('RC-10275'), 'inc'))).toBe(
    "1 of 2 details are checked against verified records. Monthly income is only self-reported, so a match there doesn't confirm it.",
  );
  expect(trustSummary(buildDocument(mk('rrrrr'), 'inc'))).toMatch(/^None of these details have been verified yet\./);
  expect(trustSummary(buildDocument(mk('vvvvr'), 'shl'))).toBe('All 3 details are checked against verified records.');
});
