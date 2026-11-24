# Tasks — M5 People and owner resolution

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

Depends on: M2 (attendee lists).

## Implementation (from plan.md)

- [x] 1. Types and `splitName` (role suffix ignored, one-word names OK)
- [x] 2. `buildDirectory`: gather attendees from all meetings, dedupe by slug, warn on identical full names, merge config emails
- [x] 3. Config loader: `people[]`, global and per-file `aliases`; validate shape with clear errors
- [x] 4. `resolveOwner` following the decision list; keep `ownerRaw` and `reason` on the result
- [x] 5. `findPeople` + helper that throws `AmbiguousOwnerError` with candidates
- [x] 6. Data-driven unit tests
- [x] `isGroup` / `isUnassigned`
- [x] Joint owners (`&`, `and`, `,`) and helpers (`with Priya`) — helper ambiguity is a warning only

## Tests (from tests.md)

- [x] A. `splitName` and `buildDirectory` — M5-01 to M5-15
- [x] B. `isGroup` / `isUnassigned` — M5-20 to M5-25
- [x] C. `resolveOwner` core decision list — M5-30 to M5-43
- [x] D. Same-first-name cases (two Priyas, two Rahuls) — M5-50 to M5-68
- [x] E. Aliases — M5-70 to M5-77
- [x] F. Joint owners and helpers — M5-80 to M5-89
- [x] G. `findPeople` and `AmbiguousOwnerError` — M5-90 to M5-101
- [x] H. Config loader — M5-110 to M5-116
- [x] I. Whole-folder checks + snapshot — M5-120 to M5-125

## Done when

- [x] Every row in D and I passes
- [x] Ambiguous set (M5-121) is exactly: 09-17 Priya, 09-30 Priya, 09-30 Rahul, 10-07 Rahul, 09-23 Rahul
