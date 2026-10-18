import { parseAddress, type Address } from './address';

export type ReqKey = 'inc' | 'id' | 'res' | 'hh' | 'shl';
export const REQ_KEYS: ReqKey[] = ['inc', 'id', 'res', 'hh', 'shl'];

/** v = verified, r = received and needs review, a = awaiting requested information, m = missing and not requested */
export type ReqStatus = 'v' | 'r' | 'a' | 'm';

export type CaseStatus = 'decided' | 'ready' | 'verified' | 'review' | 'missing' | 'waiting';

export interface RequestRecord {
  d: string;
  via: string;
}

export interface VerifyRecord {
  d: string;
  by: string;
  note?: string;
}

export interface HistoryEvent {
  date: string;
  text: string;
  by: string;
  kind?: 'note' | 'event' | 'undo';
  /** The requirement this entry is about, when known. */
  req?: ReqKey;
}

export type Mismatch = Record<string, string | number | boolean>;

export interface Case {
  id: string;
  name: string;
  hh: number;
  due: string;
  /** Parsed from the raw `addr` string; state and ZIP are placeholders. */
  address: Address;
  phone: string | null;
  lang: string;
  income: string | null;
  ver: Partial<Record<ReqKey, ReqStatus>>;
  req: Partial<Record<ReqKey, RequestRecord>>;
  vinfo: Partial<Record<ReqKey, VerifyRecord>>;
  fu: string | null;
  ready: boolean;
  /** Dates the worker reminded the supervisor about this case, oldest first. */
  reminders: string[];
  returned: boolean;
  locked: string | null;
  decided: string | null;
  /** When documents arrived (case level, from the data). */
  rdate: string | null;
  /** Per-requirement receipts logged in this workspace; these win over rdate. */
  rinfo: Partial<Record<ReqKey, RequestRecord>>;
  dx: Partial<Record<ReqKey, Mismatch>>;
  ev: HistoryEvent[];
}

type RawEvent = [string, string, string] | { date: string; text: string; by: string };

/** Shapes the raw cases.json record. A raw `status` field is ignored on purpose: status is always derived. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeCase(raw: any): Case {
  return {
    id: raw.id,
    name: raw.name,
    hh: raw.hh,
    due: raw.due,
    address: parseAddress(raw.addr ?? ''),
    phone: raw.phone ?? null,
    lang: raw.lang,
    income: raw.income ?? null,
    ver: raw.ver ?? {},
    req: raw.req ?? {},
    vinfo: raw.vinfo ?? {},
    fu: raw.fu ?? null,
    ready: raw.ready === true,
    reminders: raw.reminders ?? [],
    returned: raw.returned === true,
    locked: raw.locked ?? null,
    decided: raw.decided ?? null,
    rdate: raw.rdate ?? null,
    rinfo: raw.rinfo ?? {},
    dx: raw.dx ?? {},
    ev: ((raw.ev ?? []) as RawEvent[]).map((e) =>
      Array.isArray(e) ? { date: e[0], text: e[1], by: e[2], kind: 'event' as const } : { kind: 'event' as const, ...e },
    ),
  };
}
