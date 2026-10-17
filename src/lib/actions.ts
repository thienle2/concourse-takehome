import { fmtDate, fmtShort, TODAY } from './date';
import { REQ_DOC, REQ_LABEL, REQ_STATUS_LABEL, STATUS_LABEL } from './labels';
import { caseStatus, isSnoozed } from './status';
import type { Case, HistoryEvent, ReqKey } from './types';

export const ME = 'You';
export const NOTE_LIMIT = 500;

export type CaseAction =
  | { type: 'verify'; key: ReqKey; note: string }
  | { type: 'reject'; key: ReqKey; reason: string; via: string }
  | { type: 'request'; key: ReqKey; via: string; note: string }
  | { type: 'receive'; key: ReqKey; via: string }
  | { type: 'setFollowUp'; date: string; note: string }
  | { type: 'markReady'; note: string }
  | { type: 'unready'; reason: string }
  | { type: 'note'; text: string };

export interface ActionResult {
  next: Case;
  /** Confirmation shown to the user. Always ends with the new case status. */
  message: string;
}

function statusSentence(c: Case): string {
  const label = STATUS_LABEL[caseStatus(c)];
  return isSnoozed(c) ? `Case status: ${label} (snoozed until ${fmtShort(c.fu!)}).` : `Case status: ${label}.`;
}

function withEvent(c: Case, text: string, kind: HistoryEvent['kind'] = 'event'): Case {
  return { ...c, ev: [...c.ev, { date: TODAY, text, by: ME, kind }] };
}

const withNote = (text: string, note: string) => (note.trim() ? `${text}. Note: ${note.trim()}` : text);

/** A new request supersedes a follow-up date that is today or already past. */
function clearPastFollowUp(c: Case): { c: Case; cleared: boolean } {
  if (c.fu && c.fu <= TODAY) return { c: { ...c, fu: null }, cleared: true };
  return { c, cleared: false };
}

export function applyAction(c: Case, a: CaseAction): ActionResult {
  let next: Case;
  let what: string;

  switch (a.type) {
    case 'verify': {
      next = {
        ...c,
        ver: { ...c.ver, [a.key]: 'v' },
        vinfo: { ...c.vinfo, [a.key]: { d: TODAY, by: ME, note: a.note.trim() || undefined } },
      };
      next = withEvent(next, withNote(`${REQ_LABEL[a.key]} verified (${REQ_DOC[a.key].toLowerCase()})`, a.note));
      what = `${REQ_LABEL[a.key]} marked verified. Requirement: ${REQ_STATUS_LABEL.v}.`;
      break;
    }
    case 'reject': {
      const cl = clearPastFollowUp({ ...c, ver: { ...c.ver, [a.key]: 'a' }, req: { ...c.req, [a.key]: { d: TODAY, via: a.via } } });
      next = withEvent(cl.c, `${REQ_DOC[a.key]} rejected: ${a.reason}. New copy requested (${a.via.toLowerCase()})`);
      what = `${REQ_DOC[a.key]} rejected and a new copy requested by ${a.via.toLowerCase()}. Nothing was actually sent. Requirement: ${REQ_STATUS_LABEL.a}.${cl.cleared ? ' Past follow-up date cleared.' : ''}`;
      break;
    }
    case 'request': {
      const again = c.ver[a.key] === 'a';
      const cl = clearPastFollowUp({ ...c, ver: { ...c.ver, [a.key]: 'a' }, req: { ...c.req, [a.key]: { d: TODAY, via: a.via } } });
      next = withEvent(cl.c, withNote(`Document request recorded${again ? ' again' : ''}: ${REQ_LABEL[a.key].toLowerCase()} (${a.via.toLowerCase()})`, a.note));
      what = `${again ? 'Another request' : 'Request'} for ${REQ_LABEL[a.key].toLowerCase()} recorded (${a.via.toLowerCase()}). Nothing was actually sent. Requirement: ${REQ_STATUS_LABEL.a}.${cl.cleared ? ' Past follow-up date cleared.' : ''}`;
      break;
    }
    case 'receive': {
      next = withEvent({ ...c, ver: { ...c.ver, [a.key]: 'r' }, rinfo: { ...c.rinfo, [a.key]: { d: TODAY, via: a.via } } }, `${REQ_DOC[a.key]} logged as received (${a.via.toLowerCase()})`);
      what = `${REQ_DOC[a.key]} logged as received. Requirement: ${REQ_STATUS_LABEL.r}.`;
      break;
    }
    case 'setFollowUp': {
      const verb = c.fu ? `changed from ${fmtDate(c.fu)} to` : 'set for';
      next = withEvent({ ...c, fu: a.date }, withNote(`Follow-up date ${verb} ${fmtDate(a.date)}`, a.note));
      what = `Follow-up date ${verb} ${fmtDate(a.date)}.`;
      break;
    }
    case 'markReady': {
      next = withEvent({ ...c, ready: true }, withNote('Marked ready for decision', a.note));
      what = 'Marked ready for decision. No decision was made.';
      break;
    }
    case 'unready': {
      next = withEvent({ ...c, ready: false }, withNote('Ready for decision taken back', a.reason));
      what = 'Ready for decision taken back.';
      break;
    }
    case 'note': {
      next = withEvent(c, a.text.trim(), 'note');
      what = 'Note added.';
      break;
    }
  }

  return { next, message: `${what} ${statusSentence(next)}` };
}

/** Restores the earlier version of a case but keeps the history, so the undo itself is on record. */
export function undoAction(prev: Case, current: Case, undoneMessage: string): ActionResult {
  const summary = undoneMessage.split('.')[0];
  const next: Case = { ...prev, ev: [...current.ev, { date: TODAY, text: `Undid: ${summary}`, by: ME, kind: 'undo' }] };
  return { next, message: `Undone: ${summary}. ${statusSentence(next)}` };
}
