# Plan M10 — Query (list filters and overdue)

**Goal**: pure functions that decide status, overdue and filtering for `list` (and reused by `followup`).
**Requirements**: F-LST-1..5, R7, R4 · **Milestone**: 5 · **Depends on**: M5, M8
**Files**: `src/core/query/status.ts`, `src/core/query/list.ts`

## Functions

| Function | Behaviour |
|---|---|
| `effectiveStatus(item, asOf)` | `done` if done; `overdue` if open and `due.date < asOf`; else `open`. |
| `isOverdue(item, asOf)` | False when `due.date` is null. |
| `daysOverdue(item, asOf)` | Whole days, or 0. |
| `queryItems(items, filters, dir, asOf)` | Filters are AND-ed; returns sorted items. |
| `parseFilters(args)` | Validates `--status` (`open|done|overdue`), `--due-before` (valid date), `--as-of`; bad values → usage error. |

## Filter rules

- `--owner <name>`: `findPeople`; one match → items with that person among owners (joint owners included); several → `AmbiguousOwnerError(candidates)`; `none` → unassigned items; `everyone` → group items. Item with an ambiguous owner matches a first-name query only if the name is one of its candidates, and is shown marked ambiguous.
- `--status open` = not done (overdue included, Q4); `overdue` = overdue only; `done` = done only; no flag = not done.
- `--due-before D` = `due.date < D`; items with no due date are excluded.
- `--as-of` defaults to today from the injected clock.

Sort: overdue first, then due date ascending (nulls last), then owner name, then id.

## Tasks

1. `effectiveStatus`, `isOverdue`, `daysOverdue`.
2. Owner matching using M5.
3. Status and due filters.
4. Sorting with a stable comparator.
5. `parseFilters` with clear error messages.
6. Tests with a small in-memory item set, then against the ingested sample.

## Tests (against the sample with `--as-of 2026-10-15`)

- `--status overdue` contains no item with a null due date, and no `done` items.
- `--due-before 2026-10-01` excludes null-due items; an item due 2026-10-01 is excluded (strictly before).
- `--owner "Priya Shah"` returns only Shah's items; `--owner Priya` throws with both names.
- `--owner none` returns the unassigned ones (e.g. "Someone to update the CRM notes", "TBD to write the design-system changelog").
- Items from `untitled.md` appear as `unassigned`/`no due date` states where relevant, not dropped.
- Same query run twice returns identical order.

## Done when

Acceptance criteria 7–9 pass, and `queryItems` has no I/O and no direct clock use.
