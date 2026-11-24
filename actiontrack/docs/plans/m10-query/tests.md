# Tests — M10 Query (list filters and overdue)

Plan: [plan.md](plan.md) · Files under test: `status.ts`, `list.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

Unit tests use a small in-memory item set. Integration tests use the ingested sample with `--as-of 2026-10-15`. No test reads the real clock.

Small item set (`asOf = 2026-10-15`):

| Item | Owner | Due | Status |
|---|---|---|---|
| a1 | Priya Shah | 2026-10-01 | open |
| a2 | Priya Nair | 2026-10-20 | open |
| a3 | Karan Joshi | 2026-10-15 | open |
| a4 | Karan Joshi | null | open |
| a5 | Sam Okafor | 2026-09-10 | done |
| a6 | unassigned | 2026-10-01 | open |
| a7 | unassigned | null | open |
| a8 | group (Everyone) | 2026-10-07 | open |
| a9 | ambiguous (Nair or Shah) | 2026-10-05 | open |
| a10 | Anita Desai + Rahul Mehta (joint) | 2026-10-10 | open |

## A. `effectiveStatus`, `isOverdue`, `daysOverdue`

| ID | Case | Expected |
|---|---|---|
| M10-01 | a1 | `overdue` |
| M10-02 | a2 (due after as-of) | `open` |
| M10-03 | a3 (due **equal** to as-of) | `open` (strictly before) |
| M10-04 | a4 (no due) `[GAP]` | `open`, never overdue |
| M10-05 | a5 done, past due | `done` (done beats overdue) |
| M10-06 | a7 (no owner, no due) `[GAP]` | `open` |
| M10-07 | `isOverdue` with `due.date = null` | false |
| M10-08 | `daysOverdue(a1)` | 14 |
| M10-09 | `daysOverdue(a3)` | 0 |
| M10-10 | `daysOverdue(a4)`, `daysOverdue(a2)`, done item | 0 |
| M10-11 | Across a month boundary (due 2026-09-28, as-of 2026-10-02) | 4 |
| M10-12 | Across a year boundary (2026-12-30 → 2027-01-02) | 3 |
| M10-13 | Across DST change dates | whole days correct (UTC maths) |
| M10-14 | Unresolved due (null date, raw text kept) `[GAP]` | not overdue |

## B. Status filter

| ID | Filter | Expected |
|---|---|---|
| M10-20 | none | not-done items: a1–a4, a6–a10 (default) |
| M10-21 | `--status open` | same as none (Q4: overdue included) |
| M10-22 | `--status overdue` | a1, a6, a8, a9, a10 (a8 due 10-07, a9 10-05, a10 10-10 are all before 10-15) |
| M10-23 | `--status overdue` never contains null-due items | a4, a7 absent `[GAP]` |
| M10-24 | `--status overdue` never contains done items | a5 absent |
| M10-25 | `--status done` | a5 only |
| M10-26 | `--status nonsense` | usage error from `parseFilters`, message lists valid values `[BAD]` |
| M10-27 | `--status OPEN` (upper case) | accepted (case-insensitive) |

## C. `--due-before`

| ID | Filter | Expected |
|---|---|---|
| M10-30 | `--due-before 2026-10-15` | a1, a6, a8, a9, a10 (a3 excluded: strictly before) |
| M10-31 | `--due-before 2026-10-01` | none of a1 or a6 (due exactly 10-01 excluded) |
| M10-32 | null-due items | always excluded (a4, a7) `[GAP]` |
| M10-33 | `--due-before 2026-10-02` | a1 and a6 included |
| M10-34 | Combined with `--status open` | AND of both |
| M10-35 | Combined with `--status done` and a date before a5's due | empty list, no error |
| M10-36 | `--due-before 2026-02-30` | usage error `[BAD]` |
| M10-37 | `--due-before tomorrow` / `10/10/2026` | usage error `[BAD]` |
| M10-38 | `--due-before ''` | usage error `[BAD]` |
| M10-39 | Does the filter include done items by default? | no: default excludes done unless `--status done` |

## D. Owner filter and the same-first-name case `[NAME]`

| ID | Filter | Expected |
|---|---|---|
| M10-40 | `--owner "Priya Shah"` | a1 only (plus a9 if candidates include Shah, shown as ambiguous; pinned below) |
| M10-41 | `--owner "priya shah"` | same (case-insensitive) |
| M10-42 | `--owner Priya` | throws `AmbiguousOwnerError`; candidates = Priya Nair, Priya Shah; message names both |
| M10-43 | `--owner Rahul` (both Rahuls in directory) | `AmbiguousOwnerError` listing Mehta and Verma |
| M10-44 | `--owner Karan` (unique first name) | a3, a4 |
| M10-45 | `--owner Anita` | a10 (joint owner included) |
| M10-46 | `--owner "Rahul Mehta"` | a10 (joint owner included) |
| M10-47 | `--owner none` `[GAP]` | a6, a7 (unassigned) |
| M10-48 | `--owner everyone` | a8 (group) |
| M10-49 | `--owner Zed` (nobody) | empty result with a notice "no such person"; not a crash |
| M10-50 | Ambiguous item a9 with `--owner "Priya Shah"` | shown, marked ambiguous (it is one of the candidates) |
| M10-51 | Ambiguous item a9 with `--owner "Karan Joshi"` | not shown |
| M10-52 | `--owner Priya` when only one Priya exists in the directory | resolves to that person |
| M10-53 | `--owner "Priya N."` | Priya Nair |
| M10-54 | Owner plus status `--owner Karan --status overdue` | a3 not overdue (due = as-of); result empty |
| M10-55 | Helper-only person (Priya as helper on a Lena item) | not matched as owner |
| M10-56 | `--owner ''` | usage error `[BAD]` |

## E. Sorting and determinism

| ID | Case | Expected |
|---|---|---|
| M10-60 | Order | overdue first; then due ascending; nulls last; then owner name; then id |
| M10-61 | Within overdue, earliest due first | a1 (10-01), a6 (10-01), a9, a8, a10 |
| M10-62 | Tie on due date | owner name, then id decide |
| M10-63 | Nulls last | a4, a7 at the bottom |
| M10-64 | Same query twice | identical order |
| M10-65 | Input shuffled | identical output |
| M10-66 | `queryItems` does not mutate its input | deep-equal check |
| M10-67 | Comparator stable for 1,000 random items | no flicker across runs |

## F. `parseFilters`

| ID | Case | Expected |
|---|---|---|
| M10-70 | No args | defaults, `asOf` from injected clock |
| M10-71 | `--as-of 2026-10-15` | used instead of the clock |
| M10-72 | `--as-of nonsense` | usage error `[BAD]` |
| M10-73 | Different clock values, no `--as-of` | results follow the clock; no `Date.now()` inside `queryItems` |
| M10-74 | Combined valid flags | all kept |
| M10-75 | Unknown flag value types | clear message naming the flag |

## G. Duplicates `[DUP]`

| ID | Case | Expected |
|---|---|---|
| M10-80 | Merged item (3 occurrences) | listed **once** |
| M10-81 | Item done in the latest meeting | absent from default list |
| M10-82 | Item marked done via CLI override | `done`; absent from default list |
| M10-83 | Item flagged `missing-from-notes` and open | still listed (marked) |
| M10-84 | Same task, two owners (two items) | both listed, one per owner |

## H. Integration on the sample (`--as-of 2026-10-15`)

| ID | Case | Expected |
|---|---|---|
| M10-90 | `--status overdue` | no item with null due; no done item (acceptance 8) |
| M10-91 | `--due-before 2026-10-01` | no null-due item; an item due exactly 2026-10-01 excluded (acceptance 9) |
| M10-92 | `--owner Priya` | throws with both Priyas named (acceptance 7) |
| M10-93 | `--owner "Priya Shah"` | only Shah's items (plus ambiguous ones marked) (acceptance 7) |
| M10-94 | `--owner none` `[GAP]` | includes "Someone to update the CRM notes" and "TBD to write the design-system changelog" |
| M10-95 | `untitled.md` items `[GAP]` | present as unassigned and/or no-due where relevant; not dropped |
| M10-96 | Quote-to-Acme item (done) | absent from default list; present with `--status done` |
| M10-97 | Wireframes item | listed once, due 2026-09-24, overdue |
| M10-98 | Offsite Everyone Q4 goals | `--owner everyone` finds it (group) |
| M10-99 | Same query twice | identical rows |
| M10-100 | `queryItems` source | grep: no `fs`, no `Date.now()`, no clock import |

## Done when

Acceptance 7–9 pass, all of A–F pass on the small set, and `queryItems` has no I/O and no direct clock use (M10-100).
