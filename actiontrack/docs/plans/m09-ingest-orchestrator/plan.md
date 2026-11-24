# Plan M9 — Ingest orchestrator

**Goal**: run the full pipeline for a folder and build the ingest report. This is the one place that guarantees "a bad file never crashes the tool".
**Requirements**: F-ING-1..6, NFR-1, NFR-3 · **Milestone**: 4 · **Depends on**: M1–M8
**Files**: `src/core/ingest.ts`, `src/core/report.ts`

## Pipeline

```
scanFolder → for each file:
   readNote ──fail──▶ report.skipped(reason)
      │ ok
      ▼
   try { parseMeetingHeader → extractCandidates → parseCandidate each → resolveDue each }
   catch ─▶ report.skipped('unreadable') + warning, continue
 → buildDirectory(all meetings, config)
 → resolveOwner for each parsed line (needs the directory)
 → mergeOccurrences
 → applyIngest + applyOverrides → saveStore
 → return IngestReport
```

Owner resolution runs after the directory is built because the directory comes from all meetings' attendee lists.

## Functions

| Function | Behaviour |
|---|---|
| `ingest(dir, opts)` | `opts`: `{store, config, recursive, clock}`. Returns `IngestReport`. Throws only `FolderError` / `StoreError`. |
| `processFile(path, ctx)` | The per-file step inside try/catch; returns `{meeting, parsed[], ignored[], warnings[]}` or a skip. |
| `buildReport(parts)` | Counts, skipped list with reasons, warnings grouped by code, uncertain merges, ignored candidates. |
| `exitCodeFor(report)` | 0 when at least one file was processed; 1 never from per-file problems. |

## Tasks

1. Wire the stages; each stage takes and returns typed data (no shared mutable state).
2. Wrap `processFile` in try/catch; on error record `{file, reason:'unreadable', message}` and continue.
3. Files with a meeting header but zero candidates: keep the meeting, add `skipped` reason `no-actions` (informational).
4. Collect warnings from every stage with file and line.
5. Report builder: summary numbers, per-code warning counts, details only in `--verbose`.
6. Persist via M8; store `lastIngest` with the report.
7. Property tests: random byte files and shuffled file order never throw and give equal results.
8. Fixture integration test and snapshot of `items.json` and the report.

## Expected report for the sample folder

- Files scanned: 35 (`.md` only). Read OK: 33. Skipped: 2 (`2026-09-09-notes-final-v2.md` empty, `scratch.md` binary).
- Meetings: 33 (`untitled.md` counts as a meeting with unknown details).
- Ignored candidates: 3 (blockquote 09-21, code block 10-09, comment 10-09).
- Warnings include `DATE_INFERRED` ×1 (10-03), `OWNER_AMBIGUOUS` (09-17, 09-23, 09-30 ×2, 10-07), `DUE_UNRESOLVABLE` for unparseable phrases, and the untitled file's unresolved relative due date.

## Tests

- Acceptance criteria 1–6 and 14 from the requirements.
- A folder containing only bad files → exit 0, report lists all skipped, empty items.
- Missing folder → `FolderError`, exit non-zero.
- Re-ingest after editing one file changes only that file's items.

## Done when

The full sample folder ingests without an exception, the numbers above match, and running ingest twice gives an identical store.
