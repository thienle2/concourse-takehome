import { addDays, fmtDate, fmtShort, TODAY } from './date';
import { REQ_DOC, REQ_LABEL, STATUS_LABEL } from './labels';
import { REQ_KEYS, type Case, type CaseStatus, type ReqKey, type ReqStatus } from './types';

const keysWith = (c: Case, s: ReqStatus) => REQ_KEYS.filter((k) => c.ver[k] === s);

/** When a requirement's document arrived, if known. */
export const receivedDate = (c: Case, k: ReqKey): string | null => c.rinfo[k]?.d ?? c.rdate;

/**
 * Case status is derived, never stored. Order matters:
 * decided > ready (all verified + ready flag) > verified > review (any r) > missing (any m) > waiting.
 */
export function caseStatus(c: Case): CaseStatus {
  if (c.decided) return 'decided';
  if (REQ_KEYS.every((k) => c.ver[k] === 'v')) return c.ready ? 'ready' : 'verified';
  if (keysWith(c, 'r').length) return 'review';
  if (keysWith(c, 'm').length) return 'missing';
  return 'waiting';
}

export const statusLabel = (c: Case) => STATUS_LABEL[caseStatus(c)];

export const isSnoozed = (c: Case) => caseStatus(c) === 'waiting' && !!c.fu && c.fu > TODAY;

export function needsAction(c: Case): boolean {
  const s = caseStatus(c);
  return s !== 'decided' && s !== 'ready' && !isSnoozed(c);
}

export const isOpen = (c: Case) => !c.decided;
export const isOverdue = (c: Case) => isOpen(c) && c.due < TODAY;
export const isDueWithin7 = (c: Case) => isOpen(c) && c.due >= TODAY && c.due <= addDays(TODAY, 7);
export const isFollowUpDue = (c: Case) => isOpen(c) && !!c.fu && c.fu <= TODAY;
export const hasOutstanding = (c: Case) => isOpen(c) && REQ_KEYS.some((k) => c.ver[k] === 'a' || c.ver[k] === 'm');
export const isReadOnly = (c: Case) => !!c.decided || !!c.locked;

export function readOnlyReason(c: Case): string | null {
  if (c.decided) return `A decision has been recorded (${c.decided}). This workspace can't change decided cases.`;
  if (c.locked) return `${c.locked} has this case open. You can read it, but changes are paused until they close it.`;
  return null;
}

export interface Guard {
  ok: boolean;
  reason: string;
}

const listLabels = (keys: ReqKey[]) => keys.map((k) => REQ_LABEL[k]).join(', ');

/** Follow-up dates are only for cases where every outstanding item has been requested. */
export function canSetFollowUp(c: Case): Guard {
  const ro = readOnlyReason(c);
  if (ro) return { ok: false, reason: ro };
  const r = keysWith(c, 'r');
  if (r.length) return { ok: false, reason: `${listLabels(r)} ${r.length > 1 ? 'are' : 'is'} waiting for your review. Review received documents before setting a follow-up date.` };
  const m = keysWith(c, 'm');
  if (m.length) return { ok: false, reason: `${listLabels(m)} ${m.length > 1 ? "haven't" : "hasn't"} been requested yet. Request it first so there is something to follow up on.` };
  if (!keysWith(c, 'a').length) return { ok: false, reason: 'No request is out to the household, so there is nothing to follow up on.' };
  return { ok: true, reason: '' };
}

/**
 * Latest allowed follow-up date. Capped at the due date while it is still ahead; once the
 * due date is today or past, any later date is allowed so an overdue case can still be
 * checked on while the household sends documents.
 */
export const followUpMax = (c: Case): string | null => (c.due > TODAY ? c.due : null);

/** Returns an error message, or '' when the date is allowed. */
export function validateFollowUpDate(c: Case, date: string): string {
  if (!date) return 'Enter a follow-up date.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter the date as month, day and year.';
  if (date <= TODAY) return `Choose a date after today (${fmtDate(TODAY)}).`;
  const max = followUpMax(c);
  if (max && date > max) return `Choose a date on or before the due date (${fmtDate(max)}).`;
  return '';
}

export function canMarkReady(c: Case): Guard {
  const ro = readOnlyReason(c);
  if (ro) return { ok: false, reason: ro };
  if (c.ready) return { ok: false, reason: 'This case is already marked ready for decision.' };
  const notV = REQ_KEYS.filter((k) => c.ver[k] !== 'v');
  if (notV.length) {
    return { ok: false, reason: `${5 - notV.length} of 5 requirements are verified. Verify ${listLabels(notV)} first.` };
  }
  return { ok: true, reason: '' };
}

// PLACEHOLDER: how close to the due date an undecided case counts as at risk. Not a program rule.
export const DECISION_RISK_DAYS = 3;

export const lastReminder = (c: Case): string | null => (c.reminders.length ? c.reminders[c.reminders.length - 1] : null);

/** Ready for decision, still undecided, and the due date is close or past. */
export const decisionAtRisk = (c: Case) => caseStatus(c) === 'ready' && c.due <= addDays(TODAY, DECISION_RISK_DAYS);

