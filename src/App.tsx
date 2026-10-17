import { useEffect, useState } from 'react';
import { CaseDetail } from './components/CaseDetail';
import { Queue, QueueLoadError, QueueSkeleton } from './components/Queue';
import { ToastBar } from './components/ToastBar';
import { DEFAULT_VIEW, filterCases, type QueueView } from './lib/queue';
import { useStore } from './state/store';

const caseFromHash = () => /^#\/case\/([\w-]+)$/.exec(window.location.hash)?.[1] ?? null;

export function App() {
  const { state, reload, setFailNext } = useStore();
  const [view, setView] = useState<QueueView>(DEFAULT_VIEW);
  const [caseId, setCaseId] = useState<string | null>(caseFromHash);
  const [navIds, setNavIds] = useState<string[]>([]);

  useEffect(() => {
    const onHash = () => setCaseId(caseFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const openCase = (id: string, ids?: string[]) => {
    if (ids) setNavIds(ids);
    window.location.hash = `/case/${id}`;
  };
  const backToQueue = () => {
    window.location.hash = '';
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setCaseId(null);
  };

  const current = caseId ? state.cases.find((c) => c.id === caseId) : null;
  // Opened from a link: navigate through the current queue list.
  const ids = navIds.length ? navIds : filterCases(state.cases, view).map((c) => c.id);

  useEffect(() => {
    document.title = current ? `${current.name} · Alder County Records` : 'Queue · Alder County Records';
  }, [current]);

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">AC</div>
            <div>
              <div className="brand-name">Records workspace</div>
              <div className="brand-sub">Alder County Human Services (fictional)</div>
            </div>
          </div>
          <div className="proto" aria-label="Prototype controls">
            <strong>Prototype</strong>
            <label>
              <input type="checkbox" checked={state.failNext} onChange={(e) => setFailNext(e.target.checked)} data-testid="fail-next" />
              Make the next save fail
            </label>
            <a href="?state=loading">Loading</a>
            <a href="?state=error">List error</a>
            <a href="?state=caughtup">Caught up</a>
            <a href="?state=noreqs#/case/RC-10234">No requirements</a>
            <a href="/">Reload data</a>
          </div>
          <div className="user">
            <div className="avatar" aria-hidden="true">DW</div>
            <div>
              <div style={{ fontWeight: 500 }}>Dana Whitfield</div>
              <div className="small muted">Caseworker</div>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        {state.load === 'loading' && <QueueSkeleton />}
        {state.load === 'error' && <QueueLoadError onRetry={() => reload(true)} />}
        {state.load === 'ready' &&
          (caseId ? (
            current ? (
              <CaseDetail key={current.id} c={current} navIds={ids} onNavigate={(id) => openCase(id)} onBack={backToQueue} />
            ) : (
              <div className="card empty">
                <h2>Case not found</h2>
                <p>There's no case {caseId} in today's list.</p>
                <button type="button" className="btn" onClick={backToQueue}>Back to queue</button>
              </div>
            )
          ) : (
            <Queue cases={state.cases} view={view} setView={setView} onOpen={openCase} />
          ))}
      </main>
      <ToastBar />
    </div>
  );
}
