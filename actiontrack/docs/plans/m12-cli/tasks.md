# Tasks — M12 CLI

Plan: [plan.md](plan.md) · Tests: none yet (`tests.md` not written; tests listed in plan.md) · Mark `[x]` when done.

Depends on: M9, M10, M11. Milestone 5 (`ingest`, `list`, `done`) and 6 (`followup`).

## Implementation (from plan.md)

- [x] 1. `index.ts` with shebang, `buildProgram`, central `handleError`
- [x] 2. `ingest <folder>` (`--recursive`, `--verbose`, `--json`); exit 0 if any file processed
- [x] 3. `list` (`--owner`, `--status`, `--due-before`, `--as-of`, `--json`): `parseFilters` → `queryItems` → table or JSON
- [x] 4. `done <id>`: `markDone`; messages for changed / already done / unknown id
- [x] 5. `followup <owner>` (`--dry-run`, `--include-group`, `--replace`, `--gmail`, `--as-of`)
- [x] 6. Colour only when TTY and not `--no-color`
- [x] 7. Exit codes: 0 success, 1 failure; never non-zero for skipped files
- [x] 8. Stable `--json` schema for `ingest` and `list`
- [ ] 9. End-to-end tests spawning the built binary against temp store + fixtures
- [ ] 10. `npm link` check and README usage section
- [x] Global options `--store`, `--config`, `--no-color`; help text includes `DATE_RULES_HELP`
- [x] `renderTable`, `renderReport`, `renderDraft`, `handleError`

## Tests (from plan.md)

- [ ] `ingest <fixture>`: exit 0, report says 2 skipped
- [ ] `ingest` on missing folder: exit 1, path in message
- [ ] `list --status nonsense`: usage error, exit 1
- [ ] `list --owner Priya`: names both Priyas, exit 1
- [ ] `done` unknown id: exit 1; `done` twice: "already done", exit 0
- [ ] `followup --dry-run`: prints draft; store and drafts folder unchanged
- [ ] `--json` output parses and matches table rows
- [ ] (Suggested) write `tests.md` for M12 in the same style as other modules

## Done when

- [ ] All four commands work end to end on the sample folder
- [ ] Acceptance criteria 1–14 pass through the real binary
