import { useEffect, useRef, useState } from 'react';
import { fmtShort } from '../lib/date';
import {
  EDIT_SOURCES,
  FACT_FIELDS,
  FACT_LABEL,
  factDisplay,
  factValue,
  validateFact,
  verifiedWarning,
  type FactChange,
  type FactField,
} from '../lib/facts';
import { REQ_DOC } from '../lib/labels';
import { receivedDate } from '../lib/status';
import type { Case, ReqKey } from '../lib/types';
import { useStore } from '../state/store';
import { ErrorSummary, Notice, NotSaved, type FieldError } from './bits';
import { NoteField, noteLimitError } from './NoteField';

/** Update one case fact to what a document shows. Opened from a mismatched comparison row. */
export function RowUpdateForm({ c, reqKey, field, value, onDone }: { c: Case; reqKey: ReqKey; field: FactField; value: string; onDone: () => void }) {
  const { save } = useStore();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failed, setFailed] = useState(false);
  const id = `upd-${field}`;
  const rd = receivedDate(c, reqKey);
  const source = `${REQ_DOC[reqKey]}${rd ? ` received ${fmtShort(rd)}` : ''}`;
  const checked = validateFact(field, value);
  const warning = verifiedWarning(c, field);

  useEffect(() => document.getElementById(`${id}-reason`)?.focus(), [id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const errs: FieldError[] = [];
    if (checked.error) errs.push({ id: `${id}-reason`, message: `The document's value can't be used: ${checked.error}` });
    if (!reason.trim()) errs.push({ id: `${id}-reason`, message: 'Say why the case record should change' });
    const lim = noteLimitError(reason);
    if (lim) errs.push({ id: `${id}-reason`, message: lim });
    setErrors(errs);
    if (errs.length) return;
    const res = save(c.id, { type: 'updateFacts', changes: [{ field, value: checked.value }], source, reason });
    if (res.ok) onDone();
    else setFailed(true);
  };

  return (
    <form className="fact-form" onSubmit={submit} noValidate data-testid={`update-form-${field}`}>
      <ErrorSummary errors={errors} />
      <NotSaved show={failed} />
      <p className="fact-change">
        Change <strong>{FACT_LABEL[field].toLowerCase()}</strong> on the case from <span className="old-value">{factDisplay(field, factValue(c, field))}</span> to{' '}
        <strong>{factDisplay(field, checked.value)}</strong>
      </p>
      <p className="hint">Source: {source}. The old value stays in the case history.</p>
      {warning && <Notice tone="warn">{warning}</Notice>}
      <NoteField
        id={`${id}-reason`}
        label="Why should the record change? (required)"
        hint="For example: household confirmed the new spelling by phone."
        value={reason}
        onChange={setReason}
        error={errors.find((x) => x.id === `${id}-reason`)?.message}
        rows={2}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button type="submit" className="btn btn-primary btn-sm">Update case record</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/** Correct several case facts at once, from information that came in outside a document review. */
export function CaseDetailsForm({ c, onDone }: { c: Case; onDone: () => void }) {
  const { save } = useStore();
  const [values, setValues] = useState<Record<FactField, string>>(
    () => Object.fromEntries(FACT_FIELDS.map((f) => [f, factValue(c, f) ?? ''])) as Record<FactField, string>,
  );
  const [source, setSource] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failed, setFailed] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);

  const changed = FACT_FIELDS.filter((f) => values[f].trim() !== (factValue(c, f) ?? ''));
  const err = (id: string) => errors.find((e) => e.id === id)?.message;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const errs: FieldError[] = [];
    const changes: FactChange[] = [];
    for (const f of changed) {
      const r = validateFact(f, values[f]);
      if (r.error) errs.push({ id: `edit-${f}`, message: r.error });
      else changes.push({ field: f, value: r.value });
    }
    if (!changed.length) errs.push({ id: 'edit-name', message: 'Nothing has changed yet. Edit a detail before saving' });
    if (!source) errs.push({ id: 'edit-source', message: 'Choose where the new information came from' });
    if (!reason.trim()) errs.push({ id: 'edit-reason', message: 'Say why the case record should change' });
    const lim = noteLimitError(reason);
    if (lim) errs.push({ id: 'edit-reason', message: lim });
    setErrors(errs);
    if (errs.length) return;
    const res = save(c.id, { type: 'updateFacts', changes, source, reason });
    if (res.ok) onDone();
    else setFailed(true);
  };

  const warnings = changed.map((f) => verifiedWarning(c, f)).filter((w): w is string => !!w);

  return (
    <form className="fact-form" onSubmit={submit} noValidate data-testid="case-details-form">
      <h3 style={{ marginBottom: 4 }}>Edit case details</h3>
      <p className="hint" style={{ marginBottom: 12 }}>Every change is saved to the case history with its old value, source and reason.</p>
      <ErrorSummary errors={errors} />
      <NotSaved show={failed} />
      <div className="fact-grid">
        {FACT_FIELDS.map((f, i) => (
          <div className="field" key={f} style={{ margin: 0 }}>
            <label className="label" htmlFor={`edit-${f}`}>
              {FACT_LABEL[f]}
              {f === 'income' && <span className="hint"> (dollars per month)</span>}
              {changed.includes(f) && <span className="changed-tag"> · changed</span>}
            </label>
            {err(`edit-${f}`) && <span className="field-error" id={`edit-${f}-err`}>{err(`edit-${f}`)}</span>}
            <input
              id={`edit-${f}`}
              ref={i === 0 ? firstRef : undefined}
              className={`input${err(`edit-${f}`) ? ' invalid' : ''}`}
              inputMode={f === 'hh' || f === 'income' ? 'numeric' : f === 'phone' ? 'tel' : undefined}
              value={values[f]}
              onChange={(e) => setValues({ ...values, [f]: e.target.value })}
              aria-invalid={!!err(`edit-${f}`) || undefined}
              aria-describedby={err(`edit-${f}`) ? `edit-${f}-err` : undefined}
            />
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>State and ZIP are placeholders and follow the street and city.</p>
      {warnings.map((w) => <div key={w} style={{ marginTop: 10 }}><Notice tone="warn">{w}</Notice></div>)}
      <div className="field" style={{ marginTop: 16 }}>
        <label className="label" htmlFor="edit-source">Where did the new information come from?</label>
        {err('edit-source') && <span className="field-error">{err('edit-source')}</span>}
        <select id="edit-source" className={`select${err('edit-source') ? ' invalid' : ''}`} value={source} onChange={(e) => setSource(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">Choose a source</option>
          {EDIT_SOURCES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <NoteField id="edit-reason" label="Why is it changing? (required)" value={reason} onChange={setReason} error={err('edit-reason')} rows={2} />
      <div className="row" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary btn-sm">Save {changed.length > 1 ? `${changed.length} changes` : 'changes'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
