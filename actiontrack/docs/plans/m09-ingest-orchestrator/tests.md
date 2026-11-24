# Tests — M9 Ingest orchestrator

Plan: [plan.md](plan.md) · Files under test: `ingest.ts`, `report.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

This module is where all four edge cases meet. It is the single guarantee that **a malformed note never crashes the tool and is reported, not hidden**. Tests use temp folders built from fixtures, an injected clock and a temp store.

## A. Malformed notes: skip and report `[BAD]`

| ID | Folder contents | Expected |
|---|---|---|
| M9-01 | One empty `.md` | exit 0; `skipped = [{file, reason:'empty'}]`; 0 items |
| M9-02 | One PNG-as-`.md` | `skipped` reason `binary`; no throw |
| M9-03 | Whitespace-only file | `empty` |
| M9-04 | Folder with **only** bad files (empty + binary + whitespace) | exit 0; every file listed in `skipped`; items empty; store saved empty |
| M9-05 | One good file + one empty + one binary | good file's items stored; the two bad files reported with reasons |
| M9-06 | Bad file placed first alphabetically, then good files | processing continues past it |
| M9-07 | Bad file in the middle of 10 good files | same items as without the bad file |
| M9-08 | Unreadable file (mock `fs` to throw `EACCES`) | `skipped` reason `unreadable`; others processed |
| M9-09 | Parser throws inside `processFile` (inject a stage that throws for one file) | caught; `skipped` reason `unreadable` with `message`; other files processed; exit 0 |
| M9-10 | Every stage injected to throw once (header, extractor, line, due) | one test each; never escapes `ingest` |
| M9-11 | Front matter with broken YAML | file still ingested using filename title; warning present; **not** skipped |
| M9-12 | Unclosed code fence | warning `FENCE_UNCLOSED`; items before the fence kept |
| M9-13 | Meeting header but no action items | meeting kept; `skipped` entry reason `no-actions` (informational) |
| M9-14 | Prose-only file, no header | ingested as meeting `unknown`, no items; `no-actions` |
| M9-15 | `.txt` file with a checkbox | never read; absent from report entirely |
| M9-16 | Binary file named `.MD` (uppercase) | `binary` |
| M9-17 | Property test: 100 random byte files plus 100 random text files | `ingest` never throws; every file appears either in `meetings` or `skipped` |
| M9-18 | File that disappears mid-run | `unreadable`, no crash |
| M9-19 | Skipped files in the report | each has a **reason** and the file name; none silently dropped |

## B. Duplicates across meetings `[DUP]`

| ID | Case | Expected |
|---|---|---|
| M9-30 | Fixture folder: quote-to-Acme (09-01, 09-08, 09-15) | stored once, `done`, 3 occurrences (acceptance 3) |
| M9-31 | Cloud budget (09-01, 09-15, 09-22) | once, `done` (acceptance 4) |
| M9-32 | Wireframes | once, due 2026-09-24, `dueHistory` has the slip (acceptance 5) |
| M9-33 | Different stage same topic (estimate vs start SSO spike) | two items |
| M9-34 | Same task, different owner | two items |
| M9-35 | Borderline pair | not merged; listed in `uncertainMerges` with both ids and score |
| M9-36 | Same file ingested **twice in the same run** (copied under two names) | items merge by meeting + text; ids stable; no crash |
| M9-37 | **Ingest the folder twice** | same store bytes, same ids, no new items (acceptance 14) |
| M9-38 | Re-ingest after `done <id>` | item still done (acceptance 10) |
| M9-39 | Same line twice in one note | merged with a warning |
| M9-40 | Total occurrences | equals the total candidate count (nothing lost in merging) |

## C. Missing owner and missing date `[GAP]`

| ID | Case | Expected |
|---|---|---|
| M9-50 | `Someone to update the CRM notes` (09-10) | stored, owner `unassigned`, due null; not dropped; no crash |
| M9-51 | `TBD to write the design-system changelog` (09-18) | stored, `unassigned` |
| M9-52 | `Team to decide on the launch date` | stored, owner `group`, no due |
| M9-53 | No-owner line (no `X to` pattern) | stored, `unassigned`, task = full text |
| M9-54 | No due date | stored, `due.date = null`, `raw = null`, no warning (a missing date is normal) |
| M9-55 | Unresolvable due (`by the end of the cutover`) | stored, `due.date = null`, raw kept, warning `DUE_UNRESOLVABLE` |
| M9-56 | `untitled.md` | ingested as meeting `unknown`, no date; items stored `[GAP]` |
| M9-57 | `untitled.md` item with a relative due (`by Friday`) | `due.date = null`, `no-meeting-date`, flagged in the report (acceptance 1) |
| M9-58 | `2026-10-03-sales-pipeline` (unparseable header date) | meeting date 2026-10-03 inferred; `DATE_INFERRED` ×1; relative dues marked `inferred` |
| M9-59 | `2026-09-23-standup` (no attendees) | ingested; owners resolved by directory; Rahul ambiguous |
| M9-60 | Item with both no owner and no due | stored with both states |
| M9-61 | Table row with empty owner and empty due | stored |
| M9-62 | Counts | report counts of `unassigned` and `no due date` items are shown |

## D. Same first name `[NAME]`

| ID | Case | Expected |
|---|---|---|
| M9-70 | 09-17: `Priya to sign off` (both Priyas present) | stored `ambiguous`, candidates Nair and Shah, `OWNER_AMBIGUOUS` |
| M9-71 | 09-30 offsite: `Priya to own the hiring plan` and `Rahul to prepare the architecture overview` | both ambiguous (2 warnings) |
| M9-72 | 10-07: `Rahul to review Anita's PR` | ambiguous |
| M9-73 | 09-23: `Rahul…` with no attendee list | ambiguous |
| M9-74 | 09-03 (`Rahul`, `Priya` with one of each attending) | Rahul Verma, Priya Shah; no warning |
| M9-75 | 09-02 (`Rahul`, only Mehta attends) | Rahul Mehta |
| M9-76 | 09-29: `Priya S.` and `Priya N.` | resolved, no warning |
| M9-77 | Whole-folder ambiguous set | **7** lines (the spec first said 5): 09-17 Priya, 09-23 Rahul, 09-30 Priya, 09-30 Rahul, 10-07 Rahul, plus 10-08 Priya and `untitled.md` Priya; matches the M5 snapshot |
| M9-78 | Config alias `{"2026-09-17-billing-migration-sync.md": {"Priya": "Priya Nair"}}`, re-ingest | 09-17 item becomes Priya Nair; item id unchanged; ambiguity warning gone |
| M9-79 | Ambiguity never merges two different Priyas | tested with the same task text on two meetings |
| M9-80 | Directory is built **before** owner resolution | an attendee listed only in a later file still resolves in an earlier file |

