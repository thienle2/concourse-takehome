import { NOTE_LIMIT } from '../lib/actions';

interface Props {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  rows?: number;
}

/** Textarea with a live character count. Over-limit text is kept; the form reports it on save. */
export function NoteField({ id, label, hint, value, onChange, error, rows = 3 }: Props) {
  const over = value.length > NOTE_LIMIT;
  const hintId = `${id}-hint`;
  const errId = `${id}-error`;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {hint && <span className="hint" id={hintId}>{hint}</span>}
      {error && <span className="field-error" id={errId}>{error}</span>}
      <textarea
        id={id}
        className={`textarea${error ? ' invalid' : ''}`}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
        aria-describedby={[hint && hintId, error && errId, `${id}-count`].filter(Boolean).join(' ')}
      />
      <span id={`${id}-count`} className={`counter${over ? ' over' : ''}`} aria-live={over ? 'polite' : 'off'}>
        {value.length} / {NOTE_LIMIT}
        {over && ` · ${value.length - NOTE_LIMIT} over the limit`}
      </span>
    </div>
  );
}

export function noteLimitError(value: string): string {
  return value.length > NOTE_LIMIT
    ? `Notes can be ${NOTE_LIMIT} characters at most. This one is ${value.length}. Shorten it to save; your text is kept.`
    : '';
}
