# Plan M4 — Line parser

**Goal**: split a candidate's text into **owner text**, **task** and **due text**.
**Requirements**: R1, R2 (extraction part) · **Milestone**: 2 · **Depends on**: M3 and the date phrase grammar from M6
**Files**: `src/core/parse/line.ts`, `src/core/parse/ownerGrammar.ts`

## Functions

| Function | Behaviour |
|---|---|
| `splitOwnerTask(text)` | Returns `{ownerRaw, helperRaw?, task}`. |
| `splitTaskDue(task)` | Returns `{task, dueRaw}`; due phrase is cut only when it matches the M6 grammar. |
| `parseCandidate(c)` | Table rows take owner and due from their cells; other forms use the two functions above. Returns `ParsedLine`. |

## Owner forms to support

| Written | `ownerRaw` | Extra |
|---|---|---|
| `Priya to send…` | `Priya` | |
| `Priya N. to send…` | `Priya N.` | initial kept |
| `@anita: audit…` | `Anita`-style from `anita` | strip `@` and colon |
| `Anita & Rahul to agree…` | `Anita & Rahul` | split later in M5 |
| `Lena (with Priya) to collect…` | `Lena` | `helperRaw = Priya` |
| `Everyone to review…` | `Everyone` | group |
| `Someone to update…` / `TBD to write…` | `Someone` / `TBD` | unassigned in M5 |
| `Team to decide…` | `Team` | group |
| `ACTION: Karan to circulate…` | `Karan` | prefix already removed by M3 |
| text with no `X to` pattern | `''` | whole text becomes the task |

## Tasks

1. Owner pattern: one or two capitalised words with optional initial, or the keywords above, joined by `&`/`and`, optional `( with X )`.
2. Try patterns in order: `owner: task`; `owner to task`; `owner will|should task`; fallback no owner.
3. Lowercase `@name` is capitalised for display; the raw text stays in `ownerRaw`.
4. Due extraction: look at the **end** of the task for `[—–-,]? (by|before|due|until)? <phrase>`, or a trailing bare `EOD`. Use `isDatePhrase(s)` from M6 so only valid phrases are removed; "by the end of the cutover" is cut as a phrase that M6 will flag unresolvable only if it starts with `by`/`before`/`due` and does not parse; otherwise it stays in the task.
5. Handle the form `, results due 15 October` and `— by Friday` and `by 2026-10-09 — …`.
6. Trim trailing punctuation; collapse whitespace; keep the original wording of the task (no rewriting).
7. Table candidates: use cells directly; due cell goes to M6 as-is.
8. Unit tests, then a fixture test that runs every candidate in the sample folder through the parser and snapshots the result.

## Sample cases (must pass)

| Input | owner | task | dueRaw |
|---|---|---|---|
| `Priya to send the revised quote to Acme by Friday` | Priya | send the revised quote to Acme | Friday |
| `Priya N. to send revised quote to Acme — by Friday` | Priya N. | send revised quote to Acme | Friday |
| `Rahul to set up the staging environment by 2026-09-08` | Rahul | set up the staging environment | 2026-09-08 |
| `@anita: audit colour contrast on the dashboard by Mon` | anita | audit colour contrast on the dashboard | Mon |
| `Anita & Rahul to agree on the component API by Wednesday` | Anita & Rahul | agree on the component API | Wednesday |
| `Lena (with Priya) to collect user feedback on the prototype by 2026-09-25` | Lena, helper Priya | collect user feedback on the prototype | 2026-09-25 |
| `Someone to update the CRM notes` | Someone | update the CRM notes | none |
| `TBD to write the design-system changelog` | TBD | write the design-system changelog | none |
| `Lena to run the customer survey, results due 15 October` | Lena | run the customer survey | 15 October |
| `Sam to cut cloud costs by 10% — proposal by 2026-10-09` | Sam | cut cloud costs by 10% | 2026-10-09 (the `10%` must not be read as a date) |
| `Karan to approve the Q4 cloud spend by 2026-10-02` | Karan | approve the Q4 cloud spend | 2026-10-02 |
| `Priya to review the welcome email for accessibility` | Priya | … | none |
| `Team to decide on the launch date` | Team | decide on the launch date | none |
| `Everyone to review the prototype before the next review` | Everyone | review the prototype before the next review | none (phrase is not a date; stays in task) |

## Edge cases

- `Rahul to review Anita's PR by tomorrow`: the apostrophe must not break parsing.
- `Sam to schedule cutover for Saturday 10 Oct`: this `Saturday 10 Oct` follows `for`, not `by`. Rule: with no `by`, a trailing phrase counts as due only if it is a full date or weekday-plus-date. Result: due = 10 Oct.
- `Priya to prepare the renewal one-pager by Friday` and similar must not eat "one-pager".
- `by` appearing mid-task (`standby`, `bypass`) must not trigger; require word boundaries and end-of-string position.

## Done when

All 14 sample rows are exact, and every candidate in the sample folder parses to a non-empty task.
