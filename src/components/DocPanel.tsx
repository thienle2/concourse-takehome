import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { formatAddress } from '../lib/address';
import { fmtDate } from '../lib/date';
import { buildDocument, hasMismatch, trustSummary, type CompareRow, type DocTable, type Trust } from '../lib/documents';
import { REJECT_REASONS, REQ_ASK, REQ_DOC, REQ_LABEL, REQUEST_CHANNELS } from '../lib/labels';
import { isReadOnly, readOnlyReason, receivedDate } from '../lib/status';
import type { Case, ReqKey } from '../lib/types';
import { formatBytes, isImage, type Attachment } from '../lib/attachments';
import { useStore } from '../state/store';
import { ErrorSummary, Notice, NotSaved, ReqPill, type FieldError } from './bits';
import { InlineFactEditor } from './FactEdit';
import { NoteField, noteLimitError } from './NoteField';

export type PopMode = 'review' | 'view' | 'request';

interface Props {
  c: Case;
  mode: PopMode;
  reqKey: ReqKey;
  onClose: () => void;
}

/** Result wording says what the match is worth: a match against a self-reported value proves less. */
function resultFor(r: CompareRow): { text: string; icon: string; tone: string } {
  if (r.result === 'none' || !r.source) return { text: 'Not on record', icon: '–', tone: 'tone-gray' };
  const ok = r.result === 'match';
  switch (r.source.trust) {
    case 'verified':
      return ok ? { text: 'Matches verified record', icon: '✓', tone: 'tone-green' } : { text: 'Does not match verified record', icon: '✕', tone: 'tone-red' };
    case 'self-reported':
      return ok ? { text: 'Matches self-reported value', icon: '≈', tone: 'tone-blue' } : { text: 'Does not match self-reported value', icon: '✕', tone: 'tone-red' };
    case 'updated':
      return ok ? { text: 'Matches value you updated', icon: '✎', tone: 'tone-amber' } : { text: 'Does not match value you updated', icon: '✕', tone: 'tone-red' };
    case 'rule':
      return ok ? { text: 'Meets rule', icon: '✓', tone: 'tone-green' } : { text: 'Does not meet rule', icon: '✕', tone: 'tone-red' };
  }
}

const SOURCE_ICON: Record<Trust, string> = { verified: '✓', 'self-reported': '◌', updated: '✎', rule: '§' };

// PLACEHOLDER: the three confirmations are invented wording, not an agency checklist.
const CONFIRMATIONS = [
  'The document is readable and complete.',
  'It belongs to someone in this household.',
  'I compared each detail with what it is checked against.',
];

export function DocPanel({ c, mode, reqKey, onClose }: Props) {
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headRef.current?.focus(), [mode, reqKey]);

  const status = c.ver[reqKey] ?? 'm';
  const title =
    mode === 'request'
      ? `${status === 'a' ? 'Send another request' : 'Request document'}: ${REQ_LABEL[reqKey].toLowerCase()}`
      : mode === 'review'
        ? `Review ${REQ_DOC[reqKey].toLowerCase()}`
        : REQ_DOC[reqKey];

  return (
    <aside className="popout" aria-labelledby="popout-title" data-testid="popout">
      <div className="popout-head">
        <div>
          <div className="small muted">{REQ_LABEL[reqKey]} · {c.name}</div>
          <h2 id="popout-title" tabIndex={-1} ref={headRef}>{title}</h2>
          <div style={{ marginTop: 6 }}><ReqPill s={status} /></div>
        </div>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          Close <kbd aria-hidden="true">Esc</kbd>
        </button>
      </div>
      <div className="popout-body">
        {mode === 'request' ? (
          <RequestForm c={c} reqKey={reqKey} onDone={onClose} />
        ) : (
          <DocumentView c={c} reqKey={reqKey} mode={mode} onDone={onClose} />
        )}
      </div>
    </aside>
  );
}

