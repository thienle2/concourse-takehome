import { useState } from 'react';
import { fmtDate } from '../lib/date';
import type { Case } from '../lib/types';
import { useStore } from '../state/store';
import { NotSaved } from './bits';
import { NoteField, noteLimitError } from './NoteField';

export function Activity({ c, readOnly }: { c: Case; readOnly: boolean }) {
  const { save } = useStore();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const err = !text.trim() ? 'Write a note before saving.' : noteLimitError(text);
    setError(err);
    if (err) {
      document.getElementById('note-text')?.focus();
      return;
    }
    const res = save(c.id, { type: 'note', text });
    if (res.ok) setText('');
    else setFailed(true);
  };

  // Newest first; ties keep their recorded order (later entry first).
  const feed = c.ev.map((e, i) => ({ ...e, i })).sort((a, b) => (a.date === b.date ? b.i - a.i : a.date < b.date ? 1 : -1));

  return (
    <section className="card" aria-labelledby="activity-title">
      <div className="card-head">
        <h2 id="activity-title">Activity and notes</h2>
        <span className="small muted">{c.ev.length} entries</span>
      </div>

      {!readOnly && (
        <form onSubmit={submit} noValidate className="stack">
          <NotSaved show={failed} />
          <NoteField id="note-text" label="Add a note" hint="Notes go on the case record. Up to 500 characters." value={text} onChange={setText} error={error} />
          <div className="row">
            <button type="submit" className="btn btn-primary">Save note</button>
          </div>
        </form>
      )}

      {feed.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>No activity recorded on this case yet.</p>
      ) : (
        <ol className="feed" data-testid="activity-feed">
          {feed.map((e) => (
            <li key={e.i} className={e.kind === 'note' ? 'is-note' : undefined}>
              <span className="when">{fmtDate(e.date)}</span>
              <div>
                {e.kind === 'note' && <div className="kind">Note</div>}
                <div className="text">{e.text}</div>
                <div className="by">{e.by === 'You' ? 'Dana Whitfield (you)' : e.by}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
