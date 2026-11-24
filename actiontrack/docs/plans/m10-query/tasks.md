# Tasks — M10 Query (list filters and overdue)

Plan: [plan.md](plan.md) · Tests: none yet (`tests.md` not written; tests listed in plan.md) · Mark `[x]` when done.

Depends on: M5, M8.

## Implementation (from plan.md)

- [x] 1. `effectiveStatus`, `isOverdue`, `daysOverdue`
- [x] 2. Owner matching using M5 (`findPeople`; ambiguous → `AmbiguousOwnerError`; `none`, `everyone`)
- [x] 3. Status and due filters (`open` includes overdue; `--due-before` strictly before, nulls excluded)
- [x] 4. Stable sort: overdue first, due asc (nulls last), owner name, id
- [x] 5. `parseFilters` with clear error messages (`--status`, `--due-before`, `--as-of`)
- [ ] 6. Tests with in-memory items, then against the ingested sample
- [x] No I/O and no direct clock use in `queryItems`

## Tests (from plan.md, `--as-of 2026-10-15`)

- [ ] `--status overdue`: no null-due items, no `done` items
- [ ] `--due-before 2026-10-01`: excludes null-due; item due 2026-10-01 excluded
- [ ] `--owner "Priya Shah"` → only Shah's; `--owner Priya` throws naming both
- [ ] `--owner none` returns unassigned items (CRM notes, design-system changelog)
- [ ] `untitled.md` items shown as `unassigned` / `no due date`, not dropped
- [ ] Same query twice → identical order
- [ ] (Suggested) write `tests.md` for M10 in the same style as other modules

## Done when

- [ ] Acceptance criteria 7–9 pass
- [ ] `queryItems` has no I/O and no direct clock use
