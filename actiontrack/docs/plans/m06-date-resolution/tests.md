# Tests — M6 Date resolution

Plan: [plan.md](plan.md) · Files under test: `resolveDue.ts`, `weekday.ts`, `grammar.ts`, `parseDate.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

This module carries the **missing date** edge case. All tests are data-driven (`it.each`). Run the whole suite under two timezones (`TZ=America/Los_Angeles`, `TZ=Asia/Kolkata`) to prove no day shifts.

## A. The 24 required sample rows

| ID | Meeting date (weekday) | Due text | Expected |
|---|---|---|---|
| M6-01 | 2026-09-01 (Tue) | `by Friday` | 2026-09-04 |
| M6-02 | 2026-09-01 (Tue) | `by Thursday` | 2026-09-03 |
| M6-03 | 2026-09-01 (Tue) | `2026-09-08` | 2026-09-08 |
| M6-04 | 2026-09-03 (Thu) | `10 Sep` | 2026-09-10 |
| M6-05 | 2026-09-03 (Thu) | `by Monday` | 2026-09-07 |
| M6-06 | 2026-09-03 (Thu) | `end of next week` | 2026-09-11 |
| M6-07 | 2026-09-08 (Tue) | `by Wed` | 2026-09-09 |
| M6-08 | 2026-09-10 (Thu) | `by tomorrow` | 2026-09-11 |
| M6-09 | 2026-09-14 (Mon) | `Wed 16 Sep` | 2026-09-16 |
| M6-10 | 2026-09-14 (Mon) | `end of month` | 2026-09-30 |
| M6-11 | 2026-09-18 (Fri) | `by Mon` | 2026-09-21 |
| M6-12 | 2026-09-21 (Mon) | `EOD tomorrow` | 2026-09-22 |
| M6-13 | 2026-09-30 (Wed) | `Oct 3rd` | 2026-10-03 |
| M6-14 | 2026-09-30 (Wed) | `15 October` | 2026-10-15 |
| M6-15 | 2026-09-30 (Wed) | `mid-October` | 2026-10-15 |
| M6-16 | 2026-09-30 (Wed) | `by Friday` | 2026-10-02 |
| M6-17 | 2026-09-30 (Wed) | `tomorrow` | 2026-10-01 |
| M6-18 | 2026-10-05 (Mon) | `by next Tuesday` | 2026-10-13 |
| M6-19 | 2026-10-09 (Fri) | `by Monday` | 2026-10-12 |
| M6-20 | 2026-10-09 (Fri) | `by Friday` (same weekday) | 2026-10-16 |
| M6-21 | 2026-10-03 inferred | `by Friday` | 2026-10-09, `inferred = true`, reason none `[GAP]` |
| M6-22 | none (`null`) | `by Friday` | `date = null`, reason `no-meeting-date` `[GAP]` |
| M6-23 | any | `before the next review` | `date = null`, `unresolvable` `[GAP]` |
| M6-24 | any | `by the end of the cutover` | `date = null`, `unresolvable` `[GAP]` |

Every row also asserts `raw` is kept exactly as written.

## B. Missing and empty input

| ID | Input | Expected |
|---|---|---|
| M6-30 | `raw = null` | `{raw:null, date:null, inferred:false}`, no reason, no warning `[GAP]` |
| M6-31 | `raw = ''` or whitespace | same as null `[GAP]` |
| M6-32 | `raw = 'TBD'`, `'n/a'`, `'-'` | `date = null`, `unresolvable` or null (pin one); never throws `[GAP]` |
| M6-33 | ISO date with `meetingDate = null` | resolves (absolute dates need no meeting date) `[GAP]` |
| M6-34 | `10 Sep` with `meetingDate = null` | `date = null`, `no-meeting-date` (year unknown) `[GAP]` |
| M6-35 | `tomorrow`, `EOD`, `today` with `meetingDate = null` | `no-meeting-date` `[GAP]` |
| M6-36 | `by the end of the cutover` with `meetingDate = null` | `unresolvable` (not relative, just unreadable) `[GAP]` |
| M6-37 | Meeting date is not a valid ISO string | treated as `null` meeting date, no throw `[BAD]` |

## C. Absolute formats (`parseAbsolute`)

| ID | Input (meeting 2026-09-30) | Expected |
|---|---|---|
| M6-40 | `2026-10-09` | 2026-10-09 |
| M6-41 | `10 Sep` / `10 September` / `10 sep` | 2026-09-10 (same year; 10 Sep is before 30 Sep but within 6 months) |
| M6-42 | `Oct 3` / `Oct 3rd` / `October 3rd` | 2026-10-03 |
| M6-43 | `1st Oct`, `2nd Oct`, `23rd Oct`, `4th Oct` | correct ordinal handling |
| M6-44 | `15 Oct 2026` | 2026-10-15 |
| M6-45 | `31 Sep` (September has 30 days) | `null` / unresolvable |
| M6-46 | `30 Feb` | `null` / unresolvable |
| M6-47 | `29 Feb` in 2028 meeting | 2028-02-29 |
| M6-48 | `29 Feb` in 2026 meeting | `null` / unresolvable |
| M6-49 | `Wed 16 Sep` with meeting 2026-09-14 | 2026-09-16, no warning |
| M6-50 | `Thu 16 Sep` (16 Sep is a Wednesday) | 2026-09-16 kept, reason `weekday-mismatch`, warning `DUE_WEEKDAY_MISMATCH` |
| M6-51 | `Saturday 10 Oct` | 2026-10-10 (10 Oct is a Saturday) |
| M6-52 | `2026-10-09` wrongly written `2026-10-9` | `null` / unresolvable (strict ISO) |

## D. Year rollover

| ID | Meeting | Due | Expected |
|---|---|---|---|
| M6-60 | 2026-12-20 | `5 Jan` | 2027-01-05 |
| M6-61 | 2026-12-30 | `by Friday` | 2027-01-01 |
| M6-62 | 2026-12-30 | `end of month` | 2026-12-31 |
| M6-63 | 2026-12-30 | `tomorrow` | 2026-12-31 |
| M6-64 | 2026-12-31 | `tomorrow` | 2027-01-01 |
| M6-65 | 2026-12-30 | `end of next week` | 2027-01-08 (Friday of next week) |
| M6-66 | 2026-09-30 | `10 Sep` | 2026-09-10 (3 weeks earlier: stays same year) |
| M6-67 | 2026-09-30 | `1 Jan` (more than 6 months earlier) | 2027-01-01 |
| M6-68 | 2026-01-05 | `20 Dec` | 2026-12-20 (later in same year, no rollover) |
| M6-69 | 2024-02-28 | `tomorrow` | 2024-02-29 (leap) |
| M6-70 | 2024-02-29 | `tomorrow` | 2024-03-01 |
| M6-71 | 2026-02-28 | `tomorrow` | 2026-03-01 |
| M6-72 | 2028-02-10 | `end of month` | 2028-02-29 |
| M6-73 | 2026-02-10 | `end of month` | 2026-02-28 |

## E. Weekday rules (Q1 has its own tests)

| ID | Meeting | Due | Expected |
|---|---|---|---|
| M6-80 | **Q1:** 2026-10-09 (Fri) | `Friday` | 2026-10-16 (+7). This row is isolated in `q1-same-weekday.test.ts` so it can be flipped if the answer changes |
| M6-81 | each weekday of one week, due = same weekday | all give +7 |
| M6-82 | Wed, `Thursday` | the next day |
| M6-83 | Fri, `Thursday` | the following Thursday (+6) |
| M6-84 | `Thurs`, `Thur`, `Thu` | same weekday |
| M6-85 | `Tues`, `Tue` | Tuesday |
| M6-86 | `Wed.` / `wednesday` / `WEDNESDAY` | Wednesday |
| M6-87 | `next Tuesday` from Mon 2026-10-05 | 2026-10-13 (week after) |
| M6-88 | `next Tuesday` from Sat 2026-10-03 | week after the meeting's Mon–Sun week → 2026-10-13 |
| M6-89 | `next Monday` from Sun 2026-10-04 | 2026-10-05 or 2026-10-12; pin per Mon–Sun week rule (Sunday belongs to the week ending today → 2026-10-05) |
| M6-90 | `next Friday` from Mon | Friday of the following week |
| M6-91 | `by Sunday` from Sat | next day |
| M6-92 | Property (1,000 random meeting dates × 7 weekdays) | `nextWeekday` result is strictly later and within 7 days |
| M6-93 | Property | `weekdayOfNextWeek` is always 1–13 days later and always in the next Mon–Sun week |
| M6-94 | `weekdayNumber('mon')…('sunday')`, `'thurs'`, `'tues'`, `'xyz'` | 0..6 or `null` |

## F. Relative phrases

| ID | Meeting | Due | Expected |
|---|---|---|---|
| M6-100 | 2026-09-10 | `tomorrow` / `by tomorrow` / `EOD tomorrow` | 2026-09-11 |
| M6-101 | 2026-09-10 | `EOD` / `today` / `end of day` / `by EOD` | 2026-09-10 |
| M6-102 | Thu 2026-09-03 | `end of next week` | 2026-09-11 |
| M6-103 | Sat 2026-09-05 | `end of next week` | 2026-09-11 |
| M6-104 | Mon 2026-09-07 | `end of next week` | 2026-09-18 |
| M6-105 | 2026-09-14 | `end of the month` / `end of month` / `end of September` | 2026-09-30 |
| M6-106 | 2026-09-14 | `end of October` | 2026-10-31 |
| M6-107 | 2026-09-30 | `mid-October` / `mid October` / `Mid-October` | 2026-10-15 |
| M6-108 | 2026-10-20 | `mid-October` (already past mid) | 2026-10-15 (same year, past date kept; flagged overdue later) |
| M6-109 | any | `by 3pm`, `next quarter`, `ASAP`, `soon`, `when ready` | `null`, `unresolvable` `[GAP]` |
| M6-110 | any | `by the end of Q4` | `null`, `unresolvable` |
| M6-111 | any | `after the cutover` | `null`, `unresolvable` |
| M6-112 | any | `by next week` | `null`, `unresolvable` (not in the grammar; pinned) |
| M6-113 | 2026-09-14 | `by Friday  ` (padding), `BY FRIDAY`, `by friday.` | 2026-09-18 |

## G. Prefix stripping and grammar

| ID | Case | Expected |
|---|---|---|
| M6-120 | `by `, `on `, `due `, `before `, `until ` stripped | `by Friday` = `on Friday` = `due Friday` |
| M6-121 | `isDatePhrase('Friday')`, `('10 Sep')`, `('EOD')`, `('end of next week')`, `('mid-October')` | true |
| M6-122 | `isDatePhrase('the cutover')`, `('quote')`, `('10%')`, `('')` | false |
| M6-123 | `isDatePhrase('by the end of the cutover')` | false (unresolvable phrases are decided by M4's rule, not by the grammar) |
| M6-124 | `isDatePhrase('Wed 16 Sep')`, `('Saturday 10 Oct')` | true |
| M6-125 | `isDatePhrase('Mon')`, `('mon')`, but `('Monitor')`, `('Marching')` | true / false (word boundaries) |
| M6-126 | Grammar and resolver agree | every string where `isDatePhrase` is true resolves (or is explicitly flagged); property test over a list of 100 phrases |
| M6-127 | `DATE_RULES_HELP` | exported, non-empty, mentions same-weekday = +7 and `next <weekday>` |

## H. Inferred and missing meeting dates

| ID | Case | Expected |
|---|---|---|
| M6-130 | Meeting 2026-10-03 inferred, due `by Friday` | 2026-10-09, `inferred = true` |
| M6-131 | Inferred meeting, due `2026-10-09` (absolute) | resolves; `inferred` stays false (absolute dates do not depend on the meeting date) |
| M6-132 | Inferred meeting, `by the end of the cutover` | `unresolvable`, inferred false |
| M6-133 | `untitled.md` (no date), `by Friday` | `no-meeting-date`, raw kept `[GAP]` |
| M6-134 | `untitled.md`, `ISO date` | resolves `[GAP]` |
| M6-135 | The unresolved items from `untitled.md` | each carries raw text and reason so the report can flag them `[GAP]` |

## I. Duplicates and repeats `[DUP]`

| ID | Case | Expected |
|---|---|---|
| M6-140 | `by Thursday` said in meetings on 09-01, 09-15, 09-22 (all Tue) | 2026-09-03, 2026-09-17, 2026-09-24: each resolved against its **own** meeting date, never the ingest date |
| M6-141 | Same due text and meeting date, called twice | identical result (pure function) |
| M6-142 | Clock changes (inject different "today") | result unchanged: `resolveDue` has no clock `[DUP]` |

## J. Fixture integration

| ID | Case | Expected |
|---|---|---|
| M6-150 | Resolve every `dueRaw` from the 33 fixtures | no exception |
| M6-151 | Unresolvable phrases across the folder | all appear as `DUE_UNRESOLVABLE` warnings with file and raw text `[GAP]` |
| M6-152 | `Wed 16 Sep` (09-14 onboarding) | resolves with no weekday-mismatch warning |
| M6-153 | Snapshot of `{raw, date, reason}` for every due in the folder | matches reviewed snapshot |

## Done when

All rows in A pass exactly, the Q1 test is isolated (M6-80), property tests M6-92 and M6-93 pass, and the suite is green under both timezones.
