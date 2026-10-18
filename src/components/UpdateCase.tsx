import { useEffect, useState } from 'react';
import { addDays, fmtDate, TODAY } from '../lib/date';
import { canMarkReady, canRemindSupervisor, canSetFollowUp, decisionAtRisk, dueProximity, followUpMax, isSnoozed, lastReminder, readOnlyReason, validateFollowUpDate } from '../lib/status';
import type { Case } from '../lib/types';
import { useStore } from '../state/store';
import { ErrorSummary, NotSaved, type FieldError } from './bits';
import { NoteField, noteLimitError } from './NoteField';

export type UpdateOpen = 'followup' | 'ready' | 'remind' | null;

interface Props {
  c: Case;
  open: UpdateOpen;
  setOpen: (o: UpdateOpen) => void;
}

export function UpdateCase({ c, open, setOpen }: Props) {
  const ro = readOnlyReason(c);
  return (
    <section className="card" aria-labelledby="update-title" id="update-case">
      <div className="card-head">
        <h2 id="update-title">Update case</h2>
        <span className="small muted">This workspace never approves or denies anything.</span>
      </div>
      {ro ? (
        <p className="blocked">{ro}</p>
      ) : (
        <div className="update-grid">
          <FollowUpBox c={c} open={open === 'followup'} setOpen={(o) => setOpen(o ? 'followup' : null)} />
          <ReadyBox c={c} open={open === 'ready'} setOpen={(o) => setOpen(o ? 'ready' : null)} />
          {c.ready && <RemindBox c={c} open={open === 'remind'} setOpen={(o) => setOpen(o ? 'remind' : null)} />}
        </div>
      )}
    </section>
  );
}

