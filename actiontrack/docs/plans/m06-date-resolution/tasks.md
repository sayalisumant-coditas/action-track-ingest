# Tasks — M6 Date resolution

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

Build order note: M6 comes **before** M5, and M4 needs the date grammar from here.

## Implementation (from plan.md)

- [x] 1. Calendar helpers on UTC dates (add days, weekday, end of month, validate)
- [x] 2. `grammar.ts`: one list of anchored regexes shared by `isDatePhrase` and `resolveDue`
- [x] 3. One small function per rule; `resolveDue` tries them in order (ISO → day+month → tomorrow → eod/today → `next <weekday>` → `<weekday>` → end of week/month, mid-month → unresolvable)
- [x] 4. Weekday mismatch check (`Wed 16 Sep`) → warning `DUE_WEEKDAY_MISMATCH`, keep written date
- [x] 5. Year rollover (earlier than meeting by >6 months → next year)
- [x] 6. Data-driven tests + property test (weekday result strictly later, within 7 days)
- [x] 7. Export `DATE_RULES_HELP` constant
- [x] `nextWeekday`, `weekdayOfNextWeek`, `endOfNextWeek`, `endOfMonth`, `midMonth`, `weekdayNumber`, `parseAbsolute`
- [x] No-meeting-date and inferred-meeting-date handling

## Tests (from tests.md) — run under both `TZ=America/Los_Angeles` and `TZ=Asia/Kolkata`

- [x] A. The 24 required sample rows — M6-01 to M6-24
- [x] B. Missing and empty input — M6-30 to M6-37
- [x] C. Absolute formats — M6-40 to M6-52
- [x] D. Year rollover and leap years — M6-60 to M6-73
- [x] E. Weekday rules and properties — M6-80 to M6-94
- [x] E′. Q1 same-weekday (+7) isolated in `q1-same-weekday.test.ts` — M6-80
- [x] F. Relative phrases — M6-100 to M6-113
- [x] G. Prefix stripping and grammar — M6-120 to M6-127
- [x] H. Inferred and missing meeting dates — M6-130 to M6-135
- [x] I. Duplicates and repeats (purity, no clock) — M6-140 to M6-142
- [x] J. Fixture integration + snapshot — M6-150 to M6-153

## Done when

- [x] All rows in A pass exactly
- [x] Q1 test isolated (M6-80); property tests M6-92 and M6-93 pass
- [x] Suite green under both timezones
