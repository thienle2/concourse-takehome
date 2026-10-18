// Fake documents for the review pop-out. Every value here is invented. The planted
// mismatches come from the case's `dx` field; everything else is derived from the case
// record or a deterministic seed so a case always shows the same document.
import { addDays, daysBetween, fmtDate, fmtShort, parseHumanDate, TODAY } from './date';
import { cityStateZip, formatAddress, parseAddress, type Address } from './address';
import { REQ_DOC, REQ_LABEL } from './labels';
import type { Case, ReqKey } from './types';

export type CompareResult = 'match' | 'mismatch' | 'none';

/**
 * How far a record value can be trusted.
 * verified: confirmed earlier by a different document. self-reported: what the household
 * told us, not yet checked. rule: not a case fact at all, a placeholder rule.
 */
export type Trust = 'verified' | 'self-reported' | 'rule';

export interface RecordSource {
  trust: Trust;
  /** "Verified Oct 5 from photo ID", "Self-reported on application" */
  label: string;
}

export interface CompareRow {
  label: string;
  doc: string;
  record: string | null;
  result: CompareResult;
  /** Where the record value came from; null when there's nothing on record. */
  source: RecordSource | null;
}

/** "Photo ID" -> "photo ID": lowercase the first letter only, keeping acronyms. */
const docName = (k: ReqKey) => REQ_DOC[k].charAt(0).toLowerCase() + REQ_DOC[k].slice(1);

/** Date a requirement was verified: this workspace's record first, else the history. */
function verifiedOn(c: Case, k: ReqKey): string | null {
  if (c.vinfo[k]) return c.vinfo[k]!.d;
  const prefix = `${REQ_LABEL[k]} verified`.toLowerCase();
  const hits = c.ev.filter((e) => e.text.toLowerCase().startsWith(prefix));
  return hits.length ? hits.reduce((a, b) => (b.date >= a.date ? b : a)).date : null;
}

/**
 * Source for a case fact that the requirement `from` proves (Identity proves the name,
 * Residency the address, and so on). A document can't vouch for itself: when `from` is the
 * requirement under review, the value is what the household reported.
 */
export function factSource(c: Case, from: ReqKey, current: ReqKey): RecordSource {
  if (from !== current && c.ver[from] === 'v') {
    const d = verifiedOn(c, from);
    const by = c.vinfo[from]?.by;
    const who = by ? ` by ${by === 'You' ? 'you' : by}` : '';
    return d
      ? { trust: 'verified', label: `Verified ${fmtShort(d)} from ${docName(from)}${who}` }
      : { trust: 'verified', label: `Verified from ${docName(from)} · date not on file` };
  }
  // PLACEHOLDER: assumes unverified case facts came from the household's application.
  return { trust: 'self-reported', label: 'Self-reported on application' };
}

const RULE_SOURCE: RecordSource = { trust: 'rule', label: 'Placeholder rule, not program policy' };

export interface DocField {
  label: string;
  value: string;
}

export interface DocSection {
  heading: string;
  fields: DocField[];
}

export interface DocTable {
  heading: string;
  columns: string[];
  rows: string[][];
  /** Columns (by index) to right-align, usually amounts. */
  numeric?: number[];
  /** Render after this section (index); tables without it go at the end. */
  afterSection?: number;
}

export interface FakeDocument {
  title: string;
  issuer: string;
  /** Address or contact line under the issuer. */
  issuerDetail?: string;
  sections: DocSection[];
  tables: DocTable[];
  footer?: string;
  compare: CompareRow[];
}

// PLACEHOLDER: invented freshness windows. Not real program rules.
export const RESIDENCY_MAX_AGE_DAYS = 60;
export const PAY_STATEMENT_MAX_AGE_DAYS = 30;

