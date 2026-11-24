# Tasks — M8 Store and overrides

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

Depends on: M7.

## Implementation (from plan.md)

- [x] 1. Types and `emptyStore()`
- [x] 2. `loadStore` / `saveStore` with atomic write (temp + rename; Windows fallback copy+unlink)
- [x] 3. `applyIngest` incl. `missing-from-notes` logic
- [x] 4. `applyOverrides` and `markDone` (unique id-prefix match)
- [x] 5. `recordDraft` / `getDraft`
- [x] 6. Version field and `migrate(store)` hook (v1 only)
- [ ] 7. Tests
- [x] `paths.ts`: default `./.actiontrack/store.json`, `ACTIONTRACK_STORE`, `--store` (flag wins)

## Tests (from tests.md) — injected clock `2026-11-24T10:00:00.000Z`

- [ ] A. `emptyStore`, `loadStore` — M8-01 to M8-13
- [ ] B. `saveStore` (atomic, crash simulation) — M8-20 to M8-33
- [ ] C. `paths` — M8-40 to M8-44
- [ ] D. `applyIngest` — M8-50 to M8-67
- [ ] E. `applyOverrides` and `markDone` — M8-70 to M8-86
- [ ] F. Drafts — M8-90 to M8-94
- [ ] G. Integration on sample folder — M8-100 to M8-105

## Done when

- [ ] Acceptance 10 and 14 pass at store level
- [ ] Crash simulation (M8-26) leaves old store intact
- [ ] Grep test M8-33 passes (no non-atomic store write)
