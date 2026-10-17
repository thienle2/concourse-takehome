import { useStore } from '../state/store';

export function ToastBar() {
  const { state, undo, dismissToast } = useStore();
  const t = state.toast;
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {t && (
        <div className="toast" key={t.id} data-testid="toast">
          <p>
            <span className="toast-case">{t.caseLabel}</span>
            {t.message}
          </p>
          {t.undo && (
            <button type="button" className="btn btn-sm" onClick={() => undo(t)}>
              Undo
            </button>
          )}
          <button type="button" className="btn btn-sm btn-ghost" onClick={dismissToast} aria-label="Dismiss message">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
