# Plan M11 — Follow-up and Gmail drafts

**Goal**: for one owner, build a clear follow-up email and create a Gmail **draft**. Never send.
**Requirements**: F-FUP-1..10, R9, NFR-4, NFR-5 · **Milestone**: 6 (mock) and 7 (real Gmail) · **Depends on**: M5, M8, M10
**Files**: `src/core/followup/select.ts`, `build.ts`, `render.ts`, `redact.ts`, `gmail.ts`, `fileGmail.ts`, `mcpGmail.ts`, `followup.ts`

## Functions

| Function | Behaviour |
|---|---|
| `selectItemsFor(person, items, asOf, {includeGroup})` | Not-done items owned by the person (joint owners included). Group items only with `includeGroup`. Ambiguous items never included. |
| `redactForConfidential(items, recipient, meetings)` | Drops items from a confidential meeting the recipient did not attend and records a warning. Uses only the task text, never the meeting's discussion. |
| `buildFollowup(person, items, asOf, meetings)` | Returns `Draft {to, subject, body, itemIds, warnings}`. |
| `renderBody(person, overdue, open)` | Plain-text template; overdue section first. Template lives in one constant. |
| `GmailDrafter` interface | **One method**: `createDraft(draft) → {draftId}`. No send method exists anywhere. |
| `FileGmailDrafter` | Writes JSON/`.eml` into `.actiontrack/drafts/`; returns a generated id. Default until Gmail is authorised. |
| `McpGmailDrafter` | Uses the MCP SDK client to call the Gmail connector's create-draft tool. |
| `followup(query, opts)` | The command flow below. |

## Command flow

1. `findPeople(query)`; none → error; several → refuse and list them (F-FUP-8).
2. Select items; none → print "no open items for X" and stop (F-FUP-6).
3. Redact for confidentiality; build the draft.
4. Missing email → warn (`MISSING_EMAIL`); draft is built with an empty `To` (Q2 assumption).
5. `--dry-run` → print the draft; no drafter call.
6. If `store.drafts[person]` exists and no `--replace` → warn and stop (F-FUP-7).
7. `createDraft` → `recordDraft` → print the draft id.

## Email content

- Subject: `Follow-up: N open action items (M overdue)`.
- Body: greeting, one line of context, an **Overdue** list, then an **Open** list. Each line: task, due date (and "N days overdue"), meeting title and date.
- Items with no due date are listed under Open with "no due date".
- Polite, no blame wording, short.

## Tasks

1. `GmailDrafter` interface and a type-level guarantee that nothing else is exported for sending.
2. Selection, redaction, building and rendering as pure functions with snapshot tests.
3. `FileGmailDrafter` and the CLI flag `--gmail mock|mcp` (default mock).
4. `followup()` flow with duplicate-draft protection.
5. Safety tests: the drafter interface has exactly one method; `--dry-run` makes zero drafter calls (spy); a repo test greps source for `send`.
6. `McpGmailDrafter` (milestone 7): confirm the connector is authorised, list its tools, map `Draft` to the create-draft tool's inputs, create one real draft, check it in Gmail Drafts.

## Tests

- `followup "Karan Joshi" --as-of 2026-10-15`: overdue items first; one draft (mock); nothing sent.
- Person with no open items → message, no draft.
- `followup Priya` → refused, lists Nair and Shah; `followup "Priya Nair"` works.
- Items from `2026-10-09-security-review` go only to attendees (Sam, Rahul Verma, Priya Shah, Karan); a non-attendee never gets them; the email contains the task only.
- Second run without `--replace` warns and creates nothing.
- Joint-owner item appears in both people's emails.
- Missing email → draft with empty To and a warning.

## Risks

- The Gmail connector is a claude.ai connector that may need an OAuth sign-in a standalone CLI cannot do. Check this at the start of milestone 7. Mock mode keeps everything else shippable.

## Done when

Acceptance criteria 11–13 pass with the mock, and one real Gmail draft has been created and verified (or the limitation is recorded in the docs).
