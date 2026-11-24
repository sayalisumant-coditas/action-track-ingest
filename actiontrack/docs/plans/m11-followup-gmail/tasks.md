# Tasks — M11 Follow-up and Gmail drafts

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

Depends on: M5, M8, M10. Milestone 6 (mock) and 7 (real Gmail).

## Implementation (from plan.md)

- [x] 1. `GmailDrafter` interface (exactly one method, `createDraft`) with type-level guarantee nothing else can send
- [x] 2. Pure functions (snapshot tests not written yet): `selectItemsFor`, `redactForConfidential`, `buildFollowup`, `renderBody`
- [x] 3. `FileGmailDrafter` (writes to `.actiontrack/drafts/`) and CLI flag `--gmail mock|mcp` (default mock)
- [x] 4. `followup()` flow with duplicate-draft protection (`--replace`), `--dry-run`, `MISSING_EMAIL` warning
- [x] 5. Safety tests: one-method interface, `--dry-run` makes zero drafter calls (spy), repo grep for `send`
- [ ] 6. `McpGmailDrafter` (milestone 7): confirm connector authorised, list tools, map `Draft` to create-draft inputs, create one real draft, verify in Gmail
- [x] Email content: subject `Follow-up: N open action items (M overdue)`, Overdue then Open lists, "no due date" items under Open

## Tests (from plan.md)

- [x] `followup "Karan Joshi" --as-of 2026-10-15`: overdue first, one draft (mock), nothing sent
- [x] Person with no open items → message, no draft
- [x] `followup Priya` refused listing Nair and Shah; `followup "Priya Nair"` works
- [x] Security-review items go only to attendees; email contains task only
- [x] Second run without `--replace` warns, creates nothing
- [x] Joint-owner item appears in both people's emails
- [x] Missing email → draft with empty To + warning
- [x] (Suggested) write `tests.md` for M11 in the same style as other modules

## Risks to check

- [ ] Confirm at start of milestone 7 whether the Gmail connector's OAuth works from a standalone CLI

## Done when

- [x] Acceptance criteria 11–13 pass with the mock
- [ ] One real Gmail draft created and verified (or limitation recorded in docs)
