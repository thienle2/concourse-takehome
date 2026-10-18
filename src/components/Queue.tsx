import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtLong, fmtShort, TODAY } from '../lib/date';
import { STATUS_LABEL } from '../lib/labels';
import { DEFAULT_VIEW, filterCases, isWorkable, PAGE_SIZE, statusOptions, TABS, type QueueView, type SortKey } from '../lib/queue';
import { docsSummary, isOpen, lastActivity, needsAction } from '../lib/status';
import type { Case, CaseStatus } from '../lib/types';
import { DueCell, SnoozeTag, StatusPill } from './bits';

interface Props {
  cases: Case[];
  view: QueueView;
  setView: (v: QueueView) => void;
  onOpen: (id: string, navIds: string[]) => void;
}

const COLUMNS: { key: SortKey | null; label: string; cls: string }[] = [
  { key: 'due', label: 'Due', cls: 'col-due' },
  { key: 'name', label: 'Head of household', cls: 'col-name' },
  { key: 'id', label: 'Case', cls: 'col-case' },
  { key: 'status', label: 'Status', cls: 'col-status' },
  { key: null, label: 'Documents', cls: 'col-docs' },
  { key: 'last', label: 'Last activity', cls: 'col-last' },
];

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export function Queue({ cases, view, setView, onOpen }: Props) {
  const rows = useMemo(() => filterCases(cases, view), [cases, view]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(view.page, pages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const [active, setActive] = useState(-1);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const open = cases.filter(isOpen);
  const needs = cases.filter(needsAction);
  const update = (patch: Partial<QueueView>) => setView({ ...view, page: 1, ...patch });

  const startWorking = () => {
    const pool = rows.some(isWorkable) ? rows : filterCases(cases, { ...DEFAULT_VIEW });
    const first = pool.find(isWorkable);
    if (first) onOpen(first.id, pool.map((c) => c.id));
  };
  const anyWorkable = rows.some(isWorkable) || needs.some(isWorkable);

  useEffect(() => setActive(-1), [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        startWorking();
      } else if ((k === 'j' || k === 'k') && pageRows.length) {
        e.preventDefault();
        const next = k === 'j' ? Math.min(active + 1, pageRows.length - 1) : Math.max(active - 1, 0);
        setActive(next);
        rowRefs.current[next]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const chips: { label: string; clear: () => void }[] = [];
  if (view.status) chips.push({ label: `Status: ${STATUS_LABEL[view.status]}`, clear: () => update({ status: '' }) });
  if (view.search.trim()) chips.push({ label: `Search: “${view.search.trim()}”`, clear: () => update({ search: '' }) });
  const filtered = chips.length > 0;

  const sortBy = (key: SortKey) =>
    setView({ ...view, page: 1, sort: { key, dir: view.sort.key === key && view.sort.dir === 'asc' ? 'desc' : 'asc' } });

  return (
    <>
      <div className="page-head">
        <div>
          <p className="date">{fmtLong(TODAY)}</p>
          <h1>Recertification queue</h1>
          <p className="counts">
            {open.length} open cases · <strong>{needs.length} need action</strong> · {cases.length - open.length} decided
          </p>
        </div>
        <div className="row">
          <span className="kbd-help" aria-hidden="true">
            <span><kbd>S</kbd> start</span>
            <span><kbd>J</kbd>/<kbd>K</kbd> move</span>
          </span>
          <button type="button" className="btn btn-primary" onClick={startWorking} disabled={!anyWorkable}>
            Start working
          </button>
        </div>
      </div>

      <section className="card" aria-labelledby="list-title">
        <h2 id="list-title" className="sr-only">Cases</h2>
        <div className="tabs" role="group" aria-label="Case lists">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className="tab"
              aria-pressed={view.tab === t.key}
              onClick={() => update({ tab: t.key })}
            >
              {t.label}
              <span className="tab-count">{cases.filter(t.test).length}</span>
            </button>
          ))}
        </div>

        <div className="toolbar">
          <div className="field search">
            <label className="label" htmlFor="q">Search by name or case number</label>
            <input id="q" className="input" type="search" value={view.search} placeholder="e.g. Nguyen or RC-10260" onChange={(e) => update({ search: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="status-filter">Status</label>
            <select id="status-filter" className="select" value={view.status} onChange={(e) => update({ status: e.target.value as CaseStatus | '' })}>
              <option value="">Any status</option>
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered && (
          <div className="chips" aria-label="Active filters">
            {chips.map((c) => (
              <span className="chip" key={c.label}>
                {c.label}
                <button type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>×</button>
              </span>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ status: '', search: '' })}>
              Clear all
            </button>
          </div>
        )}

        <p className="sr-only" role="status" aria-live="polite">
          {rows.length} {rows.length === 1 ? 'case' : 'cases'} in this list
        </p>

        {rows.length === 0 ? (
          filtered ? (
            <div className="empty" data-testid="empty-search">
              <div className="empty-icon" style={{ background: 'var(--gray-bg)', color: 'var(--gray)' }} aria-hidden="true">⌕</div>
              <h3>No cases match</h3>
              <p>Nothing in “{TABS.find((t) => t.key === view.tab)!.label}” matches these filters.</p>
              <button type="button" className="btn" onClick={() => update({ status: '', search: '' })}>
                Reset filters
              </button>
            </div>
          ) : view.tab === 'needs' ? (
            <div className="empty" data-testid="empty-caught-up">
              <div className="empty-icon" aria-hidden="true">✓</div>
              <h3>You're caught up</h3>
              <p>No case needs action right now. Snoozed cases come back on their follow-up date.</p>
              <button type="button" className="btn" onClick={() => update({ tab: 'snoozed' })}>See snoozed cases</button>
            </div>
          ) : (
            <div className="empty">
              <h3>Nothing in this list</h3>
              <p>No cases fit “{TABS.find((t) => t.key === view.tab)!.label}” today.</p>
            </div>
          )
        ) : (
          <>
            <div className="table-wrap">
              <table className="queue">
                <caption className="sr-only">
                  {TABS.find((t) => t.key === view.tab)!.label}, sorted by {COLUMNS.find((c) => c.key === view.sort.key)!.label}{' '}
                  {view.sort.dir === 'asc' ? 'ascending' : 'descending'}
                </caption>
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.label}
                        className={col.cls}
                        scope="col"
                        aria-sort={col.key && view.sort.key === col.key ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        {col.key ? (
                          <button type="button" onClick={() => sortBy(col.key!)}>
                            {col.label}
                            <span aria-hidden="true">{view.sort.key === col.key ? (view.sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                          </button>
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c, i) => {
                    const docs = docsSummary(c);
                    const last = lastActivity(c);
                    return (
                      <tr key={c.id} className={i === active ? 'active' : undefined} data-testid="queue-row">
                        <td data-label="Due"><DueCell c={c} /></td>
                        <td data-label="Head of household" className="name">
                          <button
                            type="button"
                            className="link-btn"
                            ref={(el) => (rowRefs.current[i] = el)}
                            onFocus={() => setActive(i)}
                            onClick={() => onOpen(c.id, rows.map((r) => r.id))}
                          >
                            {c.name}
                          </button>
                          <div className="cell-sub">Household of {c.hh}</div>
                          {c.locked && <div className="lock-tag"><span aria-hidden="true">⚿</span> Open by {c.locked}</div>}
                        </td>
                        <td data-label="Case" className="col-case">{c.id}</td>
                        <td data-label="Status">
                          <StatusPill c={c} />
                          <div><SnoozeTag c={c} /></div>
                        </td>
                        <td data-label="Documents">
                          <div>{docs.verified} of 5 verified</div>
                          {docs.parts.length > 0 && <div className="cell-sub">{docs.parts.join(', ')}</div>}
                        </td>
                        <td data-label="Last activity">
                          {last ? (
                            <>
                              <div>{fmtShort(last.date)}</div>
                              <div className="cell-sub">{last.text} · {last.by}</div>
                            </>
                          ) : (
                            <span className="not-provided">No activity yet</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <nav className="pager" aria-label="Pages">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
              </span>
              <div className="pager-pages">
                <button type="button" className="btn btn-sm" disabled={page === 1} onClick={() => setView({ ...view, page: page - 1 })}>
                  Previous
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="page-btn"
                    aria-current={p === page ? 'page' : undefined}
                    aria-label={`Page ${p}`}
                    onClick={() => setView({ ...view, page: p })}
                  >
                    {p}
                  </button>
                ))}
                <button type="button" className="btn btn-sm" disabled={page === pages} onClick={() => setView({ ...view, page: page + 1 })}>
                  Next
                </button>
              </div>
            </nav>
          </>
        )}
      </section>
    </>
  );
}

export function QueueSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading cases" data-testid="skeleton">
      <div className="page-head">
        <div style={{ width: 320 }}>
          <div className="skeleton" style={{ height: 14, width: 180, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 28, width: 300 }} />
        </div>
      </div>
      <div className="card">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="row" style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="skeleton" style={{ height: 14, width: 90 }} />
            <div className="skeleton" style={{ height: 14, flex: 1 }} />
            <div className="skeleton" style={{ height: 22, width: 140, borderRadius: 999 }} />
            <div className="skeleton" style={{ height: 14, width: 200 }} />
          </div>
        ))}
      </div>
      <p className="sr-only" role="status">Loading cases…</p>
    </div>
  );
}

export function QueueLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card empty" role="alert" data-testid="load-error">
      <div className="empty-icon" style={{ background: 'var(--red-bg)', color: 'var(--red)' }} aria-hidden="true">!</div>
      <h2>The case list didn't load</h2>
      <p>We couldn't get today's cases. Nothing has changed on any case. Check your connection and try again.</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>
    </div>
  );
}
