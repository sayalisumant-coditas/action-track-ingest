# Plan M7 — De-duplication and status carry-over

**Goal**: collapse repeated actions into one item with a history, keep different tasks apart, and carry status forward.
**Requirements**: R3, R6, R8, F-ING-6, F-DON-3 · **Milestone**: 4 · **Depends on**: M4, M5, M6
**Files**: `src/core/dedupe/normalise.ts`, `similarity.ts`, `stageGuard.ts`, `merge.ts`, `src/core/store/ids.ts`

## Functions

| Function | Behaviour |
|---|---|
| `normaliseTask(task)` | Lowercase; strip punctuation, articles and filler words; collapse spaces; light stemming (`finalise`/`finalize`, `updated`/`update`). |
| `ownerKey(owner)` | Sorted person ids; `group`; `unassigned`; `?first` for ambiguous. |
| `similarity(a, b)` | Dice coefficient on word sets, boosted when one is a prefix of the other. Returns 0..1. |
| `stageGuard(a, b)` | False if the tasks differ in a stage verb from a fixed list. |
| `mergeOccurrences(parsed, {threshold})` | Returns `{items, uncertain, warnings}`. |
| `makeId(firstOccurrence)` | First 6 hex of SHA-1 of source file + normalised raw line (status and due removed); extends to 8 on collision. |

## Merge algorithm

1. Sort parsed items by meeting date, then file name, then line number. Undated meetings go last.
2. For each parsed item, look for an existing item with the **same `ownerKey`**.
3. If found and `similarity ≥ threshold (0.85)` and `stageGuard` passes → merge. Otherwise create a new item.
4. If `0.6 ≤ similarity < 0.85` (same owner) → do **not** merge; add to `uncertain` for the report.
5. Merge effects: append occurrence; if the new due date differs, push the old one onto `dueHistory` and set the new one as current; update status:
   - any checked occurrence → `done` (`doneBy: 'notes'`);
   - a later unchecked occurrence after a checked one → stays `done`, flag `reopened-in-notes`, warning `ITEM_REOPENED`.
6. Nested candidates: map `parentLine` to the id of the item built from that line, set `parentId`.
7. Group, unassigned and ambiguous owners merge only within their own key (`group`+`group`, `?priya`+`?priya`).

**Stage verbs** for `stageGuard` (fixed list, easy to extend): estimate, start, finish, publish, collect, write, review, book, schedule, send, deploy, fix, prepare, approve, freeze, notify. Two tasks with different stage verbs from this list never merge.

## Tasks

1. `normaliseTask` with unit tests.
2. `similarity` and threshold constants in config.
3. `stageGuard`.
4. `makeId` and collision handling.
5. `mergeOccurrences` with the status and due-history rules.
6. Parent/child linking.
7. Golden-case tests (below) then a fixture snapshot of all items.

## Golden cases (must pass)

| Case | Expected |
|---|---|
| Priya: send the revised quote to Acme (09-01, 09-08, 09-15) | 1 item, `done`, 3 occurrences |
| Sam: confirm cloud budget with finance (09-01, 09-15, 09-22) | 1 item, `done` |
| Anita: share (updated) wireframes (09-01 Thu, 09-15 Thu, 09-22 Thu) | 09-15 and 09-22 merge into 1 item (due 2026-09-24, `dueHistory` holds 2026-09-17). The 09-01 "share first wireframes" line is borderline: it is either merged or listed in `uncertain`, and the test pins whichever the threshold produces |
| Rahul Mehta: set up staging (09-01, then `[x]` 09-08) | 1 item, `done` |
| Karan: export last quarter invoices (09-03, `[x]` 09-17) | 1 item, `done` |
| Karan: freeze invoice edits from 9 Oct (09-29, 10-08) | 1 item, 2 occurrences |
| Karan: approve Q4 cloud spend (09-30, `[X]` 10-02) | 1 item, `done` |
| Meera: book renewal call with CTO (09-10, 09-28, `[x]` 10-14) | 1 item, `done`, 3 occurrences |
| Priya Nair: prepare the renewal one-pager (09-28, 10-14) | 1 item, `open`, due 2026-10-02 kept (the 10-14 line has no due; a missing date never erases a known one, M7-97), empty due history |
| Rahul Verma: review schema mapping doc (09-03, 09-17) | 1 item, `open` |
| Rahul: **estimate** SSO work vs **start** SSO spike (09-14/09-24 vs 10-05) | 2 items |
| Lena: **collect** 5 customer quotes vs **publish** the customer quotes | 2 items |
| Meera: **book** renewal call vs Lena: **schedule** QBR | 2 items (different owner and stage) |
| Anita: finalise welcome-email copy (09-14, 09-24, `[x]` 10-05) | 1 item, `done` |
| Same task text, different owners | never merged |
| Items sharing `?priya` ambiguous key | merge only with each other |

## Edge cases

- Reopened item: a synthetic test where `[x]` is followed by `[ ]` keeps `done` and warns.
- Items from `untitled.md` (no date) are processed last and never merge into dated items unless the owner and text match exactly.
- Same line appearing twice in one file merges with a warning.
- Threshold change (config) changes results predictably; a test runs with 0.7 and 0.95.

## Done when

All golden cases pass, `uncertain` is listed in the report for borderline pairs, ids are identical across two runs, and shuffling file read order gives the same items.
