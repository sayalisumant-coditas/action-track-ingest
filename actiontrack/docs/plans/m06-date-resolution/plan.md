# Plan M6 — Date resolution

**Goal**: turn due text into a real date, relative to the meeting date, with one documented rule set.
**Requirements**: R2, F-ING-2, F-LST-2 (`--due-before`) · **Milestone**: 3 · **Depends on**: scaffold
**Files**: `src/core/dates/resolveDue.ts`, `src/core/dates/weekday.ts`, `src/core/dates/grammar.ts`, `src/core/dates/parseDate.ts`

All dates are `YYYY-MM-DD` strings; arithmetic is done in UTC so DST and timezones cannot shift a day.

## Functions

| Function | Behaviour |
|---|---|
| `resolveDue(raw, meetingDate, inferred)` | Returns `DueRef` `{raw, date, inferred, reason?}`. |
| `isDatePhrase(s)` | True if `s` matches the grammar. Used by M4 to decide where a due clause starts. |
| `parseAbsolute(s, year)` | ISO; `D Mon[th]`; `Mon[th] D[st/nd/rd/th]`; `Weekday D Mon`. Missing year → meeting year. |
| `nextWeekday(from, wd)` | First such weekday strictly after `from` (same weekday → +7). |
| `weekdayOfNextWeek(from, wd)` | That weekday in the calendar week after `from`'s week (Mon–Sun weeks). |
| `endOfNextWeek(from)` | Friday of next week. |
| `endOfMonth(from)`, `midMonth(month, year)` | last day; the 15th. |
| `weekdayNumber(s)` | `mon…sun`, full or abbreviated, `thurs`, `tues`. |

## Rule order (most specific first)

1. ISO date.
2. Absolute date with day and month.
3. `tomorrow`, `eod tomorrow`, `by tomorrow` → +1.
4. `eod`, `today`, `end of day` → +0.
5. `next <weekday>` → that weekday in the following week.
6. `<weekday>` → next occurrence strictly after the meeting date.
7. `end of next week`, `end of (the) month`, `end of <month>`, `mid-<month>` / `mid <month>`.
8. Otherwise: `date = null`, `reason = 'unresolvable'`, raw kept, warning `DUE_UNRESOLVABLE`.

If there is no meeting date and the phrase is relative: `date = null`, `reason = 'no-meeting-date'`. If the meeting date was inferred: resolve, set `inferred = true`.

## Tasks

1. Calendar helpers on UTC dates (add days, weekday, end of month, validate).
2. Grammar: one list of anchored regexes shared by `isDatePhrase` and `resolveDue`.
3. Implement each rule as its own small function; `resolveDue` tries them in order.
4. Weekday mismatch check for `Wed 16 Sep` style (warning `DUE_WEEKDAY_MISMATCH`, keep the written date).
5. Year rollover: absolute date earlier than the meeting date by more than 6 months → next year (e.g. meeting 2026-12-20 + `5 Jan`); otherwise same year.
6. Data-driven tests from the table below plus the property test: for any meeting date and weekday word, the result is strictly later and within 7 days.
7. Print the rules in `actiontrack --help` text (exported constant `DATE_RULES_HELP`).

## Sample cases (must pass)

| Meeting date (weekday) | Due text | Result |
|---|---|---|
| 2026-09-01 (Tue) | `by Friday` | 2026-09-04 |
| 2026-09-01 (Tue) | `by Thursday` | 2026-09-03 |
| 2026-09-01 (Tue) | `2026-09-08` | 2026-09-08 |
| 2026-09-03 (Thu) | `10 Sep` | 2026-09-10 |
| 2026-09-03 (Thu) | `by Monday` | 2026-09-07 |
| 2026-09-03 (Thu) | `end of next week` | 2026-09-11 |
| 2026-09-08 (Tue) | `by Wed` | 2026-09-09 |
| 2026-09-10 (Thu) | `by tomorrow` | 2026-09-11 |
| 2026-09-14 (Mon) | `Wed 16 Sep` | 2026-09-16 |
| 2026-09-14 (Mon) | `end of month` | 2026-09-30 |
| 2026-09-18 (Fri) | `by Mon` | 2026-09-21 |
| 2026-09-21 (Mon) | `EOD tomorrow` | 2026-09-22 |
| 2026-09-30 (Wed) | `Oct 3rd` | 2026-10-03 |
| 2026-09-30 (Wed) | `15 October` | 2026-10-15 |
| 2026-09-30 (Wed) | `mid-October` | 2026-10-15 |
| 2026-09-30 (Wed) | `by Friday` | 2026-10-02 |
| 2026-09-30 (Wed) | `tomorrow` | 2026-10-01 |
| 2026-10-05 (Mon) | `by next Tuesday` | 2026-10-13 |
| 2026-10-09 (Fri) | `by Monday` | 2026-10-12 |
| 2026-10-09 (Fri) | `by Friday` (same weekday) | 2026-10-16 |
| 2026-10-03 inferred | `by Friday` | 2026-10-09, `inferred = true` |
| none | `by Friday` | null, `no-meeting-date` |
| any | `before the next review` | null, `unresolvable` |
| any | `by the end of the cutover` | null, `unresolvable` |

## Done when

All rows pass, and the open assumption Q1 (same weekday means +7) is covered by its own test so it is easy to change if the answer differs.
