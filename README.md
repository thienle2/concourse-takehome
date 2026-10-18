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
| "At a glance" case summary | `src/lib/summary.ts` |
| Per-requirement history and waiting time | `src/lib/timeline.ts` |
| File checks for documents attached when logging a receipt | `src/lib/attachments.ts` |
| Tabs, filtering, sorting | `src/lib/queue.ts` |
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
- Document comparisons show where each value came from. A case fact counts as **verified** only when a different, already-verified requirement proves it (Identity proves the name, Residency the address, Household members the size, Income the income). Otherwise it's **self-reported**, and the result says "Matches self-reported value" so a weak match doesn't read as proof. Treating unverified facts as coming from the application is a placeholder assumption.
- Each case opens with an "At a glance" summary built only from case data: timing and stage, what's outstanding and what it's waiting on, and things to know (returned mail, no phone, language, who has it open). It never states an eligibility outcome.
- Each requirement shows how long it has been waiting and can expand into its own history. Actions taken here are tagged with their requirement; events from `cases.json` are matched by the requirement or document named in their text.
- Every case has a "View full application (PDF)" link that opens `public/sample-application.pdf` in a new tab. It's one blank, clearly fictional form shared by all cases, since the data has no application files.
- Cases awaiting a decision can be sent a "Remind supervisor" (recorded only, nothing is sent), at most once a day. When the due date is within 3 days or past (placeholder threshold), it becomes the case's next step, and the queue flags the case on the Awaiting decision tab.
- Every case in `cases.json` is treated as assigned to Dana; the data has no assigned-worker field. The queue and each case say so. `locked` means a colleague has the case open, not that they own it.
- "Log as received" lets the worker attach the document from their computer (PDF, JPG or PNG, up to 10 MB each, 5 files; placeholder limits), by picker or drag and drop. Files stay in the browser for the session; nothing is uploaded. The review pop-out previews them, but the comparison still uses sample details because the prototype can't read files.
- `Follow up` opens the request pop-out for the first outstanding requirement ("Send another request").
- Undo restores the case as it was but keeps history, adding an "Undid: …" entry so the record stays complete.
- Received dates are tracked per requirement once logged here (`rinfo`); the case-level `rdate` from the data is the fallback.
- Anything that reads like a program rule is marked `PLACEHOLDER` in code and labelled as a placeholder in the UI (confirmation wording, the 60-day utility bill window, signature required, what to ask for, rejection reasons).
