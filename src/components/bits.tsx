import { useEffect, useRef, type ReactNode } from 'react';
import { daysBetween, fmtDate, fmtShort, TODAY } from '../lib/date';
import { REQ_STATUS_LABEL, STATUS_LABEL } from '../lib/labels';
import { caseStatus, isSnoozed } from '../lib/status';
import type { Case, CaseStatus, ReqStatus } from '../lib/types';

// Every status carries an icon and text, so color is never the only signal.
const STATUS_STYLE: Record<CaseStatus, { tone: string; icon: string }> = {
  review: { tone: 'tone-blue', icon: '◉' },
  missing: { tone: 'tone-red', icon: '!' },
  waiting: { tone: 'tone-amber', icon: '◷' },
  verified: { tone: 'tone-green', icon: '✓' },
  ready: { tone: 'tone-violet', icon: '➜' },
  decided: { tone: 'tone-gray', icon: '■' },
};

export function StatusPill({ c }: { c: Case }) {
  const s = caseStatus(c);
  const st = STATUS_STYLE[s];
  return (
    <span className={`pill ${st.tone}`} data-testid="case-status">
      <span className="pill-icon" aria-hidden="true">{st.icon}</span>
      {STATUS_LABEL[s]}
    </span>
  );
}

export function SnoozeTag({ c }: { c: Case }) {
  if (!isSnoozed(c)) return null;
  return <span className="cell-sub">Snoozed until {fmtShort(c.fu!)}</span>;
}

const REQ_STYLE: Record<ReqStatus, { tone: string; icon: string }> = {
  v: { tone: 'tone-green', icon: '✓' },
  r: { tone: 'tone-blue', icon: '◉' },
  a: { tone: 'tone-amber', icon: '◷' },
  m: { tone: 'tone-red', icon: '!' },
};

export function ReqPill({ s }: { s: ReqStatus }) {
  const st = REQ_STYLE[s];
  return (
    <span className={`pill req-pill ${st.tone}`}>
      <span className="pill-icon" aria-hidden="true">{st.icon}</span>
      {REQ_STATUS_LABEL[s]}
    </span>
  );
}

export function dueUrgency(c: Case): { text: string; cls: string } | null {
  if (c.decided) return null;
  const d = daysBetween(TODAY, c.due);
  if (d < 0) return { text: `Overdue ${-d} day${d === -1 ? '' : 's'}`, cls: 'urgency-overdue' };
  if (d === 0) return { text: 'Due today', cls: 'urgency-today' };
  if (d <= 7) return { text: `Due in ${d} day${d === 1 ? '' : 's'}`, cls: 'urgency-soon' };
  return null;
}

export function DueCell({ c }: { c: Case }) {
  const u = dueUrgency(c);
  return (
    <div className="due-cell">
      <span>{fmtDate(c.due)}</span>
      {u && (
        <span className={`urgency ${u.cls}`}>
          <span aria-hidden="true">{u.cls === 'urgency-soon' ? '◷' : '▲'}</span>
          {u.text}
        </span>
      )}
    </div>
  );
}

export function NotProvided() {
  return <span className="not-provided">Not provided</span>;
}

export interface FieldError {
  id: string;
  message: string;
}

/** Focuses itself when shown; each link moves focus to the field. */
export function ErrorSummary({ errors }: { errors: FieldError[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = errors.map((e) => e.id + e.message).join('|');
  useEffect(() => {
    if (errors.length) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!errors.length) return null;
  return (
    <div className="error-summary" role="alert" tabIndex={-1} ref={ref} aria-labelledby="err-summary-title">
      <h3 id="err-summary-title">There {errors.length === 1 ? 'is a problem' : `are ${errors.length} problems`}</h3>
      <ul>
        {errors.map((e) => (
          <li key={e.id + e.message}>
            <a
              href={`#${e.id}`}
              onClick={(ev) => {
                ev.preventDefault();
                document.getElementById(e.id)?.focus();
              }}
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NotSaved({ show }: { show: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (show) ref.current?.focus();
  }, [show]);
  if (!show) return null;
  return (
    <div className="notice notice-error" role="alert" tabIndex={-1} ref={ref} data-testid="not-saved">
      <span className="notice-icon" aria-hidden="true">!</span>
      <div>
        <strong>Not saved.</strong> Nothing was recorded on this case. Your entries are still here, so you can try again.
      </div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'warn' | 'info' | 'lock' | 'error'; children: ReactNode }) {
  const icon = { warn: '!', info: 'i', lock: '⚿', error: '!' }[tone];
  return (
    <div className={`notice notice-${tone}`}>
      <span className="notice-icon" aria-hidden="true">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
