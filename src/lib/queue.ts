import { STATUS_LABEL } from './labels';
import {
  caseStatus,
  hasOutstanding,
  isDueWithin7,
  isOpen,
  isOverdue,
  isReadOnly,
  isSnoozed,
  lastActivity,
  needsAction,
} from './status';
import type { Case, CaseStatus } from './types';

export type TabKey = 'needs' | 'open' | 'overdue' | 'due7' | 'outstanding' | 'snoozed' | 'awaiting';
export type SortKey = 'due' | 'name' | 'id' | 'status' | 'last';

export interface QueueView {
  tab: TabKey;
  search: string;
  status: CaseStatus | '';
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  page: number;
}

export const DEFAULT_VIEW: QueueView = { tab: 'needs', search: '', status: '', sort: { key: 'due', dir: 'asc' }, page: 1 };
export const PAGE_SIZE = 25;

export const TABS: { key: TabKey; label: string; test: (c: Case) => boolean }[] = [
  { key: 'needs', label: 'Needs action', test: needsAction },
  { key: 'open', label: 'All open', test: isOpen },
  { key: 'overdue', label: 'Overdue', test: isOverdue },
  { key: 'due7', label: 'Due in 7 days', test: isDueWithin7 },
  { key: 'outstanding', label: 'Documents outstanding', test: hasOutstanding },
  { key: 'snoozed', label: 'Snoozed', test: isSnoozed },
  { key: 'awaiting', label: 'Awaiting decision', test: (c) => caseStatus(c) === 'ready' },
];

const STATUS_ORDER: CaseStatus[] = ['review', 'missing', 'waiting', 'verified', 'ready', 'decided'];

function matchesSearch(c: Case, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const id = c.id.toLowerCase();
  return c.name.toLowerCase().includes(s) || id.includes(s) || id.replace('rc-', '').includes(s.replace(/^rc-?/, ''));
}

export function filterCases(cases: Case[], v: QueueView): Case[] {
  const tab = TABS.find((t) => t.key === v.tab)!;
  const rows = cases.filter(
    (c) => tab.test(c) && (!v.status || caseStatus(c) === v.status) && matchesSearch(c, v.search),
  );
  const dir = v.sort.dir === 'asc' ? 1 : -1;
  const val = (c: Case): string | number => {
    switch (v.sort.key) {
      case 'due':
        return c.due;
      case 'name':
        return c.name.toLowerCase();
      case 'id':
        return c.id;
      case 'status':
        return STATUS_ORDER.indexOf(caseStatus(c));
      case 'last':
        return lastActivity(c)?.date ?? '';
    }
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x < y) return -dir;
    if (x > y) return dir;
    return a.due < b.due ? -1 : a.due > b.due ? 1 : a.id.localeCompare(b.id);
  });
}

/** A case Dana can act on now: needs action and isn't open by someone else. */
export const isWorkable = (c: Case) => needsAction(c) && !isReadOnly(c);

export const statusOptions = STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }));