## E. Report contents

| ID | Case | Expected |
|---|---|---|
| M9-90 | Fixture folder: files scanned | **35** |
| M9-91 | Read OK / skipped | 33 / 2 (`2026-09-09-notes-final-v2.md` empty, `scratch.md` binary) (acceptance 1) |
| M9-92 | Meetings | 33 (untitled counts as unknown) |
| M9-93 | Ignored candidates | 3: blockquote (09-21), code (10-09), comment (10-09) |
| M9-94 | `DATE_INFERRED` | ×1 (10-03) |
| M9-95 | `OWNER_AMBIGUOUS` | 7 (see M9-77) |
| M9-96 | `DUE_UNRESOLVABLE` | present for each unparseable phrase |
| M9-97 | No stored item from ignored lines (acceptance 2) | no refund line, no code-block item, no hardware-tokens item |
| M9-98 | 09-30 offsite items (acceptance 6) | the 9 expected items; Karan validation has `parentId` of Meera's item; Everyone due 2026-10-07; brand kit 2026-10-09; Karan summary 2026-10-01 |
| M9-99 | Warnings carry `file`, `line`, `code`, `message` | all four present |
| M9-100 | Warnings grouped by code in summary; details only with `--verbose` | both views built by `buildReport` |
| M9-101 | `exitCodeFor` | 0 when ≥ 1 file processed; 0 for the all-bad folder (pinned: "processed" includes skipped-with-report) |
| M9-102 | Report is JSON-serialisable | `JSON.parse(JSON.stringify(report))` equals report |

## F. Errors and idempotence

| ID | Case | Expected |
|---|---|---|
| M9-110 | Missing folder | `FolderError` naming the path (the only fatal case with `StoreError`) |
| M9-111 | Folder path is a file | `FolderError` |
| M9-112 | Corrupt store file | `StoreError`; store untouched; nothing ingested |
| M9-113 | Empty folder | exit 0; report shows 0 files |
| M9-114 | Edit one file, re-ingest | only that file's items change |
| M9-115 | Remove one file, re-ingest | its items flagged `missing-from-notes` |
| M9-116 | Shuffle file read order (inject scan order) | identical store |
| M9-117 | No `Date.now()` | clock is injected; two runs at different "times" differ only in `lastIngest.at` |
| M9-118 | Performance | 200 synthetic files ingest in under 5 s (NFR-2) |
| M9-119 | Recursive option | files in sub-folders included only when `recursive: true` |
| M9-120 | Snapshots | `items.json` and the report match the reviewed snapshots |

## Done when

Full sample folder ingests with no exception, numbers in E match, M9-37 passes (idempotent), and the all-bad folder (M9-04) exits 0 with every file reported.
