import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { applyAction, undoAction, type CaseAction } from '../lib/actions';
import { needsAction } from '../lib/status';
import { normalizeCase, type Case } from '../lib/types';

export interface Toast {
  id: number;
  message: string;
  /** Which case the message is about, since the toast outlives navigation. */
  caseLabel: string;
  undo?: { prev: Case; caseId: string };
}

interface State {
  load: 'loading' | 'error' | 'ready';
  cases: Case[];
  /** Prototype control: the next save fails without recording anything. */
  failNext: boolean;
  toast: Toast | null;
}

type Msg =
  | { type: 'loading' }
  | { type: 'loaded'; cases: Case[] }
  | { type: 'loadFailed' }
  | { type: 'replace'; case: Case }
  | { type: 'setFailNext'; value: boolean }
  | { type: 'toast'; toast: Toast | null };

function reducer(state: State, msg: Msg): State {
  switch (msg.type) {
    case 'loading':
      return { ...state, load: 'loading' };
    case 'loaded':
      return { ...state, load: 'ready', cases: msg.cases };
    case 'loadFailed':
      return { ...state, load: 'error' };
    case 'replace':
      return { ...state, cases: state.cases.map((c) => (c.id === msg.case.id ? msg.case : c)) };
    case 'setFailNext':
      return { ...state, failNext: msg.value };
    case 'toast':
      return { ...state, toast: msg.toast };
  }
}

export type SaveResult = { ok: true; message: string } | { ok: false };

interface Store {
  state: State;
  save: (caseId: string, action: CaseAction) => SaveResult;
  undo: (toast: Toast) => void;
  dismissToast: () => void;
  setFailNext: (v: boolean) => void;
  reload: (userRetry?: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

let toastSeq = 0;

/**
 * Prototype states, chosen with ?state=…
 * loading: skeleton forever. error: the automatic load fails; Try again succeeds.
 * caughtup: only cases that don't need action. noreqs: RC-10234 has no requirements.
 */
type ProtoMode = 'loading' | 'error' | 'caughtup' | 'noreqs';
function prototypeMode(): ProtoMode | null {
  const v = new URLSearchParams(window.location.search).get('state');
  return v === 'loading' || v === 'error' || v === 'caughtup' || v === 'noreqs' ? v : null;
}

function applyProtoMode(cases: Case[], mode: ProtoMode | null): Case[] {
  if (mode === 'caughtup') return cases.filter((c) => !needsAction(c));
  if (mode === 'noreqs') return cases.map((c) => (c.id === 'RC-10234' ? { ...c, ver: {} } : c));
  return cases;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { load: 'loading', cases: [], failNext: false, toast: null });
  const ref = useRef(state);
  ref.current = state;

  const reload = useCallback((userRetry = false) => {
    dispatch({ type: 'loading' });
    const mode = prototypeMode();
    if (mode === 'loading') return;
    const failThisTime = mode === 'error' && !userRetry;
    const delay = new Promise((r) => setTimeout(r, 450));
    Promise.all([fetch(`${import.meta.env.BASE_URL}cases.json`), delay])
      .then(([res]) => {
        if (failThisTime || !res.ok) throw new Error('load failed');
        return res.json();
      })
      .then((raw: unknown[]) => dispatch({ type: 'loaded', cases: applyProtoMode(raw.map(normalizeCase), mode) }))
      .catch(() => dispatch({ type: 'loadFailed' }));
  }, []);

  useEffect(() => reload(), [reload]);

  const save = useCallback((caseId: string, action: CaseAction): SaveResult => {
    const s = ref.current;
    if (s.failNext) {
      dispatch({ type: 'setFailNext', value: false });
      return { ok: false };
    }
    const prev = s.cases.find((c) => c.id === caseId);
    if (!prev) return { ok: false };
    const { next, message } = applyAction(prev, action);
    dispatch({ type: 'replace', case: next });
    dispatch({ type: 'toast', toast: { id: ++toastSeq, message, caseLabel: `${prev.name} · ${prev.id}`, undo: { prev, caseId } } });
    return { ok: true, message };
  }, []);

  const undo = useCallback((toast: Toast) => {
    if (!toast.undo) return;
    const current = ref.current.cases.find((c) => c.id === toast.undo!.caseId);
    if (!current) return;
    const { next, message } = undoAction(toast.undo.prev, current, toast.message);
    dispatch({ type: 'replace', case: next });
    dispatch({ type: 'toast', toast: { id: ++toastSeq, message, caseLabel: toast.caseLabel } });
  }, []);

  const value = useMemo<Store>(
    () => ({
      state,
      save,
      undo,
      reload,
      dismissToast: () => dispatch({ type: 'toast', toast: null }),
      setFailNext: (v) => dispatch({ type: 'setFailNext', value: v }),
    }),
    [state, save, undo, reload],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
