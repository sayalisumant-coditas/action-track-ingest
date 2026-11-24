# Tests — M2 Meeting header parser

Plan: [plan.md](plan.md) · Files under test: `frontmatter.ts`, `meeting.ts`, `parseDate.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

## A. `splitFrontMatter`

| ID | Input | Expected |
|---|---|---|
| M2-01 | `---\ntitle: X\ndate: 2026-09-16\nattendees: [A, B]\n---\nbody` | `data` has the 3 keys; `body = 'body'` |
| M2-02 | Text with no front matter | `data = {}`, body = whole text, offset 0 |
| M2-03 | `---` opened but never closed | treated as no front matter, whole text is body, warning `[BAD]` |
| M2-04 | Invalid YAML between the fences (`title: [unclosed`) | `data = {}`, warning, body = whole text, no throw `[BAD]` |
| M2-05 | Front matter is empty (`---\n---\n`) | `data = {}`, body after the fences |
| M2-06 | `bodyOffsetLines` | for a 5-line front matter block, the first body line reports original line 6 |
| M2-07 | `date: 2026-09-16` (YAML parses it as a JS `Date`) | converted to the string `2026-09-16` in UTC, no off-by-one in any timezone (run with `TZ=America/Los_Angeles` and `TZ=Asia/Kolkata`) |
| M2-08 | A `---` horizontal rule in the middle of the body | not mistaken for front matter |
| M2-09 | `confidential: true` | exposed in `data` |
| M2-10 | Front matter present but no `date` key | `data.date` undefined, handled by `inferMeetingDate` `[GAP]` |

## B. `parseDateText`

| ID | Input | Expected |
|---|---|---|
| M2-20 | `2026-09-01` | `2026-09-01` |
| M2-21 | `9 September 2026` | `2026-09-09` |
| M2-22 | `Monday, 14 September 2026` | `2026-09-14` |
| M2-23 | `Sep 9, 2026` / `September 9, 2026` | `2026-09-09` |
| M2-24 | `9 sep 2026` / `9 SEPT 2026` | `2026-09-09` (case-insensitive, abbreviations) |
| M2-25 | `31 February 2026`, `2026-02-30` | `null` (not a real date) |
| M2-26 | `29 February 2028` | `2028-02-29` (leap year) |
| M2-27 | `Tuesday, 14 September 2026` (14 Sep is a Monday) | returns `2026-09-14` and reports a weekday mismatch |
| M2-28 | `sometime last week` | `null` `[GAP]` |
| M2-29 | `''`, `TBD`, `n/a` | `null` `[GAP]` |
| M2-30 | `  2026-09-01  ` (padding) | `2026-09-01` |
| M2-31 | `2026-09-01T10:00:00Z` | `2026-09-01` or `null`; the test pins one choice and documents it |
| M2-32 | `1 Sept` (no year) | `null` (this function is absolute with year only) |

## C. `dateFromFileName` and `inferMeetingDate`

| ID | Input | Expected |
|---|---|---|
| M2-40 | `2026-09-01-quote-portal-kickoff.md` | `2026-09-01` |
| M2-41 | `untitled.md`, `scratch.md` | `null` `[GAP]` |
| M2-42 | `2026-13-40-notes.md` | `null` (invalid) |
| M2-43 | `notes-2026-09-01.md` (date not leading) | `null` |
| M2-44 | `inferMeetingDate('2026-09-09', '2026-09-09-x.md')` | `{date:'2026-09-09', inferred:false}` |
| M2-45 | `inferMeetingDate(null, '2026-10-03-sales-pipeline.md')` | `{date:'2026-10-03', inferred:true}` + `DATE_INFERRED` |
| M2-46 | `inferMeetingDate('sometime last week', '2026-10-03-…')` | filename date, `inferred:true` |
| M2-47 | `inferMeetingDate(null, 'untitled.md')` | `{date:null, inferred:false}` `[GAP]` |
| M2-48 | Header `2026-09-10`, filename `2026-09-09-…` | header wins, warning `DATE_MISMATCH_FILENAME` |

## D. `parseAttendees`

| ID | Input | Expected |
|---|---|---|
| M2-60 | `Priya Nair, Sam Okafor, Anita Desai` | 3 names |
| M2-61 | `A; B; C` and `A, B and C` | 3 names each |
| M2-62 | `A,, B, ` (empties) | `[A, B]` |
| M2-63 | `A, B, A` | `[A, B]` (deduped) |
| M2-64 | `Priya Nair (PM), Sam Okafor` | match name `Priya Nair`; raw text kept |
| M2-65 | `''` / missing line | `[]` and a notice, not an error `[GAP]` |
| M2-66 | Two people with the same first name in one list: `Priya Nair, Priya Shah` | both kept as separate entries `[NAME]` |
| M2-67 | Double spaces: `Priya  Nair` | normalised to `Priya Nair` |
| M2-68 | Names with `Jr.` or hyphens (`Anne-Marie O'Neil`) | kept whole |

## E. `parseMeetingHeader`

| ID | Input | Expected |
|---|---|---|
| M2-80 | `# Meeting: Quote portal kickoff` | title `Quote portal kickoff` |
| M2-81 | `# Quote portal kickoff` (no `Meeting:`) | title `Quote portal kickoff` |
| M2-82 | Front matter `title` and a `# Heading` | front matter title wins |
| M2-83 | No title anywhere | title = filename slug |
| M2-84 | `Date:` line in the body | used when there is no front matter date |
| M2-85 | Both `Date:` and front matter `date` | front matter wins |
| M2-86 | Header text after the first `## ` section (e.g. a line `Date:` deep in the body) | not treated as the header date |
| M2-87 | `bodyStartLine` | points at the first line after the header, true to the original file with front matter |
| M2-88 | Meeting id | `slug(fileName)` without extension, e.g. `2026-09-01-quote-portal-kickoff` |
| M2-89 | Two files with the same slug in different folders (recursive scan) | ids differ (include the relative path) `[DUP]` |
| M2-90 | `confidential` via front matter | `meeting.confidential = true` |
| M2-91 | `confidential` via config glob `*security-review*` | true for `2026-10-09-security-review.md` only |
| M2-92 | Empty or whitespace text passed in | returns a Meeting with null date, `[]` attendees, no throw `[BAD]` |
| M2-93 | A text file of random prose with no header | Meeting with filename title, no date from text `[BAD]` `[GAP]` |

## F. Sample files (fixture tests)

| ID | File | Expected |
|---|---|---|
| M2-100 | 2026-09-01-quote-portal-kickoff | date `2026-09-01`; 4 attendees |
| M2-101 | 2026-09-09-qa-standup | date `2026-09-09` |
| M2-102 | 2026-09-14-onboarding-flow-design | date `2026-09-14`; no weekday warning |
| M2-103 | 2026-09-16-standup | YAML; 3 attendees |
| M2-104 | 2026-09-30-standup | YAML; parsed like 09-16 |
| M2-105 | 2026-09-23-standup | attendees `[]`; no error `[GAP]` |
| M2-106 | 2026-10-03-sales-pipeline | `2026-10-03`, `dateInferred = true`, `DATE_INFERRED` `[GAP]` |
| M2-107 | 2026-10-05-onboarding-retro | title `Onboarding flow checkpoint` (not the filename) |
| M2-108 | untitled.md | title `untitled`, date `null`, attendees `[]` `[GAP]` |
| M2-109 | 2026-09-17-billing-migration-sync | attendee list holds both `Priya Nair` and `Priya Shah` `[NAME]` |
| M2-110 | 2026-10-07-standup | attendee list holds both Rahuls `[NAME]` |
| M2-111 | 2026-09-30-q4-offsite | all 9 attendees `[NAME]` |
| M2-112 | 2026-10-09-security-review | confidential per config |
| M2-113 | All 33 readable files | each returns a Meeting; **exactly 2** have inferred or null date (10-03, untitled) |
| M2-114 | Empty and binary files | never reach this module (M1 rejects them); passing them in directly still returns a Meeting `[BAD]` |
| M2-115 | Snapshot of all 33 meetings | matches the reviewed snapshot |

## Done when

All rows pass; M2-113 holds; no date test depends on the machine's timezone (M2-07).
