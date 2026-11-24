# Tasks — M7 De-duplication and status carry-over

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

Depends on: M4, M5, M6.

## Implementation (from plan.md)

- [x] 1. `normaliseTask` (lowercase, strip punctuation/articles/filler, light stemming) with unit tests
- [x] 2. `similarity` (Dice on word sets, prefix boost) and threshold constants in config
- [x] 3. `stageGuard` (fixed stage-verb list)
- [x] 4. `makeId` (6 hex of SHA-1, extends to 8 on collision)
- [x] 5. `mergeOccurrences`: sort, same-`ownerKey` match, merge ≥ 0.85, `uncertain` for 0.6–0.85, status and due-history rules
- [x] 6. Parent/child linking (`parentLine` → `parentId`)
- [x] 7. Golden-case tests, then fixture snapshot of all items
- [x] `ownerKey` (sorted person ids / `group` / `unassigned` / `?first`)
- [x] Edge cases: reopened item (`ITEM_REOPENED`), `untitled.md` processed last, same line twice in one file, threshold 0.7 / 0.95

## Tests (from tests.md)

- [x] A. `normaliseTask` — M7-01 to M7-11
- [x] B. `ownerKey` — M7-20 to M7-26
- [x] C. `similarity` — M7-30 to M7-39
- [x] D. `stageGuard` — M7-40 to M7-48
- [ ] E. Golden merge cases from the sample — M7-50 to M7-63 (M7-59 conflicts with M7-97, see report)
- [x] F. Items that must stay separate — M7-70 to M7-83
- [x] G. Status and due-date rules — M7-90 to M7-101
- [x] H. Ordering, undated meetings, parents — M7-110 to M7-118
- [x] I. `makeId` — M7-120 to M7-129
- [x] J. Configuration (threshold) — M7-130 to M7-133
- [x] K. Fixture integration + snapshot — M7-140 to M7-149

## Done when

- [ ] All golden cases (E, F) pass (M7-59 `dueHistory` conflicts with M7-97)
- [x] Ids identical across runs (M7-140); shuffled order gives same result (M7-141)
- [x] Borderline pair appears in `uncertain` (M7-82)
