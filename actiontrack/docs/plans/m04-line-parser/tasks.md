# Tasks — M4 Line parser

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

Depends on: M3 and the date grammar (`isDatePhrase`) from M6.

## Implementation (from plan.md)

- [x] 1. Owner pattern: 1–2 capitalised words + optional initial, or keywords, joined by `&` / `and`, optional `(with X)`
- [x] 2. Pattern order: `owner: task` → `owner to task` → `owner will|should task` → no owner
- [x] 3. `@name` capitalised for display; raw kept in `ownerRaw`
- [x] 4. Due extraction from the **end** of the task using `isDatePhrase` (word boundaries; `standby`/`bypass` safe)
- [x] 5. Forms: `, results due 15 October`, `— by Friday`, `by 2026-10-09 — …`
- [x] 6. Trim trailing punctuation, collapse whitespace, keep original wording
- [x] 7. Table candidates use cells directly (due cell passed as-is)
- [x] 8. Unit tests, then fixture test that parses every sample candidate + snapshot
- [x] `splitOwnerTask`, `splitTaskDue`, `parseCandidate`
- [x] Edge cases: apostrophe (`Anita's PR`), `Saturday 10 Oct` with `for`, `one-pager`, `by` mid-word

## Tests (from tests.md)

- [x] A. The 14 required sample rows — M4-01 to M4-14
- [x] B. `splitOwnerTask` owner forms — M4-20 to M4-39
- [x] C. `splitTaskDue` due extraction — M4-50 to M4-77
- [x] D. Table candidates — M4-80 to M4-85
- [x] E. Whole-pipeline checks + snapshot (property M4-95) — M4-90 to M4-96

## Done when

- [x] All 14 sample rows (A) are exact
- [x] M4-90: every candidate in the 33 fixture files parses to a non-empty task
- [x] Edge cases green: apostrophe, `Saturday 10 Oct`, `one-pager`, `standby`