/** "past the due date" or "close to the due date", for at-risk wording. */
export const dueProximity = (c: Case) => (c.due < TODAY ? 'past the due date' : 'close to the due date');

/** A reminder is for cases waiting on a supervisor, at most once a day. */
export function canRemindSupervisor(c: Case): Guard {
  const ro = readOnlyReason(c);
  if (ro) return { ok: false, reason: ro };
  if (caseStatus(c) !== 'ready') return { ok: false, reason: 'Only cases marked ready for decision are waiting on a supervisor.' };
  if (lastReminder(c) === TODAY) return { ok: false, reason: 'You already reminded the supervisor today. You can send another tomorrow.' };
  return { ok: true, reason: '' };
}

export type NextKind = 'no-requirements' | 'remind-supervisor' | 'review' | 'request' | 'set-followup' | 'follow-up' | 'snoozed' | 'mark-ready' | 'awaiting-decision' | 'decided';

export interface NextAction {
  kind: NextKind;
  /** Button text (or short label in the queue). */
  label: string;
  reason: string;
  key?: ReqKey;
}

function requestedPhrase(c: Case, k: ReqKey): string {
  const r = c.req[k];
  return r ? `requested ${fmtShort(r.d)} by ${r.via.toLowerCase()}` : 'requested';
}

/**
 * What to do next: review a received document first, else request a missing one,
 * else set a follow-up date, else follow up, else mark ready for decision.
 */
export function nextAction(c: Case): NextAction {
  if (c.decided) return { kind: 'decided', label: 'No action', reason: c.decided };
  if (c.ready && caseStatus(c) === 'ready') {
    const sent = lastReminder(c);
    if (decisionAtRisk(c) && canRemindSupervisor(c).ok) {
      const when = c.due < TODAY ? `overdue since ${fmtShort(c.due)}` : c.due === TODAY ? 'due today' : `due ${fmtShort(c.due)}`;
      return {
        kind: 'remind-supervisor',
        label: 'Remind supervisor',
        reason: `Still waiting on a supervisor decision and the case is ${when}.${sent ? ` Last reminder ${fmtShort(sent)}.` : ' No reminder sent yet.'}`,
      };
    }
    const reminded = sent === TODAY ? ' You reminded the supervisor today.' : '';
    return { kind: 'awaiting-decision', label: 'Awaiting decision', reason: `Marked ready. A supervisor records the decision.${reminded}` };
  }
  if (!REQ_KEYS.some((k) => c.ver[k])) {
    return { kind: 'no-requirements', label: 'No requirements yet', reason: 'Nothing to review or request until requirements are set up for this case.' };
  }
  const r = keysWith(c, 'r');
  if (r.length) {
    const k = r[0];
    const rd = receivedDate(c, k);
    const when = rd ? ` arrived ${fmtShort(rd)} and` : '';
    const more = r.length > 1 ? ` ${r.length - 1} more after this.` : '';
    return { kind: 'review', label: 'Review document', key: k, reason: `${REQ_DOC[k]} for ${REQ_LABEL[k].toLowerCase()}${when} hasn't been reviewed.${more}` };
  }
  const m = keysWith(c, 'm');
  if (m.length) {
    const k = m[0];
    const more = m.length > 1 ? ` ${m.length - 1} more not requested.` : '';
    return { kind: 'request', label: 'Request document', key: k, reason: `${REQ_LABEL[k]} is missing and hasn't been requested from the household.${more}` };
  }
  const a = keysWith(c, 'a');
  if (a.length) {
    const k = a[0];
    const outstanding = `${REQ_LABEL[k]} was ${requestedPhrase(c, k)}${a.length > 1 ? ` (${a.length - 1} more outstanding)` : ''}.`;
    if (c.fu && c.fu > TODAY) {
      return { kind: 'snoozed', label: 'Change follow-up date', key: k, reason: `Waiting on the household until ${fmtShort(c.fu)}. ${outstanding}` };
    }
    if (c.fu) {
      const when = c.fu === TODAY ? 'is today' : `was ${fmtShort(c.fu)}`;
      return { kind: 'follow-up', label: 'Follow up', key: k, reason: `Follow-up date ${when}. ${outstanding}` };
    }
    return { kind: 'set-followup', label: 'Set follow-up date', key: k, reason: `${outstanding} Pick a date to check back.` };
  }
  return { kind: 'mark-ready', label: 'Mark ready for decision', reason: 'All five requirements are verified.' };
}

export function docsSummary(c: Case): { verified: number; parts: string[] } {
  const count = (s: ReqStatus) => keysWith(c, s).length;
  const parts: string[] = [];
  if (count('r')) parts.push(`${count('r')} to review`);
  if (count('m')) parts.push(`${count('m')} not requested`);
  if (count('a')) parts.push(`${count('a')} awaiting`);
  return { verified: count('v'), parts };
}

export function lastActivity(c: Case) {
  if (!c.ev.length) return null;
  return c.ev.reduce((latest, e) => (e.date >= latest.date ? e : latest));
}
