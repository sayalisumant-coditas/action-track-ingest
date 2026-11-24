# Tasks — M2 Meeting header parser

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

## Implementation (from plan.md)

- [x] 1. `splitFrontMatter` with line-offset tracking (bad YAML → `data = {}` + warning)
- [x] 2. Title: front matter `title` → first `# (Meeting:)? …` line → filename slug
- [x] 3. Date: front matter `date` (YAML `Date` → UTC ISO string) → `Date:` line → none
- [x] 4. `parseDateText` formats: ISO, `D Month YYYY`, `Weekday, D Month YYYY`, `Month D, YYYY`; validate real calendar dates
- [x] 5. Weekday mismatch → keep date, warning `DATE_WEEKDAY_MISMATCH`
- [x] 6. Attendees: front matter array or `Attendees:` line; none → `[]` + notice
- [x] 7. `confidential` flag: front matter or config file-name list
- [x] 8. Meeting id = slug of file name (include relative path to avoid collisions)
- [x] 9. Unit and fixture tests
- [x] `dateFromFileName`, `inferMeetingDate` (`DATE_INFERRED`, `DATE_MISMATCH_FILENAME`), `parseAttendees`
- [x] Edge cases: no `date` key, header/filename disagree, `Priya Nair (PM)` role suffix

## Tests (from tests.md)

- [x] A. `splitFrontMatter` — M2-01 to M2-10
- [x] B. `parseDateText` — M2-20 to M2-32
- [x] C. `dateFromFileName` / `inferMeetingDate` — M2-40 to M2-48
- [x] D. `parseAttendees` — M2-60 to M2-68
- [x] E. `parseMeetingHeader` — M2-80 to M2-93
- [x] F. Sample-file fixture tests + snapshot — M2-100 to M2-115
- [x] Run date tests under `TZ=America/Los_Angeles` and `TZ=Asia/Kolkata` (M2-07)

## Done when

- [x] All rows pass
- [x] M2-113 holds: all 33 readable files return a Meeting; exactly 2 have inferred/null date
- [x] No date test depends on machine timezone