function DocumentView({ c, reqKey, mode, onDone }: { c: Case; reqKey: ReqKey; mode: 'review' | 'view'; onDone: () => void }) {
  const doc = useMemo(() => buildDocument(c, reqKey), [c, reqKey]);
  // The comparison row whose case value is being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const rowId = (label: string) => `cmp-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  /** Opens a row's editor from the differences summary and brings it into view. */
  const editFromSummary = (label: string) => {
    setEditing(label);
    requestAnimationFrame(() => document.getElementById(rowId(label))?.scrollIntoView({ block: 'center' }));
  };
  const canUpdate = !isReadOnly(c);
  const vinfo = c.vinfo[reqKey];
  const status = c.ver[reqKey];
  return (
    <>
      {mode === 'view' && status === 'r' && isReadOnly(c) && <Notice tone="lock">{readOnlyReason(c)} This document hasn't been reviewed.</Notice>}
      <section className="diffs" aria-labelledby="diffs-title" data-testid="differences">
        <DifferencesSummary doc={doc} />
        {doc.compare.some((r) => r.result === 'mismatch') && (
          <ul className="diff-list">
            {doc.compare
              .filter((r) => r.result === 'mismatch')
              .map((r) => (
                <li key={r.label}>
                  <div className="diff-row">
                    <div>
                      <div className="diff-label">{r.label}</div>
                      <div className="small">
                        Document: <strong>{r.doc}</strong> · {r.source?.trust === 'rule' ? 'Rule' : 'Case'}: <strong>{r.record}</strong>
                      </div>
                    </div>
                    {r.update && canUpdate ? (
                      <button type="button" className="btn btn-sm" onClick={() => editFromSummary(r.label)}>
                        Edit<span className="sr-only"> {r.label.toLowerCase()} on the case</span>
                      </button>
                    ) : r.source?.trust === 'rule' ? (
                      <span className="small muted">Can't be fixed on the case. Reject or request a new copy.</span>
                    ) : null}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
      {!!c.rinfo[reqKey]?.files?.length && <AttachedFiles files={c.rinfo[reqKey]!.files!} />}
      <figure className="paper" style={{ margin: 0 }} aria-label={`${doc.title} (sample document)`}>
        <span className="paper-watermark">Sample · fictional</span>
        <div className="paper-issuer">{doc.issuer}</div>
        {doc.issuerDetail && <div className="paper-issuer-detail">{doc.issuerDetail}</div>}
        <div className="paper-title">{doc.title}</div>
        {doc.sections.map((sec, i) => (
          <Fragment key={sec.heading}>
            <section className="paper-section">
              <h4>{sec.heading}</h4>
              <dl>
                {sec.fields.map((f) => (
                  <div key={f.label} style={{ display: 'contents' }}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {doc.tables.filter((t) => t.afterSection === i).map((t) => <PaperTable key={t.heading} t={t} />)}
          </Fragment>
        ))}
        {doc.tables.filter((t) => t.afterSection == null || t.afterSection >= doc.sections.length).map((t) => <PaperTable key={t.heading} t={t} />)}
        {doc.footer && <p className="paper-footer">{doc.footer}</p>}
        {receivedDate(c, reqKey) && <figcaption className="small muted" style={{ marginTop: 12 }}>Received {fmtDate(receivedDate(c, reqKey)!)}</figcaption>}
      </figure>

      <section aria-labelledby="compare-title">
        <h3 id="compare-title">What this document is checked against</h3>
        <p className="trust-summary" data-testid="trust-summary">{trustSummary(doc)}</p>
        <p className="hint" style={{ marginBottom: 8 }}>
          <strong>Verified</strong> means an earlier, different document already confirmed the value. <strong>Self-reported</strong> means
          it's what the household told us and hasn't been checked yet.
        </p>
        <table className="compare" data-testid="compare">
          <thead>
            <tr>
              <th scope="col">Detail</th>
              <th scope="col">On document</th>
              <th scope="col">Compared against</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {doc.compare.map((r) => (
              <Fragment key={r.label}>
              <tr id={rowId(r.label)} className={r.result === 'mismatch' ? 'is-mismatch' : undefined}>
                <th scope="row" style={{ fontWeight: 500, fontSize: 14, color: 'var(--ink)' }}>{r.label}</th>
                <td data-label="On document">{r.doc}</td>
                <td data-label="Compared against">
                  {r.record ?? <span className="not-provided">Not provided</span>}
                  {r.source && (
                    <span className={`source source-${r.source.trust}`}>
                      <span aria-hidden="true">{SOURCE_ICON[r.source.trust]}</span> {r.source.label}
                    </span>
                  )}
                  {r.update && canUpdate && editing !== r.label && (
                    <button
                      type="button"
                      className={`btn btn-sm edit-cell${r.result === 'mismatch' ? ' edit-mismatch' : ''}`}
                      onClick={() => setEditing(r.label)}
                    >
                      <span aria-hidden="true">✎</span> Edit<span className="sr-only"> {r.label.toLowerCase()} on the case</span>
                    </button>
                  )}
                </td>
                <td data-label="Result">
                  <span className={`pill pill-wrap ${resultFor(r).tone}`}>
                    <span className="pill-icon" aria-hidden="true">{resultFor(r).icon}</span>
                    {resultFor(r).text}
                  </span>
                </td>
              </tr>
              {editing === r.label && r.update && (
                <tr className="update-row">
                  <td colSpan={4}>
                    <InlineFactEditor c={c} reqKey={reqKey} field={r.update.field} docValue={r.update.value} onDone={() => setEditing(null)} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      {mode === 'view' && status === 'v' && (
        <Notice tone="info">
          {vinfo ? (
            <>
              Verified {fmtDate(vinfo.d)} by {vinfo.by === 'You' ? 'you' : vinfo.by}.{vinfo.note && <> Note: {vinfo.note}</>}
            </>
          ) : (
            'Verified before these records were kept. No reviewer details on file.'
          )}
        </Notice>
      )}

      {mode === 'review' && <ReviewForm c={c} reqKey={reqKey} mismatch={hasMismatch(doc)} onDone={onDone} />}
    </>
  );
}

function ReviewForm({ c, reqKey, mismatch, onDone }: { c: Case; reqKey: ReqKey; mismatch: boolean; onDone: () => void }) {
  const { save } = useStore();
  const [checks, setChecks] = useState([false, false, false]);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [via, setVia] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failed, setFailed] = useState(false);
  const errFor = (id: string) => errors.find((e) => e.id === id)?.message;

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const errs: FieldError[] = [];
    checks.forEach((ok, i) => !ok && errs.push({ id: `confirm-${i}`, message: `Confirm: ${CONFIRMATIONS[i].replace(/\.$/, '').toLowerCase()}` }));
    if (mismatch && !note.trim()) errs.push({ id: 'review-note', message: 'Add a note explaining why you are verifying a document with a detail that does not match' });
    const lim = noteLimitError(note);
    if (lim) errs.push({ id: 'review-note', message: lim });
    setErrors(errs);
    if (errs.length) return;
    const res = save(c.id, { type: 'verify', key: reqKey, note });
    if (res.ok) onDone();
    else setFailed(true);
  };

  const reject = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const errs: FieldError[] = [];
    if (!reason) errs.push({ id: 'reject-reason', message: 'Choose a reason for rejecting the document' });
    if (reason === 'Other' && !other.trim()) errs.push({ id: 'reject-other', message: 'Describe the reason' });
    const lim = noteLimitError(other);
    if (lim) errs.push({ id: 'reject-other', message: lim });
    if (!via) errs.push({ id: 'reject-via-0', message: 'Choose how the new copy is being requested' });
    setErrors(errs);
    if (errs.length) return;
    const full = reason === 'Other' ? other.trim() : other.trim() ? `${reason} (${other.trim()})` : reason;
    const res = save(c.id, { type: 'reject', key: reqKey, reason: full, via });
    if (res.ok) onDone();
    else setFailed(true);
  };

  return (
    <div>
      <ErrorSummary errors={errors} />
      <NotSaved show={failed} />
      {!rejecting ? (
        <form onSubmit={verify} noValidate data-testid="verify-form">
          <fieldset>
            <legend className="label">Before you verify, confirm all three</legend>
            {CONFIRMATIONS.map((text, i) => (
              <label key={i} className="check">
                <input
                  type="checkbox"
                  id={`confirm-${i}`}
                  checked={checks[i]}
                  aria-invalid={!!errFor(`confirm-${i}`) || undefined}
                  onChange={(e) => setChecks(checks.map((v, j) => (j === i ? e.target.checked : v)))}
                />
                <span>
                  {text}
                  {errFor(`confirm-${i}`) && <span className="field-error" style={{ marginTop: 4 }}>Required</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <div style={{ marginTop: 12 }}>
            <NoteField
              id="review-note"
              label={mismatch ? 'Note (required: a detail does not match)' : 'Note (optional)'}
              hint={mismatch ? 'Explain why this document still verifies the requirement, or reject it instead.' : undefined}
              value={note}
              onChange={setNote}
              error={errFor('review-note')}
            />
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary">Mark verified</button>
            <button type="button" className="btn btn-danger" onClick={() => { setErrors([]); setRejecting(true); }}>
              Reject document
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={reject} noValidate data-testid="reject-form">
          <h3 style={{ marginBottom: 12 }}>Reject and request a new copy</h3>
          <div className="field">
            <label className="label" htmlFor="reject-reason">Reason</label>
            {errFor('reject-reason') && <span className="field-error">{errFor('reject-reason')}</span>}
            <select id="reject-reason" className={`select${errFor('reject-reason') ? ' invalid' : ''}`} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason</option>
              {REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <NoteField
            id="reject-other"
            label={reason === 'Other' ? 'Describe the reason' : 'More detail (optional)'}
            value={other}
            onChange={setOther}
            error={errFor('reject-other')}
            rows={2}
          />
          <ChannelPicker c={c} name="reject-via" value={via} onChange={setVia} error={errFor('reject-via-0')} legend="Request the new copy by" />
          <p className="hint" style={{ marginTop: 12 }}>This records the request. Nothing is actually sent from this prototype.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-danger">Reject and record request</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setErrors([]); setRejecting(false); }}>
              Back to review
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ChannelPicker({ c, name, value, onChange, error, legend }: { c: Case; name: string; value: string; onChange: (v: string) => void; error?: string; legend: string }) {
  return (
    <fieldset className="radio-group" style={{ marginTop: 16 }} aria-describedby={error ? `${name}-err` : undefined}>
      <legend>{legend}</legend>
      {error && <span className="field-error" id={`${name}-err`}>{error}</span>}
      {REQUEST_CHANNELS.map((ch, i) => {
        const noPhone = ch.startsWith('Phone') && !c.phone;
        const mailWarn = ch === 'Mailed letter' && c.returned;
        return (
          <label key={ch} className="check" style={noPhone ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
            <input type="radio" id={`${name}-${i}`} name={name} value={ch} checked={value === ch} disabled={noPhone} onChange={() => onChange(ch)} />
            <span>
              {ch}
              {noPhone && <span className="hint" style={{ display: 'block' }}>Unavailable: no phone number on file.</span>}
              {mailWarn && <span className="hint" style={{ display: 'block', color: 'var(--amber)' }}>Mail to this address was returned.</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function RequestForm({ c, reqKey, onDone }: { c: Case; reqKey: ReqKey; onDone: () => void }) {
  const { save } = useStore();
  const [via, setVia] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failed, setFailed] = useState(false);
  const existing = c.req[reqKey];
  const again = c.ver[reqKey] === 'a';
  const errFor = (id: string) => errors.find((e) => e.id === id)?.message;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const errs: FieldError[] = [];
    if (!via) errs.push({ id: 'req-via-0', message: 'Choose how you are requesting the document' });
    const lim = noteLimitError(note);
    if (lim) errs.push({ id: 'req-note', message: lim });
    setErrors(errs);
    if (errs.length) return;
    const res = save(c.id, { type: 'request', key: reqKey, via, note });
    if (res.ok) onDone();
    else setFailed(true);
  };

  return (
    <>
      <section aria-labelledby="existing-title">
        <h3 id="existing-title" style={{ marginBottom: 8 }}>Requests so far</h3>
        {existing ? (
          <Notice tone="info" >
            Requested {fmtDate(existing.d)} by {existing.via.toLowerCase()}.
            {c.fu && <> Follow-up date: {fmtDate(c.fu)}.</>}
          </Notice>
        ) : (
          <p className="muted">No request has been recorded for {REQ_LABEL[reqKey].toLowerCase()} yet.</p>
        )}
      </section>

      {c.returned && (
        <Notice tone="warn">
          <strong>A notice to this household was returned as undeliverable.</strong> A mailed letter to {formatAddress(c.address)} may not reach them. Consider a portal
          message{c.phone ? ' or a phone call' : ''}, and confirm the address.
        </Notice>
      )}

      <form onSubmit={submit} noValidate data-testid="request-form">
        <ErrorSummary errors={errors} />
        <NotSaved show={failed} />
        <div className="field">
          <span className="label">What to ask for</span>
          <p>{REQ_ASK[reqKey]}</p>
          <span className="hint">Placeholder wording, not program guidance.</span>
        </div>
        <ChannelPicker c={c} name="req-via" value={via} onChange={setVia} error={errFor('req-via-0')} legend="Request by" />
        <div style={{ marginTop: 16 }}>
          <NoteField id="req-note" label="Note (optional)" value={note} onChange={setNote} error={errFor('req-note')} rows={2} />
        </div>
        <p className="hint" style={{ marginTop: 12 }}>This records that a request went out. Nothing is actually sent from this prototype.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary">{again ? 'Record another request' : 'Record request'}</button>
        </div>
      </form>
    </>
  );
}

/** Files the worker attached when logging the document. The first one is previewed. */
function AttachedFiles({ files }: { files: Attachment[] }) {
  const [shown, setShown] = useState(0);
  const f = files[shown];
  return (
    <section className="attached" aria-labelledby="attached-title" data-testid="attached-files">
      <h3 id="attached-title">Attached by you</h3>
      <ul className="file-list">
        {files.map((a, i) => (
          <li key={a.url}>
            <span className="file-icon" aria-hidden="true">{isImage(a) ? 'IMG' : 'PDF'}</span>
            <span className="file-name">{a.name}</span>
            <span className="small muted">{formatBytes(a.size)}</span>
            {files.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" aria-pressed={i === shown} onClick={() => setShown(i)}>
                {i === shown ? 'Showing' : 'Show'}
              </button>
            )}
            <a className="btn btn-ghost btn-sm" href={a.url} target="_blank" rel="noopener noreferrer">
              Open <span aria-hidden="true">↗</span><span className="sr-only">, opens in a new tab</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="attached-preview">
        {isImage(f) ? <img src={f.url} alt={`Preview of ${f.name}`} /> : <iframe src={f.url} title={`Preview of ${f.name}`} />}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        The prototype can't read uploaded files, so the details compared below come from a sample document.
      </p>
    </section>
  );
}

function PaperTable({ t }: { t: DocTable }) {
  const num = (i: number) => (t.numeric?.includes(i) ? 'num' : undefined);
  return (
    <section className="paper-section">
      <h4>{t.heading}</h4>
      <div className="paper-table-wrap">
        <table className="paper-table">
          <thead>
            <tr>{t.columns.map((col, i) => <th key={col} scope="col" className={num(i)}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((row, r) => (
              <tr key={r}>{row.map((cell, i) => <td key={i} className={num(i)}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** One line at the top of the review: how many details differ from the case, or that none do. */
function DifferencesSummary({ doc }: { doc: ReturnType<typeof buildDocument> }) {
  const checked = doc.compare.filter((r) => r.result !== 'none');
  const diffs = checked.filter((r) => r.result === 'mismatch');
  return (
    <h3 id="diffs-title" className={`diffs-title ${diffs.length ? 'has-diffs' : 'no-diffs'}`}>
      <span aria-hidden="true">{diffs.length ? '✕' : '✓'}</span>{' '}
      {diffs.length
        ? `${diffs.length} of ${checked.length} checked details ${diffs.length === 1 ? "doesn't" : "don't"} match`
        : `All ${checked.length} checked details match the case`}
    </h3>
  );
}
