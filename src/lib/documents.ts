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

export interface FakeDocument {
  title: string;
  issuer: string;
  fields: { label: string; value: string }[];
  compare: CompareRow[];
}

// PLACEHOLDER: invented freshness window for utility bills. Not a real program rule.
export const RESIDENCY_MAX_AGE_DAYS = 60;

function seed(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const pick = <T,>(arr: readonly T[], s: number, salt = 0) => arr[(s + salt * 7) % arr.length];

const EMPLOYERS = ['Harrow Valley Grocers', 'Alder Falls Logistics', 'Millrace Home Care', 'Tamarack Diner', 'Quarry Rd Auto Body', 'Saltmarsh Packaging Co.'];
const LANDLORDS = ['Birchmoor Property Group', 'Kestrel Way Apartments LLC', 'R. & L. Okafor', 'Fernbank Rentals', 'Granary Housing Co-op'];
const FIRST = ['Alex', 'Jordan', 'Sam', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Avery', 'Quinn'];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const parseMoney = (s: string | null) => {
  const m = s ? /\$([\d,]+)/.exec(s) : null;
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

export function buildDocument(c: Case, key: ReqKey): FakeDocument {
  /** Compares a document value with the case fact that requirement `from` proves. */
  const compareText = (label: string, doc: string, record: string | null, from?: ReqKey): CompareRow => {
    if (record == null || !from) return { label, doc, record, result: 'none', source: null };
    return { label, doc, record, result: norm(doc) === norm(record) ? 'match' : 'mismatch', source: factSource(c, from, key) };
  };
  const compareAddress = (doc: Address, record: Address): CompareRow[] => [
    compareText('Street address', doc.street, record.street, 'res'),
    compareText('City, state, ZIP', cityStateZip(doc), cityStateZip(record), 'res'),
  ];
  const s = seed(c.id);
  const dx = c.dx[key] ?? {};
  const lastName = c.name.split(' ').slice(-1)[0];

  switch (key) {
    case 'inc': {
      const name = String(dx.name ?? c.name);
      const recordMonthly = parseMoney(c.income);
      const docMonthly = parseMoney(dx.monthly != null ? String(dx.monthly) : null) ?? recordMonthly ?? 1500 + (s % 12) * 110;
      const employer = pick(EMPLOYERS, s);
      return {
        title: REQ_DOC.inc,
        issuer: employer,
        fields: [
          { label: 'Employee', value: name },
          { label: 'Employer', value: employer },
          { label: 'Pay period', value: 'Sep 16 – Sep 30, 2026' },
          { label: 'Pay date', value: 'Oct 2, 2026' },
          { label: 'Gross pay this period', value: money(docMonthly / 2) },
          { label: 'Gross pay per month', value: money(docMonthly) },
        ],
        compare: [
          compareText('Name', name, c.name, 'id'),
          compareText('Monthly income', money(docMonthly), recordMonthly != null ? money(recordMonthly) : null, 'inc'),
          compareText('Employer', employer, null),
        ],
      };
    }
    case 'id': {
      const name = String(dx.name ?? c.name);
      const dob = `${pick(['Mar', 'Jun', 'Sep', 'Dec'], s)} ${1 + (s % 27)}, ${1958 + (s % 45)}`;
      return {
        title: REQ_DOC.id,
        issuer: 'State of Alder · Identification card (fictional)',
        fields: [
          { label: 'Name', value: name },
          { label: 'Date of birth', value: dob },
          { label: 'Address', value: formatAddress(c.address) },
          { label: 'ID number', value: `D${String(s).slice(0, 7).padStart(7, '0')}` },
          { label: 'Expires', value: 'Mar 14, 2030' },
        ],
        compare: [compareText('Name', name, c.name, 'id'), ...compareAddress(c.address, c.address), compareText('Date of birth', dob, null)],
      };
    }
    case 'res': {
      const name = String(dx.name ?? c.name);
      const issued = String(dx.issued ?? 'Sep 28, 2026');
      const iso = parseHumanDate(issued);
      const age = iso ? daysBetween(iso, TODAY) : null;
      const fresh = age != null && age <= RESIDENCY_MAX_AGE_DAYS;
      return {
        title: REQ_DOC.res,
        issuer: 'Alder Falls Water & Power (fictional)',
        fields: [
          { label: 'Account holder', value: name },
          { label: 'Service address', value: formatAddress(c.address) },
          { label: 'Statement date', value: issued },
          { label: 'Account number', value: `40-${(s % 900000) + 100000}` },
          { label: 'Amount due', value: money(60 + (s % 90)) },
        ],
        compare: [
          compareText('Name', name, c.name, 'id'),
          ...compareAddress(c.address, c.address),
          {
            label: `Statement date (placeholder rule: within ${RESIDENCY_MAX_AGE_DAYS} days)`,
            doc: age != null ? `${issued} (${age} days ago)` : issued,
            record: `On or after ${fmtDate(addDays(TODAY, -RESIDENCY_MAX_AGE_DAYS))}`,
            result: fresh ? 'match' : 'mismatch',
            source: RULE_SOURCE,
          },
        ],
      };
    }
    case 'hh': {
      const members = Number(dx.members ?? c.hh);
      const signed = dx.signed !== false;
      const names = [c.name, ...Array.from({ length: Math.max(0, members - 1) }, (_, i) => `${pick(FIRST, s, i + 1)} ${lastName}`)];
      return {
        title: REQ_DOC.hh,
        issuer: 'Alder County Human Services · Form HM-2 (fictional)',
        fields: [
          ...names.map((n, i) => ({ label: i === 0 ? 'Member 1 (head)' : `Member ${i + 1}`, value: n })),
          { label: 'Signature', value: signed ? `Signed ${c.rdate && c.rdate <= TODAY ? fmtDate(c.rdate) : 'Oct 5, 2026'}` : 'Not signed' },
        ],
        compare: [
          compareText('Head of household', c.name, c.name, 'id'),
          compareText('People in household', String(members), String(c.hh), 'hh'),
          // PLACEHOLDER: assumes the form must be signed.
          { label: 'Signature (placeholder rule: required)', doc: signed ? 'Signed' : 'Not signed', record: 'Signed', result: signed ? 'match' : 'mismatch', source: RULE_SOURCE },
        ],
      };
    }
    case 'shl': {
      const addr = dx.addr != null ? parseAddress(String(dx.addr)) : c.address;
      const rent = 700 + (s % 14) * 65;
      const landlord = pick(LANDLORDS, s);
      return {
        title: REQ_DOC.shl,
        issuer: landlord,
        fields: [
          { label: 'Tenant', value: c.name },
          { label: 'Rental address', value: formatAddress(addr) },
          { label: 'Landlord', value: landlord },
          { label: 'Monthly rent', value: money(rent) },
          { label: 'Term', value: 'Feb 1, 2026 – Jan 31, 2027' },
        ],
        compare: [compareText('Tenant name', c.name, c.name, 'id'), ...compareAddress(addr, c.address), compareText('Monthly rent', money(rent), null)],
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