function FollowUpBox({ c, open, setOpen }: { c: Case; open: boolean; setOpen: (o: boolean) => void }) {
  const { save } = useStore();
  const guard = canSetFollowUp(c);
  const max = followUpMax(c);
  const [date, setDate] = useState(c.fu && c.fu > TODAY ? c.fu : '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (open) document.getElementById('fu-date')?.focus();
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const errs: FieldError[] = [];
    const dErr = validateFollowUpDate(c, date);
    if (dErr) errs.push({ id: 'fu-date', message: dErr });
    const lim = noteLimitError(note);
    if (lim) errs.push({ id: 'fu-note', message: lim });
    setErrors(errs);
    if (errs.length) return;
    const res = save(c.id, { type: 'setFollowUp', date, note });
    if (res.ok) {
      setOpen(false);
      setNote('');
      setErrors([]);
    } else setFailed(true);
  };

  const dateErr = errors.find((e) => e.id === 'fu-date')?.message;
  const current = c.fu ? `${fmtDate(c.fu)}${isSnoozed(c) ? ' (snoozed until then)' : c.fu <= TODAY ? ' (due now)' : ''}` : 'None set';

  return (
    <div className="update-box" data-testid="followup-box">
      <h3>Follow-up date</h3>
      <p className="small">Current: <strong>{current}</strong></p>
      {!guard.ok ? (
        <>
          <button type="button" className="btn" aria-disabled="true" aria-describedby="fu-blocked" onClick={(e) => e.preventDefault()}>
            {c.fu ? 'Change follow-up date' : 'Set follow-up date'}
          </button>
          <p className="blocked" id="fu-blocked" data-testid="followup-blocked">{guard.reason}</p>
        </>
      ) : !open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          {c.fu ? 'Change follow-up date' : 'Set follow-up date'}
        </button>
      ) : (
        <form onSubmit={submit} noValidate>
          <ErrorSummary errors={errors} />
          <NotSaved show={failed} />
          <div className="field">
            <label className="label" htmlFor="fu-date">Follow up on</label>
            <span className="hint" id="fu-date-hint">
              {max
                ? `After today and on or before the due date (${fmtDate(max)}). The case is snoozed until then.`
                : `This case is overdue (due ${fmtDate(c.due)}). Pick any date after today to check back; the case is snoozed until then.`}
            </span>
            {dateErr && <span className="field-error" id="fu-date-err">{dateErr}</span>}
            <input
              id="fu-date"
              type="date"
              className={`input${dateErr ? ' invalid' : ''}`}
              value={date}
              min={addDays(TODAY, 1)}
              max={max ?? undefined}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!dateErr || undefined}
              aria-describedby={`fu-date-hint${dateErr ? ' fu-date-err' : ''}`}
            />
          </div>
          <NoteField id="fu-note" label="Note (optional)" value={note} onChange={setNote} error={errors.find((e) => e.id === 'fu-note')?.message} rows={2} />
          <div className="row" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">Save follow-up date</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setErrors([]); setFailed(false); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ReadyBox({ c, open, setOpen }: { c: Case; open: boolean; setOpen: (o: boolean) => void }) {
  const { save } = useStore();
  const guard = canMarkReady(c);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (open) document.getElementById('ready-note')?.focus();
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const lim = noteLimitError(note);
    const errs = lim ? [{ id: 'ready-note', message: lim }] : [];
    setErrors(errs);
    if (errs.length) return;
    const res = save(c.id, c.ready ? { type: 'unready', reason: note } : { type: 'markReady', note });
    if (res.ok) {
      setOpen(false);
      setNote('');
    } else setFailed(true);
  };

  return (
    <div className="update-box" data-testid="ready-box">
      <h3>Ready for decision</h3>
      <p className="small">
        {c.ready ? 'Marked ready. A supervisor records the decision.' : 'Tells a supervisor the case is ready. It does not approve or deny anything.'}
      </p>
      {!c.ready && !guard.ok ? (
        <>
          <button type="button" className="btn" aria-disabled="true" aria-describedby="ready-blocked" onClick={(e) => e.preventDefault()}>
            Mark ready for decision
          </button>
          <p className="blocked" id="ready-blocked" data-testid="ready-blocked">{guard.reason}</p>
        </>
      ) : !open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          {c.ready ? 'Take back' : 'Mark ready for decision'}
        </button>
      ) : (
        <form onSubmit={submit} noValidate>
          <ErrorSummary errors={errors} />
          <NotSaved show={failed} />
          <NoteField
            id="ready-note"
            label={c.ready ? 'Why are you taking it back? (optional)' : 'Note for the supervisor (optional)'}
            value={note}
            onChange={setNote}
            error={errors[0]?.message}
            rows={2}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">{c.ready ? 'Take back ready for decision' : 'Confirm ready for decision'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setErrors([]); setFailed(false); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function RemindBox({ c, open, setOpen }: { c: Case; open: boolean; setOpen: (o: boolean) => void }) {
  const { save } = useStore();
  const guard = canRemindSupervisor(c);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failed, setFailed] = useState(false);
  const last = lastReminder(c);

  useEffect(() => {
    if (open) document.getElementById('remind-note')?.focus();
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const lim = noteLimitError(note);
    const errs = lim ? [{ id: 'remind-note', message: lim }] : [];
    setErrors(errs);
    if (errs.length) return;
    const res = save(c.id, { type: 'remindSupervisor', note });
    if (res.ok) {
      setOpen(false);
      setNote('');
    } else setFailed(true);
  };

  return (
    <div className="update-box" data-testid="remind-box">
      <h3>Supervisor reminder</h3>
      <p className="small">
        {decisionAtRisk(c) ? <strong>The decision is still pending {dueProximity(c)} ({fmtDate(c.due)}). </strong> : null}
        Last reminder: <strong>{last ? `${fmtDate(last)}${c.reminders.length > 1 ? ` (${c.reminders.length} sent)` : ''}` : 'None sent'}</strong>
      </p>
      {!guard.ok ? (
        <>
          <button type="button" className="btn" aria-disabled="true" aria-describedby="remind-blocked" onClick={(e) => e.preventDefault()}>
            Remind supervisor
          </button>
          <p className="blocked" id="remind-blocked" data-testid="remind-blocked">{guard.reason}</p>
        </>
      ) : !open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>Remind supervisor</button>
      ) : (
        <form onSubmit={submit} noValidate>
          <ErrorSummary errors={errors} />
          <NotSaved show={failed} />
          <NoteField
            id="remind-note"
            label="Message for the supervisor (optional)"
            hint="Records a reminder on the case. Nothing is actually sent from this prototype."
            value={note}
            onChange={setNote}
            error={errors[0]?.message}
            rows={2}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">Send reminder</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setErrors([]); setFailed(false); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
