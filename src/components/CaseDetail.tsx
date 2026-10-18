import { useEffect, useRef, useState } from 'react';
import { fmtDate, fmtShort } from '../lib/date';
import { RECEIVE_CHANNELS, REQ_DOC, REQ_LABEL } from '../lib/labels';
import { isReadOnly, isSnoozed, nextAction, readOnlyReason, receivedDate } from '../lib/status';
import { caseSummary } from '../lib/summary';
import { requirementTimeline, stepDate, timelineCount, waitingPhrase } from '../lib/timeline';
import { REQ_KEYS, type Case, type ReqKey } from '../lib/types';
import { ACCEPT_ATTR, formatBytes, MAX_FILE_BYTES, MAX_FILES, validateFiles, type Attachment } from '../lib/attachments';
import { useStore } from '../state/store';
import { Activity } from './Activity';
import { dueUrgency, Notice, NotProvided, NotSaved, ReqPill, StatusPill } from './bits';
import { DocPanel, type PopMode } from './DocPanel';
import { UpdateCase, type UpdateOpen } from './UpdateCase';

interface Props {
  c: Case;
  navIds: string[];
  onNavigate: (id: string) => void;
  onBack: () => void;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export function CaseDetail({ c, navIds, onNavigate, onBack }: Props) {
  const [pop, setPop] = useState<{ mode: PopMode; key: ReqKey } | null>(null);
  const [update, setUpdate] = useState<UpdateOpen>(null);
  const [receiving, setReceiving] = useState<ReqKey | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reqBtn = useRef<Partial<Record<ReqKey, HTMLButtonElement | null>>>({});

  const ro = isReadOnly(c);
  const idx = navIds.indexOf(c.id);
  const prevId = idx > 0 ? navIds[idx - 1] : null;
  const nextId = idx >= 0 && idx < navIds.length - 1 ? navIds[idx + 1] : null;

  useEffect(() => titleRef.current?.focus(), [c.id]);

  const closePop = () => {
    const k = pop?.key;
    setPop(null);
    // Return focus to the requirement that opened the pop-out.
    requestAnimationFrame(() => (k && reqBtn.current[k] ? reqBtn.current[k]!.focus() : titleRef.current?.focus()));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        // Don't throw away a half-typed note or date.
        if (e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && /text|date|search/.test(e.target.type))) return;
        e.preventDefault();
        if (pop) closePop();
        else onBack();
        return;
      }
      if (isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'j' && nextId) onNavigate(nextId);
      if (k === 'k' && prevId) onNavigate(prevId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const na = nextAction(c);
  const runNext = () => {
    switch (na.kind) {
      case 'review':
        setPop({ mode: 'review', key: na.key! });
        break;
      case 'request':
      case 'follow-up':
        setPop({ mode: 'request', key: na.key! });
        break;
      case 'set-followup':
      case 'snoozed':
        setUpdate('followup');
        document.getElementById('update-case')?.scrollIntoView({ block: 'center' });
        break;
      case 'remind-supervisor':
        setUpdate('remind');
        document.getElementById('update-case')?.scrollIntoView({ block: 'center' });
        break;
      case 'mark-ready':
        setUpdate('ready');
        document.getElementById('update-case')?.scrollIntoView({ block: 'center' });
        break;
    }
  };
  const hasButton = !ro && !['awaiting-decision', 'decided', 'no-requirements'].includes(na.kind);
  const u = dueUrgency(c);
  const reqKeys = REQ_KEYS.filter((k) => c.ver[k]);

  return (
    <>
      <nav className="case-nav" aria-label="Case navigation">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Back to queue <kbd aria-hidden="true">Esc</kbd>
        </button>
        <span className="spacer" />
        {idx >= 0 && <span className="small muted">Case {idx + 1} of {navIds.length}</span>}
        <button type="button" className="btn btn-sm" disabled={!prevId} onClick={() => prevId && onNavigate(prevId)}>
          Previous <kbd aria-hidden="true">K</kbd>
        </button>
        <button type="button" className="btn btn-sm" disabled={!nextId} onClick={() => nextId && onNavigate(nextId)}>
          Next case <kbd aria-hidden="true">J</kbd>
        </button>
      </nav>

      <div className={`workspace${pop ? ' split' : ''}`}>
        <div data-testid="case-panel">
          <section className="card" aria-labelledby="case-title">
            <div className="case-header">
              <div style={{ minWidth: 0 }}>
                <h1 id="case-title" className="case-title" tabIndex={-1} ref={titleRef}>{c.name}</h1>
                <div className="case-meta">
                  <StatusPill c={c} />
                  {isSnoozed(c) && <span className="small">Snoozed until {fmtShort(c.fu!)}</span>}
                  <span>Case {c.id}</span>
                  <span>
                    Due {fmtDate(c.due)}
                    {u && <strong className={`urgency ${u.cls}`} style={{ marginLeft: 6 }}>{u.text}</strong>}
                  </span>
                  <span>Food assistance recertification</span>
                  <span>Assigned to you</span>
                </div>
              </div>
              {/* Every case opens the same placeholder PDF; the data has no application files. */}
              <a
                className="btn btn-sm"
                href={`${import.meta.env.BASE_URL}sample-application.pdf`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="application-link"
              >
                View full application (PDF)
                <span aria-hidden="true">↗</span>
                <span className="sr-only">, opens in a new tab</span>
              </a>
            </div>
            <section className="summary" aria-labelledby="summary-title" data-testid="case-summary">
              <h2 id="summary-title" className="summary-title">At a glance</h2>
              {caseSummary(c).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </section>
            {readOnlyReason(c) && (
              <div style={{ marginTop: 16 }}>
                <Notice tone="lock"><strong>Read only.</strong> {readOnlyReason(c)}</Notice>
              </div>
            )}
            <dl className="household" aria-label="Household">
              <div><dt>Household size</dt><dd>{c.hh} {c.hh === 1 ? 'person' : 'people'}</dd></div>
              <div><dt>Phone</dt><dd>{c.phone ?? <NotProvided />}</dd></div>
              <div><dt>Language</dt><dd>{c.lang || <NotProvided />}</dd></div>
              <div><dt>Income</dt><dd>{c.income ?? <NotProvided />}</dd></div>
              <div className="wide address-start">
                <dt>Address</dt>
                <dd>
                  {c.address.street || <NotProvided />}
                  {c.returned && <div className="small" style={{ color: 'var(--amber)', fontWeight: 500 }}>▲ Mail returned as undeliverable</div>}
                </dd>
              </div>
              <div><dt>City</dt><dd>{c.address.city || <NotProvided />}</dd></div>
              <div><dt>State</dt><dd>{c.address.state || <NotProvided />}</dd></div>
              <div><dt>ZIP</dt><dd>{c.address.zip || <NotProvided />}</dd></div>
            </dl>
            <p className="household-note">State and ZIP are placeholders. The case data doesn't include them.</p>
          </section>

          <section className={`next-block${!hasButton ? ' calm' : ''}`} aria-labelledby="next-title" data-testid="next-block">
            <div>
              <div className="eyebrow">What to do next</div>
              <h2 id="next-title">{ro ? 'No action available' : na.kind === 'decided' ? 'Decided' : na.label}</h2>
              <p>{ro ? readOnlyReason(c) : na.reason}</p>
            </div>
            {hasButton && (
              <button type="button" className="btn" onClick={runNext}>{na.label}</button>
            )}
          </section>

          <section className="card" aria-labelledby="req-title" style={{ marginTop: 16 }}>
            <div className="card-head">
              <h2 id="req-title">Requirements</h2>
              <span className="small muted">Each requirement has its own status</span>
            </div>
            {reqKeys.length === 0 ? (
              <div className="empty" data-testid="empty-reqs">
                <h3>No requirements yet</h3>
                <p>This case doesn't list any requirements. They appear here once the recertification is set up.</p>
              </div>
            ) : (
              <ul className="reqs">
                {reqKeys.map((k) => (
                  <RequirementRow
                    key={k}
                    c={c}
                    k={k}
                    readOnly={ro}
                    isOpen={pop?.key === k}
                    receiving={receiving === k}
                    setReceiving={(on) => setReceiving(on ? k : null)}
                    btnRef={(el) => (reqBtn.current[k] = el)}
                    onOpen={(mode) => setPop({ mode, key: k })}
                  />
                ))}
              </ul>
            )}
          </section>

          <div style={{ marginTop: 16 }}>
            <UpdateCase c={c} open={update} setOpen={setUpdate} />
          </div>
          <div style={{ marginTop: 16 }}>
            <Activity c={c} readOnly={ro} />
          </div>
        </div>

        {pop && <DocPanel key={`${pop.mode}-${pop.key}`} c={c} mode={pop.mode} reqKey={pop.key} onClose={closePop} />}
      </div>
    </>
  );
}

interface RowProps {
  c: Case;
  k: ReqKey;
  readOnly: boolean;
  isOpen: boolean;
  receiving: boolean;
  setReceiving: (on: boolean) => void;
  btnRef: (el: HTMLButtonElement | null) => void;
  onOpen: (mode: PopMode) => void;
}

function RequirementRow({ c, k, readOnly, isOpen, receiving, setReceiving, btnRef, onOpen }: RowProps) {
  const [showHistory, setShowHistory] = useState(false);
  const s = c.ver[k]!;
  const waiting = waitingPhrase(c, k);
  const req = c.req[k];
  const vinfo = c.vinfo[k];
  const detail =
    s === 'v'
      ? vinfo
        ? `Verified ${fmtShort(vinfo.d)} by ${vinfo.by === 'You' ? 'you' : vinfo.by}`
        : `${REQ_DOC[k]} on file`
      : s === 'r'
        ? `${REQ_DOC[k]} received${receivedDate(c, k) ? ` ${fmtShort(receivedDate(c, k)!)}` : ''}, not yet reviewed`
        : s === 'a'
          ? req
            ? `Requested ${fmtShort(req.d)} by ${req.via.toLowerCase()}`
            : 'Requested; no request details on file'
          : 'Not requested from the household yet';

  return (
    <li className={`req${isOpen ? ' open' : ''}`} aria-current={isOpen ? 'true' : undefined} data-testid={`req-${k}`}>
      <div>
        <div className="req-name">
          {REQ_LABEL[k]}
          <ReqPill s={s} />
          {isOpen && <span className="open-tag">● Open beside</span>}
        </div>
        <div className="req-detail">
          {detail}
          {waiting && <span className="req-waiting"> · {waiting}</span>}
          {!!c.rinfo[k]?.files?.length && (
            <span className="req-waiting"> · {c.rinfo[k]!.files!.length} file{c.rinfo[k]!.files!.length === 1 ? '' : 's'} attached</span>
          )}
        </div>
        <button
          type="button"
          className="history-toggle"
          aria-expanded={showHistory}
          aria-controls={`history-${k}`}
          onClick={() => setShowHistory(!showHistory)}
        >
          <span aria-hidden="true">{showHistory ? '▾' : '▸'}</span> {showHistory ? 'Hide' : 'Show'} history{timelineCount(c, k) ? ` (${timelineCount(c, k)})` : ''}
        </button>
      </div>
      <div className="req-actions">
        {s === 'v' && (
          <button type="button" className="btn btn-sm" ref={btnRef} onClick={() => onOpen('view')}>View document</button>
        )}
        {s === 'r' &&
          (readOnly ? (
            <button type="button" className="btn btn-sm" ref={btnRef} onClick={() => onOpen('view')}>View document</button>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" ref={btnRef} onClick={() => onOpen('review')}>Review document</button>
          ))}
        {s === 'a' && !readOnly && (
          <>
            <button type="button" className="btn btn-sm" ref={btnRef} onClick={() => setReceiving(!receiving)} aria-expanded={receiving}>
              Log as received
            </button>
            <button type="button" className="btn btn-sm" onClick={() => onOpen('request')}>Send another request</button>
          </>
        )}
        {s === 'm' && !readOnly && (
          <button type="button" className="btn btn-sm btn-primary" ref={btnRef} onClick={() => onOpen('request')}>Request document</button>
        )}
      </div>
      {showHistory && <RequirementTimeline c={c} k={k} />}
      {receiving && <ReceiveForm c={c} k={k} onDone={() => setReceiving(false)} />}
    </li>
  );
}

function RequirementTimeline({ c, k }: { c: Case; k: ReqKey }) {
  const steps = requirementTimeline(c, k);
  return (
    <ol className="req-timeline" id={`history-${k}`} aria-label={`${REQ_LABEL[k]} history`} data-testid={`history-${k}`}>
      {steps.map((st, i) => (
        <li key={i} className={st.current ? 'is-current' : undefined}>
          <span className="tl-date">{stepDate(st)}</span>
          <span className="tl-dot" aria-hidden="true" />
          <span className="tl-text">
            {st.text}
            {st.by && <span className="tl-by"> · {st.by === 'You' ? 'you' : st.by}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ReceiveForm({ c, k, onDone }: { c: Case; k: ReqKey; onDone: () => void }) {
  const { save } = useStore();
  const [via, setVia] = useState<string>(RECEIVE_CHANNELS[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = `recv-file-${k}`;

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    // Adding the same file twice (same name and size) is ignored.
    const next = [...files, ...Array.from(list).filter((f) => !files.some((g) => g.name === f.name && g.size === f.size))];
    setFiles(next);
    setFileError(validateFiles(next));
  };
  const removeFile = (i: number) => {
    const next = files.filter((_, j) => j !== i);
    setFiles(next);
    setFileError(validateFiles(next));
    // The Remove button goes away with its file; keep keyboard focus in the form.
    document.getElementById(inputId)?.focus();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const err = validateFiles(files);
    setFileError(err);
    if (err) {
      document.getElementById(inputId)?.focus();
      return;
    }
    const attachments: Attachment[] = files.map((f) => ({ name: f.name, type: f.type, size: f.size, url: URL.createObjectURL(f) }));
    const res = save(c.id, { type: 'receive', key: k, via, files: attachments });
    if (res.ok) onDone();
    else {
      attachments.forEach((a) => URL.revokeObjectURL(a.url));
      setFailed(true);
    }
  };

  return (
    <form className="req-inline" onSubmit={submit} noValidate data-testid={`receive-form-${k}`}>
      <NotSaved show={failed} />
      <div className="field" style={{ marginTop: failed ? 12 : 0 }}>
        <label className="label" htmlFor={`recv-${k}`}>How did the {REQ_DOC[k].toLowerCase()} arrive?</label>
        <select id={`recv-${k}`} className="select" value={via} onChange={(e) => setVia(e.target.value)} style={{ maxWidth: 320 }}>
          {RECEIVE_CHANNELS.map((ch) => <option key={ch}>{ch}</option>)}
        </select>
      </div>

      <div className="field">
        <span className="label" id={`${inputId}-label`}>Attach the document (optional)</span>
        <span className="hint" id={`${inputId}-hint`}>
          PDF, JPG or PNG, up to {formatBytes(MAX_FILE_BYTES)} each, {MAX_FILES} files at most. Files stay in this browser; nothing is uploaded from the prototype.
        </span>
        {fileError && <span className="field-error" id={`${inputId}-err`}>{fileError}</span>}
        <div
          className={`dropzone${dragging ? ' dragging' : ''}${fileError ? ' invalid' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        >
          <input
            id={inputId}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="sr-only"
            aria-labelledby={`${inputId}-label`}
            aria-describedby={`${inputId}-hint${fileError ? ` ${inputId}-err` : ''}`}
            aria-invalid={!!fileError || undefined}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <label htmlFor={inputId} className="btn btn-sm">Choose files</label>
          <span className="small muted">or drag them here</span>
        </div>
        {files.length > 0 && (
          <ul className="file-list" aria-label="Files to attach">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}`}>
                <span className="file-icon" aria-hidden="true">{f.type === 'application/pdf' ? 'PDF' : f.type.startsWith('image/') ? 'IMG' : '?'}</span>
                <span className="file-name">{f.name}</span>
                <span className="small muted">{formatBytes(f.size)}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button type="submit" className="btn btn-primary btn-sm">Log as received</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>The requirement moves to “Received, needs review”. You review it next.</p>
    </form>
  );
}
