// A plain-language summary of a case, built only from the case data. It says what is
// true now; it never recommends an eligibility outcome.
import { daysBetween, fmtShort, TODAY } from './date';
import { REQ_DOC, REQ_LABEL } from './labels';
import { caseStatus, isSnoozed, lastActivity, receivedDate } from './status';
import { waitingDays } from './timeline';
import { REQ_KEYS, type Case, type ReqKey, type ReqStatus } from './types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const docName = (k: ReqKey) => REQ_DOC[k].charAt(0).toLowerCase() + REQ_DOC[k].slice(1);
const keysWith = (c: Case, s: ReqStatus) => REQ_KEYS.filter((k) => c.ver[k] === s);

function timing(c: Case): string {
  const d = daysBetween(TODAY, c.due);
  if (d < 0) return `Overdue by ${plural(-d, 'day')} (was due ${fmtShort(c.due)})`;
  if (d === 0) return `Due today`;
  return `Due ${fmtShort(c.due)} (in ${plural(d, 'day')})`;
}

/** Date the case was marked ready, from the history. */
function readyDate(c: Case): string | null {
  const hit = [...c.ev].reverse().find((e) => /marked ready for decision/i.test(e.text));
  return hit?.date ?? null;
}

/** Sentence 1: timing and overall stage. */
function headline(c: Case): string {
  const s = caseStatus(c);
  if (s === 'decided') return `${c.decided}. All ${REQ_KEYS.length} requirements were verified.`;
  const verified = keysWith(c, 'v').length;
  const total = REQ_KEYS.filter((k) => c.ver[k]).length;
  if (s === 'ready') {
    const rd = readyDate(c);
    return `${timing(c)}. All ${total} requirements verified and marked ready for decision${rd ? ` ${fmtShort(rd)}` : ''}; a supervisor makes the decision.`;
  }
  if (!total) return `${timing(c)}. No requirements are set up for this case yet.`;
  return `${timing(c)}. ${verified} of ${total} requirements verified.`;
}

/** Sentence 2: what's outstanding, grouped by what it's waiting on. */
function outstanding(c: Case): string | null {
  const parts: string[] = [];

  const r = keysWith(c, 'r');
  if (r.length) {
    const items = r.map((k) => {
      const rd = receivedDate(c, k);
      return `${docName(k)}${rd ? ` (arrived ${fmtShort(rd)})` : ''}`;
    });
    parts.push(`${cap(joinList(items))} ${r.length === 1 ? 'is' : 'are'} waiting for your review`);
  }

  const m = keysWith(c, 'm');
  if (m.length) {
    parts.push(`${joinList(m.map((k) => REQ_LABEL[k].toLowerCase()))} ${m.length === 1 ? "hasn't" : "haven't"} been requested yet`);
  }

  const a = keysWith(c, 'a');
  if (a.length) {
    const items = a.map((k) => {
      const days = waitingDays(c, k);
      return `${REQ_LABEL[k].toLowerCase()}${days != null ? ` (requested ${days === 0 ? 'today' : `${plural(days, 'day')} ago`})` : ''}`;
    });
    let text = `waiting on the household for ${joinList(items)}`;
    if (isSnoozed(c)) text += `; snoozed until ${fmtShort(c.fu!)}`;
    else if (c.fu) text += c.fu === TODAY ? '; follow-up is due today' : `; follow-up was due ${fmtShort(c.fu)}`;
    else text += '; no follow-up date set';
    parts.push(text);
  }

  if (!parts.length) {
    return caseStatus(c) === 'verified' ? "Everything is verified. It hasn't been marked ready for decision yet." : null;
  }
  return `${parts.map(cap).join('. ')}.`;
}

/** Sentence 3: things to know before contacting the household or acting. */
function flags(c: Case): string | null {
  const items: string[] = [];
  if (c.locked) items.push(`${c.locked} has the case open`);
  if (c.returned) items.push('mail to this address came back undeliverable');
  if (!c.phone) items.push('no phone number on file');
  if (c.lang && c.lang !== 'English') items.push(`the household's language is ${c.lang}`);
  if (!c.income) items.push('no income reported');
  const last = lastActivity(c);
  const lastText = last ? `Last activity ${fmtShort(last.date)}: ${last.text.replace(/\.$/, '')} (${last.by === 'You' ? 'you' : last.by}).` : 'No activity recorded yet.';
  return items.length ? `Note: ${joinList(items)}. ${lastText}` : lastText;
}

/** Up to three sentences: where the case stands, what's outstanding, what to know. */
export function caseSummary(c: Case): string[] {
  return [headline(c), outstanding(c), flags(c)].filter((s): s is string => !!s);
}
