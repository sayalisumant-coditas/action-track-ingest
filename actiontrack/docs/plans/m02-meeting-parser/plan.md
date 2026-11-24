# Plan M2 — Meeting header parser

**Goal**: get title, date and attendees from either header style, and always return a Meeting, even if fields are missing.
**Requirements**: I1–I6, R2 (absolute date parsing) · **Milestone**: 2 · **Depends on**: M1
**Files**: `src/core/parse/frontmatter.ts`, `src/core/parse/meeting.ts`, `src/core/dates/parseDate.ts` (shared with M6)

## Functions

| Function | Behaviour |
|---|---|
| `splitFrontMatter(text)` | If text starts with `---\n`, find the next `---` line, parse with `yaml`, return `{data, body, bodyOffsetLines}`. Bad YAML → `data = {}`, warning, body = whole text. |
| `parseMeetingHeader(text, fileName)` | Returns `{meeting, bodyStartLine, warnings}`. |
| `parseDateText(s)` | Absolute dates only (see M6 for relative ones). |
| `dateFromFileName(name)` | Leading `YYYY-MM-DD`. |
| `inferMeetingDate(headerDate, fileName)` | `{date, inferred}`; header first, filename second, else null. |
| `parseAttendees(s)` | Split on `,` `;` ` and `, trim, drop empties and duplicates. |

## Tasks

1. `splitFrontMatter` with line-offset tracking so later line numbers refer to the original file.
2. Title: front matter `title` → first line matching `^#\s+(Meeting:\s*)?(.+)` → filename slug.
3. Date: front matter `date` (may arrive from YAML as a JS `Date`; convert to ISO string in UTC) → `Date:` line → none.
4. `parseDateText` formats: ISO; `D Month YYYY`; `Weekday, D Month YYYY`; `Month D, YYYY`. Month names in full and 3 letters, case-insensitive. Validate real calendar dates (reject 31 Feb).
5. If a weekday is written and does not match the date, keep the date and emit `DUE_WEEKDAY_MISMATCH`-style warning `DATE_WEEKDAY_MISMATCH`.
6. Attendees: front matter array or `Attendees:` line; none → `[]` and a notice (not an error).
7. `confidential` flag: front matter `confidential: true` or file name in config list (config passed in).
8. Meeting id: `slug(fileName)` without extension.
9. Unit and fixture tests.

## Sample cases (must pass)

| File | Expected date | Notes |
|---|---|---|
| 2026-09-01-quote-portal-kickoff | 2026-09-01 | standard header, 4 attendees |
| 2026-09-09-qa-standup | 2026-09-09 | `9 September 2026` |
| 2026-09-14-onboarding-flow-design | 2026-09-14 | `Monday, 14 September 2026`, weekday matches |
| 2026-09-16-standup | 2026-09-16 | YAML; attendees array of 3 |
| 2026-09-23-standup | 2026-09-23 | no attendees → `[]` |
| 2026-10-03-sales-pipeline | 2026-10-03 inferred | `sometime last week`, `dateInferred = true`, warning `DATE_INFERRED` |
| 2026-10-05-onboarding-retro | 2026-10-05 | title `Onboarding flow checkpoint` differs from filename; keep header title |
| untitled.md | null | title = `untitled`, no date, no attendees |

## Edge cases

- Front matter present but no `date` key → fall back to filename.
- Header date and filename date disagree → trust the header, add warning `DATE_MISMATCH_FILENAME`.
- Attendees with trailing role text, e.g. `Priya Nair (PM)` → strip the parentheses for matching, keep raw.
- Windows line endings already removed by M1.

## Done when

All 33 readable sample files return a Meeting; exactly 2 have an inferred or null date (10-03 inferred, untitled null).
