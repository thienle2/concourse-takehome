import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { formatAddress, parseAddress } from '../src/lib/address';
import { buildDocument } from '../src/lib/documents';
import { normalizeCase, type Case } from '../src/lib/types';

const allCases: Case[] = JSON.parse(readFileSync(new URL('../public/cases.json', import.meta.url), 'utf8')).map(normalizeCase);

test('splits street, unit and city; adds placeholder state and ZIP', () => {
  const a = parseAddress('418 Larkspur Ct, Apt 2, Alder Falls');
  expect(a.street).toBe('418 Larkspur Ct, Apt 2');
  expect(a.city).toBe('Alder Falls');
  expect(a.state).toBe('AD');
  expect(a.zip).toMatch(/^000\d{2}$/);
  expect(formatAddress(a)).toBe(`418 Larkspur Ct, Apt 2, Alder Falls, AD ${a.zip}`);
});

test('same street gets the same ZIP regardless of house number or unit', () => {
  expect(parseAddress('77 Ferris Ln, Unit A, Alder Falls').zip).toBe(parseAddress('77 Ferris Ln, Unit B, Alder Falls').zip);
  expect(parseAddress('1944 Orchard Row, Alder Falls').zip).toBe(parseAddress('1942 Orchard Row, Alder Falls').zip);
});

test('every case in the data parses into all four parts', () => {
  for (const c of allCases) {
    expect(c.address.street, c.id).not.toBe('');
    expect(c.address.city, c.id).toBe('Alder Falls');
    expect(c.address.state, c.id).toBe('AD');
    expect(c.address.zip, c.id).toMatch(/^000\d{2}$/);
  }
});

test('planted address mismatch is pinned to the street line', () => {
  const c = allCases.find((x) => x.id === 'RC-10252')!; // lease says Unit A, record says Unit B
  const rows = buildDocument(c, 'shl').compare;
  expect(rows.find((r) => r.label === 'Street address')!.result).toBe('mismatch');
  expect(rows.find((r) => r.label === 'City, state, ZIP')!.result).toBe('match');
});
