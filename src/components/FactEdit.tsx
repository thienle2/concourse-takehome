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

/** "Pay statement received Oct 10": the source recorded when a document drives a change. */
export function documentSource(c: Case, reqKey: ReqKey): string {
  const rd = receivedDate(c, reqKey);
  return `${REQ_DOC[reqKey]}${rd ? ` received ${fmtShort(rd)}` : ''}`;
}

/**
 * Edit one case fact in place, from a row of the document comparison. Pre-filled with the
 * document's value when it differs from the case; the document is recorded as the source.
 */
export function InlineFactEditor({ c, reqKey, field, docValue, onDone }: { c: Case; reqKey: ReqKey; field: FactField; docValue: string; onDone: () => void }) {
  const { save } = useStore();
  const current = factValue(c, field) ?? '';
  const [value, setValue] = useState(docValue !== current ? docValue : current);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failed, setFailed] = useState(false);
  const id = `fe-${field}`;
  const source = documentSource(c, reqKey);
  const warning = verifiedWarning(c, field);
  const err = (k: string) => errors.find((e) => e.id === k)?.message;

  useEffect(() => document.getElementById(`${id}-value`)?.focus(), [id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const errs: FieldError[] = [];
    const checked = validateFact(field, value);
    if (checked.error) errs.push({ id: `${id}-value`, message: checked.error });
    else if ((checked.value ?? '') === current) errs.push({ id: `${id}-value`, message: 'That is already the value on the case.' });
    if (!reason.trim()) errs.push({ id: `${id}-reason`, message: 'Add a short reason for the change.' });
    else if (reason.length > 200) errs.push({ id: `${id}-reason`, message: 'Keep the reason to 200 characters.' });
    setErrors(errs);
    if (errs.length) {
      document.getElementById(errs[0].id)?.focus();
      return;
    }
    const res = save(c.id, { type: 'updateFacts', changes: [{ field, value: checked.value }], source, reason });
    if (res.ok) onDone();
    else setFailed(true);
  };

  return (
    <form className="fact-inline" onSubmit={submit} noValidate data-testid={`fact-editor-${field}`}>
      <NotSaved show={failed} />
      <div className="fact-inline-row">
        <div className="field">
          <label className="label" htmlFor={`${id}-value`}>New {FACT_LABEL[field].toLowerCase()}</label>
          <input
            id={`${id}-value`}
            className={`input${err(`${id}-value`) ? ' invalid' : ''}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode={field === 'hh' || field === 'income' ? 'numeric' : field === 'phone' ? 'tel' : undefined}
            aria-invalid={!!err(`${id}-value`) || undefined}
            aria-describedby={`${id}-ctx${err(`${id}-value`) ? ` ${id}-value-err` : ''}`}
          />
          {err(`${id}-value`) && <span className="field-error" id={`${id}-value-err`}>{err(`${id}-value`)}</span>}
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-reason`}>Reason (required)</label>
          <input
            id={`${id}-reason`}
            className={`input${err(`${id}-reason`) ? ' invalid' : ''}`}
            value={reason}
            placeholder="e.g. Household confirmed by phone"
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={!!err(`${id}-reason`) || undefined}
            aria-describedby={err(`${id}-reason`) ? `${id}-reason-err` : undefined}
          />
          {err(`${id}-reason`) && <span className="field-error" id={`${id}-reason-err`}>{err(`${id}-reason`)}</span>}
        </div>
      </div>
      <p className="hint" id={`${id}-ctx`}>
        Case has {factDisplay(field, current || null)} · document shows {factDisplay(field, docValue || null)}
        {value !== docValue && (
          <>
            {' · '}
            <button type="button" className="link-btn inline-link" onClick={() => setValue(docValue)}>Use document value</button>
          </>
        )}
      </p>
      {warning && <p className="fact-warning"><span aria-hidden="true">▲</span> {warning}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm">Save to case</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/** Correct several case facts at once, from information that came in outside a document review. */
export function CaseDetailsForm({ c, onDone, defaultSource }: { c: Case; onDone: () => void; defaultSource?: string }) {
  const { save } = useStore();
  const [values, setValues] = useState<Record<FactField, string>>(
    () => Object.fromEntries(FACT_FIELDS.map((f) => [f, factValue(c, f) ?? ''])) as Record<FactField, string>,
  );
  const [source, setSource] = useState(defaultSource ?? '');
  const sources = defaultSource ? [defaultSource, ...EDIT_SOURCES] : [...EDIT_SOURCES];
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
          {sources.map((s) => <option key={s}>{s}</option>)}
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
