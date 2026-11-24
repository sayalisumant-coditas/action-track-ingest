# Tests — M8 Store and overrides

Plan: [plan.md](plan.md) · Files under test: `store.ts`, `overrides.ts`, `paths.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

All tests use a temp folder and an **injected clock** fixed at `2026-11-24T10:00:00.000Z`.

## A. `emptyStore`, `loadStore`

| ID | Case | Expected |
|---|---|---|
| M8-01 | `emptyStore()` | `version 1`, empty `meetings`, `items`, `overrides`, `drafts`, no `lastIngest` |
| M8-02 | `loadStore` on a missing file | empty store, **no file created** |
| M8-03 | Load a valid store | data equals what was saved |
| M8-04 | Invalid JSON (`{ "items": [`) | throws `StoreError` naming the file `[BAD]` |
| M8-05 | Empty file (0 bytes) | `StoreError` (not silently empty) `[BAD]` |
| M8-06 | Unknown version (`"version": 99`) | `StoreError` with the version in the message `[BAD]` |
| M8-07 | Missing `version` | `StoreError` `[BAD]` |
| M8-08 | Valid JSON but wrong shape (`items` is an object) | `StoreError` `[BAD]` |
| M8-09 | Corrupt file is never modified | bytes and mtime unchanged after a failed load `[BAD]` |
| M8-10 | A later `saveStore` after a failed load | not called by the app; the test checks `ingest` aborts rather than overwrites `[BAD]` |
| M8-11 | Path is a directory | `StoreError`, no crash `[BAD]` |
| M8-12 | `migrate(store)` on v1 | returned unchanged |
| M8-13 | Store with BOM | loads |

## B. `saveStore`

| ID | Case | Expected |
|---|---|---|
| M8-20 | Save then load | identical data (round trip) |
| M8-21 | Folder does not exist | created |
| M8-22 | Nested folder path 3 levels deep | created |
| M8-23 | Output format | 2-space indent, stable key order; two saves of equal data are byte-identical |
| M8-24 | Items order | saved in (meeting date, file, line) order |
| M8-25 | Atomic write | a temp file in the same folder is written, then renamed; no half-written target at any point |
| M8-26 | Crash simulation | throw between temp write and rename → the **old** store is intact and still loads |
| M8-27 | Leftover temp file from an earlier crash | does not break the next save |
| M8-28 | Windows: target exists | rename-over-existing works (or falls back to copy + unlink) |
| M8-29 | Rename fails (mocked `EPERM`) | fallback path is used; data correct; temp file removed |
| M8-30 | Read-only folder (mocked) | throws `StoreError` with a clear message; old file untouched |
| M8-31 | Unicode in task text (accents, emoji) | round trips |
| M8-32 | Very large store (5,000 items) | saves in under 1 s |
| M8-33 | No code path writes the store non-atomically | grep test: only `saveStore` calls `fs.writeFile` on the store path |

## C. `paths`

| ID | Case | Expected |
|---|---|---|
| M8-40 | No flag, no env | `./.actiontrack/store.json` |
| M8-41 | `ACTIONTRACK_STORE` set | env path used |
| M8-42 | `--store` and env both set | flag wins |
| M8-43 | Relative path | resolved against the working directory |
| M8-44 | Path with spaces | works |

## D. `applyIngest`

| ID | Case | Expected |
|---|---|---|
| M8-50 | First ingest into an empty store | meetings, items and `lastIngest` filled |
| M8-51 | Second ingest of the same data `[DUP]` | byte-identical file apart from `lastIngest.at` (injected clock, so fully identical here) |
| M8-52 | Counts after two ingests `[DUP]` | same item count; no duplicates (acceptance 14) |
| M8-53 | Same ids after two ingests | identical |
| M8-54 | One file changed | only that file's items change; the rest untouched |
| M8-55 | Task text edited in a note | item for that line is updated |
| M8-56 | Line deleted from a note | old item **kept**, flag `missing-from-notes`; not deleted |
| M8-57 | `missing-from-notes` item comes back in a later ingest | flag cleared |
| M8-58 | Whole file deleted from the folder | its items kept, flagged `missing-from-notes` |
| M8-59 | Item merged across 3 files, one file's line removed | item kept; that occurrence marked missing; other occurrences live `[DUP]` |
| M8-60 | New file added | new items appear; old unchanged |
| M8-61 | Overrides and drafts | untouched by `applyIngest` |
| M8-62 | `lastIngest` | holds the clock time and the report |
| M8-63 | Items from files not part of this ingest (ingesting a second folder) | pinned: kept as is; test documents that a different folder merges into the store |
| M8-64 | Empty ingest (folder had only bad files) `[BAD]` | store keeps existing items; no wipe |
| M8-65 | Ambiguous-owner item `[NAME]` | stored with `kind: ambiguous` and candidates; reloads identically |
| M8-66 | Unassigned and no-date items `[GAP]` | stored with `owner.kind = unassigned`, `due.date = null`, raw kept |
| M8-67 | Meeting with null date `[GAP]` | stored with `date: null` |

## E. `applyOverrides` and `markDone`

| ID | Case | Expected |
|---|---|---|
| M8-70 | `markDone` on an open item | override created with `doneAt` from clock; `changed = true` |
| M8-71 | `markDone` twice | second returns `changed = false`; `doneAt` unchanged |
| M8-72 | `markDone` then re-ingest where notes still show `[ ]` | item stays `done` (acceptance 10, F-DON-4) |
| M8-73 | `markDone` on an item the notes already show done | `changed = false`; no override needed, or override harmless (pinned) |
| M8-74 | Merged item `[DUP]` | marking done applies to the whole item (all occurrences) |
| M8-75 | Item later flagged `missing-from-notes` | stays `done` |
| M8-76 | `doneBy` | `cli` for overrides, `notes` for notes |
| M8-77 | Unknown id | `UnknownIdError` |
| M8-78 | Unique prefix `a3f` | resolves to the full id |
| M8-79 | Prefix matching two ids | error that lists both ids |
| M8-80 | Prefix shorter than 2 characters (`a`) | rejected with a clear message (pinned) |
| M8-81 | Prefix in upper case | matches (ids are lower-case hex) |
| M8-82 | Empty id | `UnknownIdError` `[BAD]` |
| M8-83 | Override for an id that no longer exists | ignored on read; kept in the file |
| M8-84 | `applyOverrides` is pure | input items are not mutated |
| M8-85 | Every read path | `list` and `followup` call `applyOverrides` before filtering |
| M8-86 | An override never reopens an item | only `done` overrides exist in v1 |

## F. Drafts

| ID | Case | Expected |
|---|---|---|
| M8-90 | `recordDraft` | stored under the person id with `draftId` and `createdAt` from the clock |
| M8-91 | `getDraft` for an unknown person | `undefined` |
| M8-92 | Record twice for the same person | second replaces the first |
| M8-93 | Drafts survive re-ingest | unchanged |
| M8-94 | Ambiguous owners | no draft record can be created for `?priya` `[NAME]` |

## G. Integration on the sample folder

| ID | Case | Expected |
|---|---|---|
| M8-100 | Ingest → save → load | equals in-memory result |
| M8-101 | Ingest twice | identical file (acceptance 14) |
| M8-102 | Ingest, `markDone` a quote item, ingest again | item still `done` |
| M8-103 | Edit one fixture copy (temp), re-ingest | only that file's items differ |
| M8-104 | Remove a line from a fixture copy | item kept, flagged |
| M8-105 | Corrupt the store file by hand | next `ingest` and `list` stop with `StoreError`; file untouched |

## Done when

Acceptance 10 and 14 pass at store level, the crash simulation (M8-26) leaves the old store intact, and the grep test M8-33 passes.