function seed(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const pick = <T,>(arr: readonly T[], s: number, salt = 0) => arr[(s + salt * 7) % arr.length];
/** Deterministic number in [0, n) from the seed and a salt. */
const roll = (s: number, salt: number, n: number) => ((s >>> (salt % 13)) + salt * 97) % n;

const EMPLOYERS = ['Harrow Valley Grocers', 'Alder Falls Logistics', 'Millrace Home Care', 'Tamarack Diner', 'Quarry Rd Auto Body', 'Saltmarsh Packaging Co.'];
const EMPLOYER_STREETS = ['1200 Foundry St', '88 Granary Ave', '415 Heron Bend', '2 Kestrel Way', '3310 Quarry Rd', '960 Saltmarsh Rd'];
const LANDLORDS = ['Birchmoor Property Group', 'Kestrel Way Apartments LLC', 'R. & L. Okafor', 'Fernbank Rentals', 'Granary Housing Co-op'];
const FIRST = ['Alex', 'Jordan', 'Sam', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Avery', 'Quinn', 'Rowan', 'Elliot'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const cents = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const parseMoney = (s: string | null) => {
  const m = s ? /\$([\d,]+)/.exec(s) : null;
  return m ? Number(m[1].replace(/,/g, '')) : null;
};
const phone = (s: number, salt: number) => `(555) 555-01${String(10 + roll(s, salt, 89)).padStart(2, '0')}`;
const last4 = (s: number, salt: number) => String(1000 + roll(s * 7 + salt, salt, 8999)).padStart(4, '0');

function dob(s: number, salt: number, minAge: number, span: number): string {
  const year = 2026 - minAge - roll(s, salt, span);
  return `${MONTHS[roll(s, salt + 3, 12)]} ${1 + roll(s, salt + 5, 27)}, ${year}`;
}

interface Member {
  name: string;
  relationship: string;
  dob: string;
  sex: string;
}

/** The same invented household appears on the household form and the lease. */
function householdMembers(c: Case, s: number, count: number): Member[] {
  const last = c.name.split(' ').slice(-1)[0];
  const rels = ['Spouse', 'Child', 'Child', 'Parent', 'Child', 'Sibling', 'Child', 'Grandchild', 'Child'];
  const members: Member[] = [{ name: c.name, relationship: 'Head of household', dob: dob(s, 1, 24, 40), sex: pick(['F', 'M'], s) }];
  for (let i = 1; i < count; i++) {
    const rel = rels[(i - 1) % rels.length];
    const age = rel === 'Child' || rel === 'Grandchild' ? [3, 16] : rel === 'Parent' ? [60, 20] : [22, 35];
    members.push({ name: `${pick(FIRST, s, i)} ${last}`, relationship: rel, dob: dob(s, 10 + i, age[0], age[1]), sex: pick(['F', 'M'], s, i) });
  }
  return members;
}

export function buildDocument(c: Case, key: ReqKey): FakeDocument {
  /** Compares a document value with a case fact: proven by requirement `from`, or only ever reported. */
  const compareText = (label: string, doc: string, record: string | null, from?: ReqKey | 'reported'): CompareRow => {
    if (record == null || !from) return { label, doc, record, result: 'none', source: null };
    const source: RecordSource = from === 'reported' ? { trust: 'self-reported', label: 'Self-reported on application' } : factSource(c, from, key);
    return { label, doc, record, result: norm(doc) === norm(record) ? 'match' : 'mismatch', source };
  };
  const compareAddress = (doc: Address, record: Address): CompareRow[] => [
    compareText('Street address', doc.street, record.street, 'res'),
    compareText('City, state, ZIP', cityStateZip(doc), cityStateZip(record), 'res'),
  ];
  const rule = (label: string, doc: string, record: string, ok: boolean): CompareRow => ({ label, doc, record, result: ok ? 'match' : 'mismatch', source: RULE_SOURCE });

  const s = seed(c.id);
  const dx = c.dx[key] ?? {};
  const recordMonthly = parseMoney(c.income);
  const headDob = dob(s, 1, 24, 40);

  switch (key) {
    case 'inc': {
      const name = String(dx.name ?? c.name);
      const monthly = parseMoney(dx.monthly != null ? String(dx.monthly) : null) ?? recordMonthly ?? 1500 + (s % 12) * 110;
      const employerIdx = s % EMPLOYERS.length;
      const employer = EMPLOYERS[employerIdx];
      const gross = round2((monthly * 12) / 26); // biweekly
      const rate = pick([15.25, 16.5, 17.75, 18.4, 19.1, 21.3], s);
      const hours = round2(gross / rate);
      const periodsYtd = 20;
      const pre = [
        ['Health insurance (pre-tax)', 42.18],
        ['Dental (pre-tax)', 6.4],
      ] as const;
      const taxable = gross - pre.reduce((a, [, v]) => a + v, 0);
      const taxes = [
        ['Federal income tax', round2(taxable * 0.071)],
        ['Social Security', round2(taxable * 0.062)],
        ['Medicare', round2(taxable * 0.0145)],
        ['State income tax (AD)', round2(taxable * 0.0305)],
      ] as const;
      const deductions = [...pre, ...taxes];
      const totalDed = round2(deductions.reduce((a, [, v]) => a + v, 0));
      const net = round2(gross - totalDed);
      const payDate = '2026-10-02';
      const age = daysBetween(payDate, TODAY);
      return {
        title: REQ_DOC.inc,
        issuer: employer,
        issuerDetail: `${EMPLOYER_STREETS[employerIdx]}, Alder Falls, AD 000${20 + employerIdx} · EIN 9${roll(s, 2, 9)}-${String(1000000 + roll(s, 4, 8999999)).slice(0, 7)} (fictional)`,
        sections: [
          {
            heading: 'Employee',
            fields: [
              { label: 'Name', value: name },
              { label: 'Address', value: formatAddress(c.address) },
              { label: 'Employee ID', value: `E-${String(s).slice(-5)}` },
              { label: 'SSN', value: `***-**-${last4(s, 1)}` },
              { label: 'Position', value: pick(['Stock associate', 'Driver', 'Home health aide', 'Line cook', 'Shop assistant', 'Packer'], s) },
              { label: 'Status', value: 'Part time, hourly' },
            ],
          },
          {
            heading: 'Pay information',
            fields: [
              { label: 'Pay period', value: 'Sep 13 – Sep 26, 2026' },
              { label: 'Pay date', value: fmtDate(payDate) },
              { label: 'Pay frequency', value: 'Biweekly (26 per year)' },
              { label: 'Advice number', value: `${String(400000 + roll(s, 6, 99999))}` },
              { label: 'Payment', value: `Direct deposit to ****${last4(s, 2)}` },
              { label: 'Filing status', value: 'Single, 1 allowance' },
            ],
          },
          {
            heading: 'Summary',
            fields: [
              { label: 'Gross pay', value: cents(gross) },
              { label: 'Total deductions', value: cents(totalDed) },
              { label: 'Net pay', value: cents(net) },
              { label: 'Gross pay YTD', value: cents(gross * periodsYtd) },
              { label: 'Net pay YTD', value: cents(net * periodsYtd) },
              { label: 'Monthly equivalent', value: `${money(monthly)} (gross × 26 ÷ 12)` },
            ],
          },
        ],
        tables: [
          {
            afterSection: 1,
            heading: 'Earnings',
            columns: ['Type', 'Hours', 'Rate', 'This period', 'Year to date'],
            numeric: [1, 2, 3, 4],
            rows: [
              ['Regular', hours.toFixed(2), cents(rate), cents(gross), cents(gross * periodsYtd)],
              ['Overtime', '0.00', cents(rate * 1.5), cents(0), cents(rate * 1.5 * 6)],
              ['Holiday', '0.00', cents(rate), cents(0), cents(rate * 8)],
            ],
          },
          {
            afterSection: 1,
            heading: 'Deductions',
            columns: ['Deduction', 'This period', 'Year to date'],
            numeric: [1, 2],
            rows: deductions.map(([label, v]) => [label, cents(v), cents(v * periodsYtd)]),
          },
        ],
        footer: 'This statement is for your records. Keep it for tax purposes.',
        compare: [
          compareText('Name', name, c.name, 'id'),
          ...compareAddress(c.address, c.address),
          compareText('Monthly income', money(monthly), recordMonthly != null ? money(recordMonthly) : null, 'inc'),
          compareText('Employer', employer, null),
          compareText('Pay frequency', 'Biweekly', null),
          rule(`Pay date (placeholder rule: within ${PAY_STATEMENT_MAX_AGE_DAYS} days)`, `${fmtDate(payDate)} (${age} days ago)`, `On or after ${fmtDate(addDays(TODAY, -PAY_STATEMENT_MAX_AGE_DAYS))}`, age <= PAY_STATEMENT_MAX_AGE_DAYS),
        ],
      };
    }
    case 'id': {
      const name = String(dx.name ?? c.name);
      const sex = pick(['F', 'M'], s);
      const expires = '2030-03-14';
      return {
        title: REQ_DOC.id,
        issuer: 'State of Alder · Department of Motor Vehicles (fictional)',
        issuerDetail: 'Identification card · Not a driver license',
        sections: [
          {
            heading: 'Card holder',
            fields: [
              { label: 'Name', value: name },
              { label: 'Date of birth', value: headDob },
              { label: 'Address', value: formatAddress(c.address) },
              { label: 'Sex', value: sex },
              { label: 'Organ donor', value: s % 3 === 0 ? 'Yes' : 'No' },
              { label: 'Veteran', value: 'No' },
            ],
          },
          {
            heading: 'Physical description',
            fields: [
              { label: 'Height', value: `${5}'-${String(roll(s, 3, 12)).padStart(2, '0')}"` },
              { label: 'Weight', value: `${120 + roll(s, 4, 90)} lb` },
              { label: 'Eyes', value: pick(['BRO', 'BLU', 'GRN', 'HAZ', 'GRY'], s) },
              { label: 'Hair', value: pick(['BLK', 'BRO', 'BLN', 'GRY', 'RED'], s, 2) },
            ],
          },
          {
            heading: 'Card details',
            fields: [
              { label: 'ID number', value: `D${String(s).slice(0, 7).padStart(7, '0')}` },
              { label: 'Class', value: 'ID' },
              { label: 'Issued', value: 'Mar 14, 2022' },
              { label: 'Expires', value: fmtDate(expires) },
              { label: 'Restrictions', value: 'None' },
              { label: 'Endorsements', value: 'None' },
              { label: 'REAL ID', value: 'Compliant ★' },
              { label: 'Document discriminator', value: `${String(s).padEnd(10, '7')}${roll(s, 8, 9999)}` },
            ],
          },
        ],
        tables: [],
        compare: [
          compareText('Name', name, c.name, 'id'),
          ...compareAddress(c.address, c.address),
          compareText('Date of birth', headDob, null),
          compareText('ID number', `D${String(s).slice(0, 7).padStart(7, '0')}`, null),
          rule('Expiration (placeholder rule: not expired)', fmtDate(expires), `After ${fmtDate(TODAY)}`, expires > TODAY),
        ],
      };
    }
    case 'res': {
      const name = String(dx.name ?? c.name);
      const issued = String(dx.issued ?? 'Sep 28, 2026');
      const iso = parseHumanDate(issued);
      const age = iso ? daysBetween(iso, TODAY) : null;
      const fresh = age != null && age <= RESIDENCY_MAX_AGE_DAYS;
      const periodEnd = iso ? addDays(iso, -3) : '2026-09-25';
      const periodStart = addDays(periodEnd, -30);
      const due = iso ? addDays(iso, 21) : '2026-10-19';
      const kwh = 380 + roll(s, 5, 520);
      const kwhRate = 0.142;
      const gallons = 2400 + roll(s, 6, 3800);
      const prevE = 40000 + roll(s, 7, 20000);
      const prevW = 100000 + roll(s, 9, 50000);
      const charges: [string, string, number][] = [
        ['Electric basic service charge', '1 month', 12.5],
        ['Electric usage', `${kwh} kWh × $${kwhRate.toFixed(3)}`, round2(kwh * kwhRate)],
        ['Water usage', `${gallons.toLocaleString('en-US')} gal × $0.0061`, round2(gallons * 0.0061)],
        ['Sewer', 'Flat rate', 28.4],
        ['Trash and recycling', 'Flat rate', 18.75],
      ];
      const subtotal = round2(charges.reduce((a, [, , v]) => a + v, 0));
      const tax = round2(subtotal * 0.06);
      const total = round2(subtotal + tax);
      const prevBalance = round2(total * (0.9 + roll(s, 11, 20) / 100));
      return {
        title: REQ_DOC.res,
        issuer: 'Alder Falls Water & Power (fictional)',
        issuerDetail: `PO Box 4410, Alder Falls, AD 00001 · Customer service ${phone(s, 13)}`,
        sections: [
          {
            heading: 'Account',
            fields: [
              { label: 'Account holder', value: name },
              { label: 'Account number', value: `40-${(s % 900000) + 100000}` },
              { label: 'Service address', value: formatAddress(c.address) },
              { label: 'Mailing address', value: formatAddress(c.address) },
              { label: 'Rate plan', value: 'Residential standard (R-1)' },
            ],
          },
          {
            heading: 'Statement',
            fields: [
              { label: 'Statement date', value: issued },
              { label: 'Service period', value: `${fmtShort(periodStart)} – ${fmtDate(periodEnd)}` },
              { label: 'Days in period', value: '30' },
              { label: 'Payment due', value: fmtDate(due) },
              { label: 'Previous balance', value: cents(prevBalance) },
              { label: 'Payment received', value: `${cents(prevBalance)} on ${fmtShort(addDays(periodStart, 9))} (thank you)` },
              { label: 'Balance forward', value: cents(0) },
              { label: 'Amount due', value: cents(total) },
            ],
          },
        ],
        tables: [
          {
            heading: 'Meter readings',
            columns: ['Meter', 'Previous', 'Current', 'Usage'],
            numeric: [1, 2, 3],
            rows: [
              [`Electric E-${String(roll(s, 14, 99999)).padStart(5, '0')}`, prevE.toLocaleString('en-US'), (prevE + kwh).toLocaleString('en-US'), `${kwh} kWh`],
              [`Water W-${String(roll(s, 15, 99999)).padStart(5, '0')}`, prevW.toLocaleString('en-US'), (prevW + gallons).toLocaleString('en-US'), `${gallons.toLocaleString('en-US')} gal`],
            ],
          },
          {
            heading: 'Current charges',
            columns: ['Charge', 'Detail', 'Amount'],
            numeric: [2],
            rows: [
              ...charges.map(([l, d, v]) => [l, d, cents(v)]),
              ['Alder Falls utility tax', '6% of subtotal', cents(tax)],
              ['Total current charges', '', cents(total)],
            ],
          },
        ],
        footer: 'Late payments after the due date are charged 1.5% per month.',
        compare: [
          compareText('Name', name, c.name, 'id'),
          ...compareAddress(c.address, c.address),
          compareText('Account number', `40-${(s % 900000) + 100000}`, null),
          rule(
            `Statement date (placeholder rule: within ${RESIDENCY_MAX_AGE_DAYS} days)`,
            age != null ? `${issued} (${age} days ago)` : issued,
            `On or after ${fmtDate(addDays(TODAY, -RESIDENCY_MAX_AGE_DAYS))}`,
            fresh,
          ),
        ],
      };
    }
    case 'hh': {
      const count = Number(dx.members ?? c.hh);
      const signed = dx.signed !== false;
      const members = householdMembers(c, s, count);
      const signedOn = c.rdate && c.rdate <= TODAY ? fmtDate(c.rdate) : 'Oct 5, 2026';
      const incomeOf = (i: number) => (i === 0 && recordMonthly != null ? recordMonthly : 0);
      const totalIncome = members.reduce((a, _, i) => a + incomeOf(i), 0);
      return {
        title: REQ_DOC.hh,
        issuer: 'Alder County Human Services (fictional)',
        issuerDetail: 'Form HM-2 · Household members and income · Rev. 03/2026',
        sections: [
          {
            heading: 'Section A · Head of household',
            fields: [
              { label: 'Name', value: c.name },
              { label: 'Date of birth', value: headDob },
              { label: 'Home address', value: formatAddress(c.address) },
              { label: 'Phone', value: c.phone ?? '(left blank)' },
              { label: 'Preferred language', value: c.lang },
              { label: 'Case number', value: c.id },
            ],
          },
          {
            heading: 'Section C · Changes',
            fields: [
              { label: 'Anyone temporarily away from home?', value: 'No' },
              { label: 'Anyone moved in or out in the last 12 months?', value: count !== c.hh ? 'Yes (see section B)' : 'No' },
              { label: 'Anyone who buys and prepares food separately?', value: 'No' },
              { label: 'Total household income (monthly)', value: money(totalIncome) },
            ],
          },
          {
            heading: 'Section D · Certification',
            fields: [
              { label: 'Signature', value: signed ? `Signed by ${c.name}` : 'Not signed' },
              { label: 'Date signed', value: signed ? signedOn : '(blank)' },
              { label: 'Completed by', value: 'Head of household' },
            ],
          },
        ],
        tables: [
          {
            afterSection: 0,
            heading: `Section B · Everyone who lives in the home (${members.length})`,
            columns: ['#', 'Name', 'Relationship', 'Date of birth', 'Sex', 'SSN (last 4)', 'Citizen or eligible noncitizen', 'Student', 'Disabled', 'Monthly income'],
            numeric: [9],
            rows: members.map((m, i) => [
              String(i + 1),
              m.name,
              m.relationship,
              m.dob,
              m.sex,
              last4(s, 20 + i),
              'Yes',
              m.relationship === 'Child' ? 'Yes' : 'No',
              i === 3 ? 'Yes' : 'No',
              money(incomeOf(i)),
            ]),
          },
        ],
        compare: [
          compareText('Head of household', c.name, c.name, 'id'),
          compareText('People in household', String(count), String(c.hh), 'hh'),
          ...compareAddress(c.address, c.address),
          compareText('Phone', c.phone ?? '(left blank)', c.phone, 'reported'),
          compareText('Preferred language', c.lang, c.lang, 'reported'),
          compareText('Total monthly income', money(totalIncome), recordMonthly != null ? money(recordMonthly) : null, 'inc'),
          // PLACEHOLDER: assumes the form must be signed.
          rule('Signature (placeholder rule: required)', signed ? 'Signed' : 'Not signed', 'Signed', signed),
        ],
      };
    }
    case 'shl': {
      const addr = dx.addr != null ? parseAddress(String(dx.addr)) : c.address;
      const rent = 700 + (s % 14) * 65;
      const landlordIdx = s % LANDLORDS.length;
      const landlord = LANDLORDS[landlordIdx];
      const occupants = householdMembers(c, s, c.hh);
      const coTenant = occupants.find((m) => m.relationship === 'Spouse');
      const start = '2026-02-01';
      const end = '2027-01-31';
      const bedrooms = Math.min(4, Math.max(1, Math.ceil(c.hh / 2)));
      return {
        title: REQ_DOC.shl,
        issuer: landlord,
        issuerDetail: `${pick(['22 Granary Ave', '5 Kestrel Way', '410 Birchmoor Ave', '71 Fernbank Dr', '9 Millstone Ct'], s)}, Alder Falls, AD 00003 · ${phone(s, 30)}`,
        sections: [
          {
            heading: '1. Parties',
            fields: [
              { label: 'Landlord', value: landlord },
              { label: 'Tenant', value: c.name },
              { label: 'Co-tenant', value: coTenant ? coTenant.name : 'None' },
            ],
          },
          {
            heading: '2. Premises',
            fields: [
              { label: 'Rental address', value: formatAddress(addr) },
              { label: 'Unit type', value: `${bedrooms} bedroom apartment` },
              { label: 'Parking', value: `Space ${roll(s, 31, 40) + 1}` },
            ],
          },
          {
            heading: '3. Term and rent',
            fields: [
              { label: 'Term', value: `${fmtDate(start)} – ${fmtDate(end)} (12 months)` },
              { label: 'Monthly rent', value: money(rent) },
              { label: 'Rent due', value: '1st of each month, 5-day grace period' },
              { label: 'Late fee', value: '$50 after the 6th' },
              { label: 'Security deposit', value: `${money(rent)} (paid Jan 20, 2026)` },
              { label: 'Pets', value: 'Not permitted' },
            ],
          },
          {
            heading: '4. Utilities',
            fields: [
              { label: 'Paid by tenant', value: 'Electric, internet' },
              { label: 'Paid by landlord', value: 'Water, sewer, trash' },
            ],
          },
          {
            heading: '6. Signatures',
            fields: [
              { label: 'Tenant', value: `Signed by ${c.name}, Jan 20, 2026` },
              { label: 'Landlord', value: `Signed for ${landlord}, Jan 22, 2026` },
            ],
          },
        ],
        tables: [
          {
            afterSection: 3,
            heading: `5. Authorized occupants (${occupants.length})`,
            columns: ['Name', 'Relationship', 'Date of birth'],
            rows: occupants.map((m) => [m.name, m.relationship === 'Head of household' ? 'Tenant' : m.relationship, m.dob]),
          },
          {
            heading: 'Rent ledger (attached)',
            columns: ['Month', 'Charged', 'Paid', 'Date paid', 'Balance'],
            numeric: [1, 2, 4],
            rows: ['Jul', 'Aug', 'Sep'].map((mo, i) => [`${mo} 2026`, money(rent), money(rent), `${mo} ${1 + roll(s, 40 + i, 5)}`, '$0']),
          },
        ],
        compare: [
          compareText('Tenant name', c.name, c.name, 'id'),
          ...compareAddress(addr, c.address),
          compareText('Occupants listed', String(occupants.length), String(c.hh), 'hh'),
          compareText('Monthly rent', money(rent), null),
          rule('Lease term (placeholder rule: covers today)', `${fmtDate(start)} – ${fmtDate(end)}`, `Includes ${fmtDate(TODAY)}`, start <= TODAY && TODAY <= end),
        ],
      };
    }
  }
}

export const hasMismatch = (doc: FakeDocument) => doc.compare.some((r) => r.result === 'mismatch');

/** One-line summary of how much of the comparison rests on verified records. */
export function trustSummary(doc: FakeDocument): string {
  const facts = doc.compare.filter((r) => r.source && r.source.trust !== 'rule');
  const weak = facts.filter((r) => r.source!.trust === 'self-reported');
  const strong = facts.length - weak.length;
  if (!facts.length) return 'Nothing on this document can be compared with the case yet.';
  if (!weak.length) return `All ${facts.length} details are checked against verified records.`;
  const names = weak.map((r) => r.label.toLowerCase());
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const lead = strong ? `${strong} of ${facts.length} details are checked against verified records.` : 'None of these details have been verified yet.';
  return `${lead} ${list.charAt(0).toUpperCase() + list.slice(1)} ${weak.length === 1 ? 'is' : 'are'} only self-reported, so a match there doesn't confirm ${weak.length === 1 ? 'it' : 'them'}.`;
}
