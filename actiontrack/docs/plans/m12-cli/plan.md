# Plan M12 — CLI

**Goal**: the four commands, with clear output and errors. No business logic here.
**Requirements**: all F-* command items, NFR-6 · **Milestone**: 5 (`ingest`, `list`, `done`) and 6 (`followup`) · **Depends on**: M9, M10, M11
**Files**: `src/cli/index.ts`, `src/cli/commands/{ingest,list,done,followup}.ts`, `src/cli/format.ts`, `src/cli/errors.ts`

## Commands

| Command | Options |
|---|---|
| `actiontrack ingest <folder>` | `--recursive`, `--verbose`, `--json` |
| `actiontrack list` | `--owner <name>`, `--status open\|done\|overdue`, `--due-before <date>`, `--as-of <date>`, `--json` |
| `actiontrack done <id>` | id prefix allowed if unique |
| `actiontrack followup <owner>` | `--dry-run`, `--include-group`, `--replace`, `--gmail mock\|mcp`, `--as-of <date>` |

Global options: `--store <path>`, `--config <path>`, `--no-color`.

## Functions

| Function | Behaviour |
|---|---|
| `buildProgram()` | Creates the `commander` program with the commands above and their help text, including the date rules (`DATE_RULES_HELP`). |
| `renderTable(items, asOf)` | Columns `ID · OWNER · TASK · DUE · STATUS · SOURCE`; overdue red, `unassigned` and `no due date` dim; truncate long tasks to the terminal width. |
| `renderReport(report, verbose)` | Counts, skipped files with reasons, warnings grouped by code, uncertain merges. |
| `renderDraft(draft)` | Shows To, Subject, Body, included item ids, warnings. |
| `handleError(e)` | Maps `FolderError`, `StoreError`, `AmbiguousOwnerError`, `UnknownIdError`, usage errors to a message and exit code 1; unknown errors print a short line and hint at `--verbose`. |

## Tasks

1. `index.ts` with the shebang, `buildProgram`, and the central `handleError`.
2. `ingest` command: call `ingest()`, print the report, exit 0 if any file processed.
3. `list` command: `parseFilters` → `queryItems` → table or JSON.
4. `done` command: `markDone`; messages for changed, already done, unknown id.
5. `followup` command: call `followup()`; map flags.
6. Colour only when stdout is a TTY and `--no-color` is not set.
7. Exit codes: 0 success, 1 failure; never non-zero for skipped files.
8. `--json` for `ingest` and `list` (stable schema for scripting).
9. End-to-end tests: spawn the built binary against a temp store and the fixture folder.
10. `npm link` check and a short usage section in the README.

## Example output

```
$ actiontrack list --owner "Priya Shah" --status overdue --as-of 2026-10-15
ID      OWNER        TASK                                  DUE         STATUS
a3f9c1  Priya Shah   Run the invoice rounding tests        2026-10-01  overdue
...
```

## Tests

- `ingest <fixture>`: exit 0; report says 2 skipped.
- `ingest` on a missing folder: exit 1 with the path in the message.
- `list --status nonsense`: usage error, exit 1.
- `list --owner Priya`: message names both Priyas, exit 1.
- `done` unknown id: exit 1; `done` twice: second call prints "already done", exit 0.
- `followup --dry-run`: prints a draft, store and drafts folder unchanged.
- `--json` output parses and matches the table's rows.

## Done when

All four commands work end to end on the sample folder and acceptance criteria 1–14 pass through the real binary.
