# Tests — M12 CLI

Plan: [plan.md](plan.md) · Files under test: `index.ts`, `commands/*`, `format.ts`, `errors.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

Two layers: **unit** (render functions, `handleError`, `buildProgram` parsing) and **end-to-end** (spawn the built binary against a temp store and a copy of the fixture folder). E2E tests check stdout, stderr and exit codes. Default args: `--store <tmp>/store.json --no-color`.

## A. Program and help

| ID | Case | Expected |
|---|---|---|
| M12-01 | `actiontrack --help` | lists `ingest`, `list`, `done`, `followup` and global options `--store`, `--config`, `--no-color` |
| M12-02 | `actiontrack --help` | includes the date rules (`DATE_RULES_HELP`), mentions same-weekday = +7 |
| M12-03 | `actiontrack <cmd> --help` for each command | shows its options |
| M12-04 | No command | prints help; exit code 1 |
| M12-05 | Unknown command (`actiontrack foo`) | clear message; exit 1 |
| M12-06 | `actiontrack --version` | prints the package version |
| M12-07 | `package.json` bin | `actiontrack` resolves after `npm link` |
| M12-08 | No `send` command or flag exists | help text has none |

## B. `ingest`

| ID | Case | Expected |
|---|---|---|
| M12-10 | `ingest <fixtures>` | exit 0; report shows 2 skipped (acceptance 1) |
| M12-11 | Skipped list | names `2026-09-09-notes-final-v2.md` (empty) and `scratch.md` (binary); `.txt` not mentioned `[BAD]` |
| M12-12 | Report numbers | files read 33, meetings 33, items per snapshot |
| M12-13 | `untitled.md` | ingested with unknown meeting; listed in warnings for unresolved relative dues `[GAP]` |
| M12-14 | Warnings grouped by code | `DATE_INFERRED` ×1, `OWNER_AMBIGUOUS` ×5, `DUE_UNRESOLVABLE` … |
| M12-15 | Without `--verbose` | counts per code only |
| M12-16 | With `--verbose` | per-warning detail, ignored candidates (blockquote 1, code 1, comment 1), uncertain merges |
| M12-17 | Missing folder | exit 1; message includes the path `[BAD]` |
| M12-18 | Folder is a file | exit 1 |
| M12-19 | Folder with only bad files | exit **0**; all listed as skipped `[BAD]` |
| M12-20 | Empty folder | exit 0; "0 files" |
| M12-21 | Corrupt store | exit 1; `StoreError` message; file untouched `[BAD]` |
| M12-22 | `--recursive` | picks up sub-folder notes; without it, does not |
| M12-23 | **Run ingest twice** `[DUP]` | identical report counts and item ids; no new items (acceptance 14) |
| M12-24 | `--json` | stdout parses as JSON; has `filesRead`, `meetings`, `items`, `skipped`, `warnings`; no text noise on stdout |
| M12-25 | `--config <path>` with an alias for Priya in 09-17 `[NAME]` | `OWNER_AMBIGUOUS` count drops to 4 |
| M12-26 | `--config` with malformed JSON | exit 1; message names the file |
| M12-27 | Exit code for per-file problems | never non-zero |

## C. `list`

| ID | Case | Expected |
|---|---|---|
| M12-30 | `list --as-of 2026-10-15` | table with `ID · OWNER · TASK · DUE · STATUS · SOURCE`; not-done items only |
| M12-31 | `list --status overdue --as-of 2026-10-15` | no row with an empty due; no done rows (acceptance 8) |
| M12-32 | `list --due-before 2026-10-01` | no `no due date` rows (acceptance 9) |
| M12-33 | `list --owner "Priya Shah"` | only Shah's rows (acceptance 7) |
| M12-34 | `list --owner Priya` `[NAME]` | exit 1; message names **both** Priya Nair and Priya Shah |
| M12-35 | `list --owner Rahul` `[NAME]` | exit 1; names both Rahuls |
| M12-36 | `list --owner none` `[GAP]` | shows unassigned rows incl. "Someone to update the CRM notes" |
| M12-37 | `list --owner Zed` | empty result with a notice; exit 0 |
| M12-38 | `list --status nonsense` | usage error; exit 1; lists valid values `[BAD]` |
| M12-39 | `list --due-before notadate` | usage error; exit 1 `[BAD]` |
| M12-40 | `list --as-of notadate` | usage error; exit 1 `[BAD]` |
| M12-41 | Unassigned rows `[GAP]` | owner column shows `unassigned` |
| M12-42 | No-date rows `[GAP]` | due column shows `no due date` |
| M12-43 | Ambiguous owner row `[NAME]` | shows `Priya (Nair or Shah?)` |
| M12-44 | Group owner row | shows `Everyone` (or the raw group word) |
| M12-45 | Merged item `[DUP]` | exactly one row (e.g. wireframes) |
| M12-46 | Done items | hidden by default; shown with `--status done` |
| M12-47 | Empty result | prints "no matching items"; exit 0 |
| M12-48 | Column widths | long tasks truncated to terminal width; ids never truncated |
| M12-49 | Joint-owner row | both names shown |
| M12-50 | `list` with no store yet | clear hint to run `ingest` first; exit 1 |
| M12-51 | Same command twice | identical output |
| M12-52 | `--status overdue` rows | all carry the overdue marker |

## D. `--json`

| ID | Case | Expected |
|---|---|---|
| M12-60 | `list --json` | valid JSON array; stdout contains nothing else |
| M12-61 | Row set | same ids in the same order as the table |
| M12-62 | Schema | each row has `id`, `owner`, `ownerAmbiguity`, `task`, `due`, `dueRaw`, `status`, `source` |
| M12-63 | Missing owner or due `[GAP]` | `owner` shows `unassigned` / `due` is `null`; keys present |
| M12-64 | Ambiguous owner `[NAME]` | `ownerAmbiguity = "ambiguous"` and candidates listed |
| M12-65 | Empty result | `[]` |
| M12-66 | Schema stability | snapshot of the JSON keys |
| M12-67 | `--json` and colour | no ANSI codes in JSON output |

## E. `done`

| ID | Case | Expected |
|---|---|---|
| M12-70 | `done <id>` | message "marked done"; exit 0 |
| M12-71 | `done <id>` again | prints "already done"; exit 0 |
| M12-72 | `done <unknown>` | exit 1; clear message |
| M12-73 | `done` with unique prefix | works |
| M12-74 | `done` with an ambiguous prefix | exit 1; lists matching ids |
| M12-75 | `done` then `ingest` again | item still `done` (acceptance 10) |
| M12-76 | `done` on a merged item `[DUP]` | whole item done; `list` shows it once as done |
| M12-77 | `done` with no argument | usage error; exit 1 `[BAD]` |
| M12-78 | `done` then `list` | item gone from default list |
| M12-79 | `done` with a corrupt store | `StoreError`; file untouched `[BAD]` |

## F. `followup`

| ID | Case | Expected |
|---|---|---|
| M12-80 | `followup "Karan Joshi" --dry-run --as-of 2026-10-15` | prints draft; overdue first; nothing written (acceptance 11) |
| M12-81 | `--dry-run` | store file and `.actiontrack/drafts/` unchanged |
| M12-82 | `followup "Karan Joshi" --gmail mock` | one draft file; id printed; nothing sent |
| M12-83 | `followup Priya` `[NAME]` | exit 1; refuses; lists both Priyas (acceptance 12) |
| M12-84 | `followup "Priya Nair"` | draft created |
| M12-85 | Second run, no `--replace` `[DUP]` | warning; no new draft; exit 0 |
| M12-86 | Second run with `--replace` | new draft recorded |
| M12-87 | Person with no open items | "no open items"; exit 0; no draft |
| M12-88 | Missing email | draft with empty To; warning shown |
| M12-89 | `--include-group` | group items included |
| M12-90 | Security-review items (acceptance 13) | only attendees get them; draft body holds task text only |
| M12-91 | `followup` for an unassigned or `none` owner `[GAP]` | refused with a clear message |
| M12-92 | `--gmail mcp`, connector not set up | clear message; exit 1; nothing sent |
| M12-93 | `--gmail bogus` | usage error `[BAD]` |
| M12-94 | `renderDraft` | shows To, Subject, Body, item ids, warnings |

## G. Output and colour

| ID | Case | Expected |
|---|---|---|
| M12-100 | stdout not a TTY (piped) | no ANSI codes |
| M12-101 | TTY and no flag | overdue rows red; `unassigned` and `no due date` dim |
| M12-102 | `--no-color` on a TTY | no ANSI codes |
| M12-103 | `NO_COLOR` env set | no ANSI codes |
| M12-104 | `renderTable` unit | correct columns for a fixed item set (snapshot) |
| M12-105 | `renderReport` unit | counts, skipped reasons, warnings by code (snapshot) |
| M12-106 | Narrow terminal (40 columns) | no wrapping that breaks rows |
| M12-107 | Windows console | paths printed with correct separators; no garbled characters |

## H. Errors and exit codes

| ID | Case | Expected |
|---|---|---|
| M12-110 | `FolderError` | message + exit 1 |
| M12-111 | `StoreError` | message + exit 1 |
| M12-112 | `AmbiguousOwnerError` | message lists candidates + exit 1 |
| M12-113 | `UnknownIdError` | message + exit 1 |
| M12-114 | Usage error | message + usage hint + exit 1 |
| M12-115 | Unexpected error (injected `TypeError`) | short message and a hint to use `--verbose`; exit 1 |
| M12-116 | `--verbose` with unexpected error | stack trace printed |
| M12-117 | Skipped files | never cause a non-zero exit |
| M12-118 | Every error | says what happened and what to do (NFR-6): test checks each message contains an action hint |
| M12-119 | Errors go to stderr, results to stdout | verified in e2e |

## I. Whole acceptance run through the real binary

| ID | Acceptance | Expected |
|---|---|---|
| M12-130 | 1 | `ingest` exit 0; two skipped files; `untitled.md` ingested |
| M12-131 | 2 | `list --json` has no refund, code-block or hardware-token item |
| M12-132 | 3 | quote-to-Acme once, done, 3 occurrences |
| M12-133 | 4 | cloud-budget once, done |
| M12-134 | 5 | wireframes once, due 2026-09-24 with history |
| M12-135 | 6 | 9 offsite items, Priya and Rahul ambiguous, Everyone due 2026-10-07 |
| M12-136 | 7 | `list --owner Priya` disambiguation; `list --owner "Priya Shah"` works |
| M12-137 | 8 | `list --status overdue --as-of 2026-10-15` correct |
| M12-138 | 9 | `list --due-before 2026-10-01` correct |
| M12-139 | 10 | `done` then `ingest` leaves item done |
| M12-140 | 11 | `followup "Karan Joshi" --dry-run` then real draft; nothing sent |
| M12-141 | 12 | `followup Priya` refused; `followup "Priya Nair"` works |
| M12-142 | 13 | security-review items only to attendees |
| M12-143 | 14 | `ingest` twice gives identical counts and ids |

## Done when

All four commands work end to end on the sample folder and rows M12-130 to M12-143 pass through the real binary.
