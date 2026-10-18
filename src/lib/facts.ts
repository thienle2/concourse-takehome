// Case facts a worker can correct, and the rules for changing them. Every change keeps the
// old value, the new value, where it came from and why, so the record stays auditable.
import { parseAddress } from './address';
import { fmtShort } from './date';
import { REQ_DOC } from './labels';
import type { Case, ReqKey } from './types';

export type FactField = 'name' | 'street' | 'city' | 'hh' | 'phone' | 'lang' | 'income';

export const FACT_FIELDS: FactField[] = ['name', 'hh', 'phone', 'lang', 'income', 'street', 'city'];

export const FACT_LABEL: Record<FactField, string> = {
  name: 'Head of household name',
  street: 'Street address',
  city: 'City',
  hh: 'Household size',
  phone: 'Phone',
  lang: 'Language',
  income: 'Monthly income',
};

/** The requirement whose document proves this fact, if any. */
export const FACT_PROOF: Partial<Record<FactField, ReqKey>> = { name: 'id', street: 'res', city: 'res', hh: 'hh', income: 'inc' };

// PLACEHOLDER: where an off-workspace correction came from. Invented options.
export const EDIT_SOURCES = ['Phone call with household', 'In-person visit', 'Document on file', 'Other'] as const;

export interface FactEdit {
  field: FactField;
  from: string | null;
  to: string | null;
  d: string;
  by: string;
  source: string;
  reason: string;
}

export interface FactChange {
  field: FactField;
  /** Already validated and normalized (see validateFact). */
  value: string | null;
}

const parseMoney = (s: string | null) => {
  const m = s ? /\$?([\d,]+(?:\.\d+)?)/.exec(s) : null;
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

/** The fact as stored, in the form the edit input uses. */
export function factValue(c: Case, f: FactField): string | null {
  switch (f) {
    case 'name':
      return c.name;
    case 'street':
      return c.address.street;
    case 'city':
      return c.address.city;
    case 'hh':
      return String(c.hh);
    case 'phone':
      return c.phone;
    case 'lang':
      return c.lang;
    case 'income': {
      const n = parseMoney(c.income);
      return n == null ? null : String(n);
    }
  }
}

/** How the fact reads on screen. */
export function factDisplay(f: FactField, v: string | null): string {
  if (v == null || v === '') return 'Not provided';
  if (f === 'income') return `$${Number(v).toLocaleString('en-US')} per month`;
  if (f === 'hh') return `${v} ${v === '1' ? 'person' : 'people'}`;
  return v;
}

/** Checks and normalizes a new value. Blank is allowed only where the record can be empty. */
export function validateFact(f: FactField, raw: string): { value: string | null; error: string } {
  const v = raw.trim();
  switch (f) {
    case 'name':
      if (!v) return { value: null, error: 'Enter the head of household’s name.' };
      if (v.length > 100) return { value: null, error: 'Names can be 100 characters at most.' };
      return { value: v.replace(/\s+/g, ' '), error: '' };
    case 'street':
      return v ? { value: v, error: '' } : { value: null, error: 'Enter the street address.' };
    case 'city':
      return v ? { value: v, error: '' } : { value: null, error: 'Enter the city.' };
    case 'lang':
      return v ? { value: v, error: '' } : { value: null, error: 'Enter the household’s language.' };
    case 'hh': {
      if (!/^\d+$/.test(v)) return { value: null, error: 'Enter household size as a whole number.' };
      const n = Number(v);
      if (n < 1 || n > 20) return { value: null, error: 'Household size must be between 1 and 20.' };
      return { value: String(n), error: '' };
    }
    case 'phone': {
      if (!v) return { value: null, error: '' };
      const digits = v.replace(/\D/g, '');
      if (digits.length !== 10) return { value: null, error: 'Enter a 10-digit phone number, like (555) 555-0123, or leave it blank.' };
      return { value: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`, error: '' };
    }
    case 'income': {
      if (!v) return { value: null, error: '' };
      const n = parseMoney(v);
      if (n == null || !/^\$?[\d,]+(\.\d{1,2})?$/.test(v)) return { value: null, error: 'Enter a monthly amount in dollars, like 2,640, or leave it blank.' };
      return { value: String(Math.round(n)), error: '' };
    }
  }
}

/** Writes one fact onto the case. */
export function applyFact(c: Case, f: FactField, v: string | null): Case {
  switch (f) {
    case 'name':
      return { ...c, name: v ?? c.name };
    case 'street':
      return { ...c, address: parseAddress(`${v ?? ''}, ${c.address.city}`) };
    case 'city':
      return { ...c, address: { ...parseAddress(`${c.address.street}, ${v ?? ''}`) } };
    case 'hh':
      return { ...c, hh: Number(v) };
    case 'phone':
      return { ...c, phone: v };
    case 'lang':
      return { ...c, lang: v ?? c.lang };
    case 'income':
      return { ...c, income: v == null ? null : `$${Number(v).toLocaleString('en-US')} per month, updated` };
  }
}

export const lastEdit = (c: Case, f: FactField): FactEdit | null => [...c.edits].reverse().find((e) => e.field === f) ?? null;

/** Warning shown before changing a fact that a verified document backs. */
export function verifiedWarning(c: Case, f: FactField): string | null {
  const k = FACT_PROOF[f];
  if (!k || c.ver[k] !== 'v' || lastEdit(c, f)) return null;
  return `${FACT_LABEL[f]} was verified from the ${REQ_DOC[k].charAt(0).toLowerCase() + REQ_DOC[k].slice(1)}. The new value won't be verified; comparisons will show it as updated by you.`;
}

export const editLabel = (e: FactEdit) => `Updated ${fmtShort(e.d)} by ${e.by === 'You' ? 'you' : e.by} · ${e.source}`;
