// Per-requirement history. Events saved in this workspace carry their requirement (`req`).
// Events from cases.json don't, so they're matched by the requirement or document named in
// their text ("Pay statement uploaded", "Document request recorded: income ...").
import { daysBetween, fmtShort, TODAY } from './date';
import { REQ_DOC } from './labels';
import { receivedDate } from './status';
import type { Case, HistoryEvent, ReqKey } from './types';

const KEYWORDS: Record<ReqKey, string[]> = {
  inc: ['income', 'pay statement', 'employer statement'],
  id: ['identity', 'photo id'],
  res: ['residency', 'utility bill'],
  hh: ['household members'],
  shl: ['shelter costs', 'lease'],
};

/** The requirement an event is about, or null for case-level events. */
export function eventReqKey(e: HistoryEvent): ReqKey | null {
  if (e.req) return e.req;
  if (e.kind === 'note') return null; // free text; a note mentioning "income" isn't about the requirement
  const text = e.text.toLowerCase();
  for (const k of Object.keys(KEYWORDS) as ReqKey[]) if (KEYWORDS[k].some((w) => text.includes(w))) return k;
  return null;
}

export interface TimelineStep {
  date: string | null;
  text: string;
  by: string | null;
  /** True for the "where it stands now" line at the end. */
  current?: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** How long the requirement has been in its current state, when that's known. */
export function waitingDays(c: Case, k: ReqKey): number | null {
  const s = c.ver[k];
  const since = s === 'a' ? c.req[k]?.d : s === 'r' ? receivedDate(c, k) : null;
  return since ? daysBetween(since, TODAY) : null;
}

export function waitingPhrase(c: Case, k: ReqKey): string | null {
  const d = waitingDays(c, k);
  if (d == null) return null;
  return d === 0 ? 'today' : `${plural(d, 'day')} ago`;
}

/** Oldest first, ending with a line that says where the requirement stands today. */
export function requirementTimeline(c: Case, k: ReqKey): TimelineStep[] {
  const steps: TimelineStep[] = c.ev
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => eventReqKey(e) === k)
    .sort((a, b) => (a.e.date === b.e.date ? a.i - b.i : a.e.date < b.e.date ? -1 : 1))
    .map(({ e }) => ({ date: e.date, text: e.text, by: e.by }));

  const s = c.ver[k];
  const req = c.req[k];
  const rd = receivedDate(c, k);
  const days = waitingDays(c, k);

  // Fill in what the record shows when the history has no matching entry.
  if (s === 'a' && req && !steps.some((st) => st.date === req.d)) {
    steps.push({ date: req.d, text: `Requested by ${req.via.toLowerCase()}`, by: null });
  }
  if (s === 'r' && rd && !steps.some((st) => st.date === rd)) {
    steps.push({ date: rd, text: `${REQ_DOC[k]} received`, by: null });
  }
  steps.sort((a, b) => (a.date ?? '') .localeCompare(b.date ?? ''));

  const now: Record<string, string> = {
    v: c.vinfo[k] ? 'Verified' : 'Verified (no reviewer details on file)',
    r: `Waiting for your review${days != null ? ` · ${days === 0 ? 'arrived today' : `${plural(days, 'day')} since it arrived`}` : ''}`,
    a: `Waiting on the household${days != null ? ` · ${days === 0 ? 'requested today' : `${plural(days, 'day')} since the request`}` : ''}`,
    m: `Not requested from the household yet`,
  };
  if (s) steps.push({ date: null, text: now[s], by: null, current: true });
  return steps;
}

/** Short label for the toggle: "History (3)". Counts recorded entries, not the current-state line. */
export const timelineCount = (c: Case, k: ReqKey) => requirementTimeline(c, k).filter((s) => !s.current).length;

export const stepDate = (s: TimelineStep) => (s.date ? fmtShort(s.date) : 'Now');

