# Tests — M4 Line parser

Plan: [plan.md](plan.md) · Files under test: `line.ts`, `ownerGrammar.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

Data-driven (`it.each`). The "due" column is `dueRaw`: the text cut from the task. Turning it into a date is M6's job.

## A. The 14 required sample rows

| ID | Input | owner | task | dueRaw |
|---|---|---|---|---|
| M4-01 | `Priya to send the revised quote to Acme by Friday` | Priya | send the revised quote to Acme | Friday |
| M4-02 | `Priya N. to send revised quote to Acme — by Friday` | Priya N. | send revised quote to Acme | Friday `[NAME]` |
| M4-03 | `Rahul to set up the staging environment by 2026-09-08` | Rahul | set up the staging environment | 2026-09-08 |
| M4-04 | `@anita: audit colour contrast on the dashboard by Mon` | anita | audit colour contrast on the dashboard | Mon |
| M4-05 | `Anita & Rahul to agree on the component API by Wednesday` | Anita & Rahul | agree on the component API | Wednesday `[NAME]` |
| M4-06 | `Lena (with Priya) to collect user feedback on the prototype by 2026-09-25` | Lena, helper Priya | collect user feedback on the prototype | 2026-09-25 |
| M4-07 | `Someone to update the CRM notes` | Someone | update the CRM notes | none `[GAP]` |
| M4-08 | `TBD to write the design-system changelog` | TBD | write the design-system changelog | none `[GAP]` |
| M4-09 | `Lena to run the customer survey, results due 15 October` | Lena | run the customer survey | 15 October |
| M4-10 | `Sam to cut cloud costs by 10% — proposal by 2026-10-09` | Sam | cut cloud costs by 10% | 2026-10-09 (`10%` is not a date) |
| M4-11 | `Karan to approve the Q4 cloud spend by 2026-10-02` | Karan | approve the Q4 cloud spend | 2026-10-02 |
| M4-12 | `Priya to review the welcome email for accessibility` | Priya | review the welcome email for accessibility | none `[GAP]` |
| M4-13 | `Team to decide on the launch date` | Team | decide on the launch date | none `[GAP]` |
| M4-14 | `Everyone to review the prototype before the next review` | Everyone | review the prototype before the next review | none (not a date phrase; stays in task) |

## B. `splitOwnerTask`: owner forms

| ID | Input | Expected |
|---|---|---|
| M4-20 | `ACTION`-stripped text `Karan to circulate the offsite summary` | owner Karan |
| M4-21 | `Priya will send the deck` | owner Priya (`will`) |
| M4-22 | `Sam should confirm the budget` | owner Sam (`should`) |
| M4-23 | `Anita and Rahul to agree` | `ownerRaw = 'Anita and Rahul'` kept raw |
| M4-24 | `Priya S. to sign off` | `Priya S.` `[NAME]` |
| M4-25 | `@priya: check logs` | owner `priya`, display `Priya` |
| M4-26 | `Owner: Karan` style `Karan: send invoice` | owner Karan |
| M4-27 | `Send the invoice` (no owner) | `ownerRaw = ''`, task = whole text `[GAP]` |
| M4-28 | `To do: send invoice` | no owner (`To do` is not a name) `[GAP]` |
| M4-29 | `Meera Rao to book the call` (full name) | owner `Meera Rao` |
| M4-30 | `Priya Nair to prepare the one-pager` | owner `Priya Nair` `[NAME]` |
| M4-31 | `Lena (with Priya and Sam) to run it` | helper `Priya and Sam` kept raw for M5 |
| M4-32 | `Someone to chase Acme` / `TBD: chase Acme` | `Someone` / `TBD` `[GAP]` |
| M4-33 | `Everybody to read the doc` | owner `Everybody` (group, M5) |
| M4-34 | `Karan to` (no task after `to`) | owner Karan, task empty → caller drops with warning `[GAP]` |
| M4-35 | `Priya to send the quote to Karan to confirm` | owner Priya (first `to` only) |
| M4-36 | `Rahul to review Anita's PR by tomorrow` | apostrophe survives; task `review Anita's PR`; due `tomorrow` |
| M4-37 | Leading/trailing whitespace and double spaces | cleaned; wording kept |
| M4-38 | Lowercase sentence `priya to send it` | owner `priya` (display form `Priya`) |
| M4-39 | `Priya, please send the quote` | no owner pattern → unassigned; test pins this and notes the gap `[GAP]` |

## C. `splitTaskDue`: due extraction

| ID | Input | task / dueRaw |
|---|---|---|
| M4-50 | `send quote by Friday` | `send quote` / `Friday` |
| M4-51 | `send quote — by Friday` | trailing dash removed |
| M4-52 | `send quote - by Friday` and `send quote, by Friday` | same |
| M4-53 | `send quote before 12 Oct` | / `12 Oct` |
| M4-54 | `send quote due Oct 3rd` | / `Oct 3rd` |
| M4-55 | `send quote until Monday` | / `Monday` |
| M4-56 | `fix bug EOD` | / `EOD` |
| M4-57 | `fix bug by EOD tomorrow` | / `EOD tomorrow` |
| M4-58 | `fix bug by tomorrow` | / `tomorrow` |
| M4-59 | `run survey, results due 15 October` | task `run survey` |
| M4-60 | `write proposal by 2026-10-09` | ISO due |
| M4-61 | `book hall by Wed 16 Sep` | / `Wed 16 Sep` |
| M4-62 | `review report by end of next week` | / `end of next week` |
| M4-63 | `plan sprint by mid-October` | / `mid-October` |
| M4-64 | `wrap up by end of month` | / `end of month` |
| M4-65 | `sign off by the end of the cutover` | dueRaw `by the end of the cutover` (starts with `by`, does not parse → M6 flags unresolvable) |
| M4-66 | `review before the next review` | task kept whole when `before` clause is not a date and is not a `by/before/due` clause M6 accepts; test pins the rule in the plan |
| M4-67 | `schedule cutover for Saturday 10 Oct` | no `by`; full weekday-plus-date counts → due `Saturday 10 Oct` |
| M4-68 | `schedule cutover for Saturday` | `for` + bare weekday is **not** a due → stays in task |
| M4-69 | `prepare the renewal one-pager by Friday` | `one-pager` intact; due Friday |
| M4-70 | `check standby power` / `bypass the proxy` | no due; `by` inside words ignored |
| M4-71 | `cut cloud costs by 10%` | no due |
| M4-72 | `send quote by Friday please` | `by Friday` is not at the end → no due; test pins behaviour |
| M4-73 | `send quote by Friday.` (trailing full stop) | due `Friday`, punctuation trimmed |
| M4-74 | Two due-like phrases `send by Friday by Monday` | only the last is cut |
| M4-75 | Task that is only a date `by Friday` | task empty → dropped with warning `[GAP]` |
| M4-76 | `meet at 5 by the lake` | no due |
| M4-77 | Mid-text month names `review March sales figures` | no due |

## D. Table candidates

| ID | Cells | Expected |
|---|---|---|
| M4-80 | owner `Anita`, action `Publish brand kit`, due `2026-10-09` | owner Anita, task as is, dueRaw `2026-10-09` |
| M4-81 | owner empty | `ownerRaw = ''` `[GAP]` |
| M4-82 | due empty | `dueRaw = null` `[GAP]` |
| M4-83 | action cell also contains `by Friday` while due cell is set | due cell wins; task untouched |
| M4-84 | owner `Priya` | `ownerRaw = 'Priya'`; resolution later `[NAME]` |
| M4-85 | due cell holds prose `after the cutover` | passed as is; M6 returns unresolvable |

## E. Whole-pipeline checks

| ID | Case | Expected |
|---|---|---|
| M4-90 | Every candidate in the 33 fixture files | parses with a **non-empty task**; none throws |
| M4-91 | Repeated lines across weeks `[DUP]` | `Priya to send the revised quote to Acme` and `Priya N. to send revised quote to Acme — by Friday` give the same owner family and a task differing only in the optional word `the`, so M7 can match them |
| M4-92 | Ambiguous owners `[NAME]` | `Priya to sign off` (09-17), `Rahul to review Anita's PR` (10-07), `Priya to own the hiring plan`, `Rahul to prepare the architecture overview` (09-30): `ownerRaw` is bare first name |
| M4-93 | No-owner items in `untitled.md` `[GAP]` | parsed; task non-empty; owner and due may be empty |
| M4-94 | Raw wording kept | `task` never lower-cased, re-ordered or re-worded |
| M4-95 | Property: random strings | never throws; `task + dueRaw` content is always a subset of the input |
| M4-96 | Snapshot of all parsed lines | matches reviewed snapshot |

## Done when

All 14 sample rows (A) are exact, E-90 passes, and the edge cases in the plan (apostrophe, `Saturday 10 Oct`, `one-pager`, `standby`) are green.
