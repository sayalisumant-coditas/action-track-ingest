# Tasks — M9 Ingest orchestrator

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

Depends on: M1–M8.

## Implementation (from plan.md)

- [x] 1. Wire the stages; each takes and returns typed data (no shared mutable state)
- [x] 2. Wrap `processFile` in try/catch; on error record `{file, reason:'unreadable', message}` and continue
- [x] 3. Header-but-zero-candidates files: keep meeting, add `skipped` reason `no-actions`
- [x] 4. Collect warnings from every stage with file and line
- [x] 5. Report builder: summary numbers, per-code warning counts, details only in `--verbose`
- [x] 6. Persist via M8; store `lastIngest` with the report
- [x] 7. Property tests: random byte files and shuffled order never throw, equal results
- [x] 8. Fixture integration test + snapshot of `items.json` and the report
- [x] `ingest(dir, opts)`, `processFile`, `buildReport`, `exitCodeFor`

## Tests (from plan.md)

- [x] Acceptance criteria 1–6 and 14
- [x] Folder with only bad files → exit 0, all skipped, empty items
- [x] Missing folder → `FolderError`, non-zero exit
- [x] Re-ingest after editing one file changes only that file's items
- [x] Sample-folder report numbers: 35 scanned, 33 read, 2 skipped, 33 meetings, 3 ignored, `DATE_INFERRED` ×1, `OWNER_AMBIGUOUS` ×7 (plan said ×5; the M5 snapshot has 7), `DUE_UNRESOLVABLE` ×1
- [x] (Suggested) write `tests.md` for M9 (short index of the test files)

## Done when

- [x] Full sample folder ingests without an exception
- [x] Report numbers match the expected report
- [x] Running ingest twice gives an identical store
