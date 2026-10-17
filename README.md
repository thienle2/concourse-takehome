# Alder County records workspace (prototype)

A clickable prototype of a caseworker's workspace for food-assistance recertification cases. Everything is fictional: the agency, the people, the documents and every rule. Mock data only, no backend; all changes live in memory and reset on reload.

Today is fixed at **2026-10-12** (`src/lib/date.ts`). The real clock is never read.

## Run

```bash
npm install
npm run dev
```

Build: `npm run build` (outputs `dist/`, deploys to Vercel as a static Vite app with no config).
Tests: `npx playwright install chromium` once, then `npm test`.

## Where things are

| Area | File |
| --- | --- |
| Derived case status, snooze, needs action, next action, guards | `src/lib/status.ts` |
| What each save does + the confirmation text | `src/lib/actions.ts` |
| Fake documents and the comparison table | `src/lib/documents.ts` |
| Address parsing and placeholder state/ZIP | `src/lib/address.ts` |
| Tabs, tiles, filtering, sorting | `src/lib/queue.ts` |
| useReducer store, save/undo, failure switch | `src/state/store.tsx` |
| Screens | `src/components/` |
| Data (loaded with fetch, so loading and failure states are real) | `public/cases.json` |

## Prototype controls (top bar)

- **Make the next save fail**: the next save shows "Not saved", keeps your input and records nothing.
- **Loading** (`?state=loading`): skeleton forever.
- **List error** (`?state=error`): the list fails to load; Try again succeeds.
- **Caught up** (`?state=caughtup`): only cases that don't need action, to show the empty queue.
- **No requirements** (`?state=noreqs#/case/RC-10234`): one case with no requirements.

Keyboard: `S` start working, `J`/`K` next/previous (rows in the queue, cases in a case), `Esc` closes the pop-out or returns to the queue.

## Decisions worth knowing

- Status is derived every render from `ver`, `ready` and `decided`. The `status` field in `cases.json` is ignored.
- Recording a new request (or rejecting a document) clears a follow-up date that is today or past, and the confirmation says so. This avoids an endless "Follow up" loop.
- Follow-up dates must be after today. While the due date is ahead they are capped at it; once a case is overdue, any later date is allowed so the worker can still schedule a check-back while waiting on documents.
- Addresses are split into street, city, state and ZIP at load (`src/lib/address.ts`). The data has only street and city, so the state (`AD`, fictional) and ZIPs (unused `000xx` range, one per street) are placeholders, labelled in the UI.
- `Follow up` opens the request pop-out for the first outstanding requirement ("Send another request").
- Undo restores the case as it was but keeps history, adding an "Undid: …" entry so the record stays complete.
- Received dates are tracked per requirement once logged here (`rinfo`); the case-level `rdate` from the data is the fallback.
- Anything that reads like a program rule is marked `PLACEHOLDER` in code and labelled as a placeholder in the UI (confirmation wording, the 60-day utility bill window, signature required, what to ask for, rejection reasons).
