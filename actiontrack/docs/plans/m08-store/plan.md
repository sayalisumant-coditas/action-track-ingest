# Plan M8 — Store and overrides

**Goal**: persist items and protect human edits (`done` marks, sent drafts) across re-ingest.
**Requirements**: F-ING-4, F-ING-5, F-DON-1..4, NFR-3 · **Milestone**: 4 · **Depends on**: M7
**Files**: `src/core/store/store.ts`, `overrides.ts`, `paths.ts`

## File shape

```json
{ "version": 1, "meetings": [], "items": [],
  "overrides": { "<itemId>": { "status": "done", "doneAt": "ISO" } },
  "drafts": { "<personId>": { "draftId": "...", "createdAt": "ISO" } },
  "lastIngest": { "at": "ISO", "report": {} } }
```

Default path `./.actiontrack/store.json`; override with `--store <path>` or `ACTIONTRACK_STORE`.

## Functions

| Function | Behaviour |
|---|---|
| `loadStore(path)` | Missing file → empty store. Invalid JSON or unknown `version` → `StoreError` (never overwrites the bad file). |
| `saveStore(path, store)` | Write to a temp file in the same folder, then rename (atomic). Create the folder if needed. Stable key order and 2-space indent so diffs are readable. |
| `applyIngest(store, meetings, items, report, clock)` | Replaces `meetings` and `items` from the ingested folder, keeps `overrides` and `drafts`. Previously stored items whose source line no longer exists get flag `missing-from-notes`. |
| `applyOverrides(items, overrides)` | A `done` override wins over notes. Called at the end of ingest and on every read. |
| `markDone(store, idOrPrefix, clock)` | Resolves a unique id prefix; sets the override and `doneAt`; idempotent (already done → `changed = false`). Unknown id → `UnknownIdError`; prefix matching several → error listing them. |
| `recordDraft(store, personId, draftId, clock)` / `getDraft(store, personId)` | Used by follow-up. |

## Tasks

1. Types and `emptyStore()`.
2. `loadStore` / `saveStore` with atomic write; handle Windows rename-over-existing (write temp then `fs.rename`, falling back to copy+unlink if it fails).
3. `applyIngest` including the `missing-from-notes` logic: compare previous item ids with new ids from the same source files.
4. `applyOverrides` and `markDone` (with prefix match).
5. Draft record functions.
6. Version field and a migration hook (`migrate(store)`) with only v1 for now.
7. Tests.

## Tests

- Fresh ingest → save → load returns identical data.
- Ingest twice → byte-identical file (apart from `lastIngest.at` which comes from the injected clock).
- `markDone` then re-ingest: item still `done` even though the notes show `[ ]`.
- A line removed from a note → item kept, flagged `missing-from-notes`.
- Corrupt JSON → `StoreError`, file untouched.
- Two ids that share a prefix: `done ab` fails with a message listing both.
- Crash simulation: kill between temp write and rename leaves the old store intact.

## Done when

Acceptance criteria 10 and 14 are met at the store level, and no code path writes the store file non-atomically.
