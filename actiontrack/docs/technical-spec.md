# actiontrack — Technical / Development Spec

Status: Draft v1 · Date: 2026-11-24
Implements: [requirements.md](requirements.md). IDs such as `F-ING-3`, `R5`, `I13` refer to that file.

## 1. Approach in one paragraph

All logic lives in one framework-free TypeScript **core** library made of small pure functions. The **CLI** is a thin shell over it. Ingest is a pipeline: scan folder → read and validate → parse meeting → extract candidate lines → parse each line → resolve owner → resolve due date → merge duplicates → apply user overrides → save. Every stage has typed input and output, so each can be unit-tested alone against the sample notes.

## 2. Stack and decisions

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict), Node 20+ | Requirement; CLI and core share one language |
| CLI framework | `commander` | Small, standard, good `--help` |
| Front matter | `yaml` package, own delimiter split | Only 2 files use it; avoids heavy deps |
| Date resolution | **Own resolver**, no NLP library | Rules in R2 are finite and must be deterministic and documented; libraries guess |
| Date maths | `date-fns` (UTC-only helpers) | Avoids timezone drift; all dates are `YYYY-MM-DD` strings |
| Fuzzy match | own token-set Dice coefficient | Small, deterministic, tunable threshold |
| Storage | one JSON file (`.actiontrack/store.json`), atomic write (temp file + rename) | Tiny data; trivially diffable and testable; SQLite is overkill |
| Gmail | `GmailDrafter` interface; `McpGmailDrafter` (real) and `FileGmailDrafter` (mock) | Connector is not authorised yet; isolates the only outbound call (NFR-5) |
| Tests | `vitest`; snapshot tests on the sample folder | NFR-7 |
| Lint/format | eslint + prettier | Consistency |

## 3. Repository layout

```
actiontrack/
  docs/                       requirements.md, technical-spec.md, ...
  src/
    core/                     pure logic, no I/O except store + files modules
      types.ts
      scan/        scanFolder.ts  readNote.ts
      parse/       meeting.ts  frontmatter.ts  candidates.ts  line.ts
      people/      directory.ts  resolveOwner.ts
      dates/       parseDate.ts  resolveDue.ts  weekday.ts
      dedupe/      normalise.ts  similarity.ts  merge.ts
      store/       store.ts  overrides.ts  ids.ts
      query/       list.ts  overdue.ts
      followup/    build.ts  render.ts  gmail.ts  mcpGmail.ts  fileGmail.ts
      ingest.ts                orchestrates the pipeline
    cli/                      index.ts  commands/{ingest,list,done,followup}.ts  format.ts
  test/
    fixtures/notes/           copy of the sample folder (+ small synthetic cases)
    unit/  integration/  snapshots/
  config/people.example.json
```

## 4. Shared types (`core/types.ts`)

```ts
type ISODate = string;                       // "2026-09-08"
type OwnerKind = 'person' | 'group' | 'unassigned' | 'ambiguous';

interface Person { id: string; fullName: string; first: string; last: string; email?: string }

interface Meeting {
  id: string; sourceFile: string; title: string;
  date: ISODate | null; dateInferred: boolean;
  attendees: string[];                       // full names, as written
  confidential: boolean;
}

interface OwnerRef {
  kind: OwnerKind;
  raw: string;                               // text as written
  people: string[];                          // Person ids (empty unless kind=person)
  helpers: string[];                         // "(with Priya)"
  candidates: string[];                      // possible Person ids when ambiguous
}

interface DueRef {
  raw: string | null;
  date: ISODate | null;
  inferred: boolean;                         // relative to an inferred meeting date
  reason?: 'unresolvable' | 'no-meeting-date' | 'weekday-mismatch';
}

interface Occurrence {
  meetingId: string; sourceFile: string; line: number;
  checked: boolean; due: DueRef; rawLine: string;
}

interface ActionItem {
  id: string; task: string; owner: OwnerRef; due: DueRef;
  status: 'open' | 'done'; doneAt?: string; doneBy?: 'notes' | 'cli';
  occurrences: Occurrence[]; dueHistory: ISODate[];
  parentId?: string; flags: string[];        // e.g. 'reopened-in-notes'
}

interface IngestReport {
  filesRead: number; meetings: number; items: number;
  skipped: { file: string; reason: 'empty' | 'binary' | 'unreadable' | 'no-actions' }[];
  warnings: { file: string; line?: number; code: string; message: string }[];
  uncertainMerges: { a: string; b: string; score: number }[];
  ignoredCandidates: { file: string; line: number; why: 'blockquote' | 'code' | 'comment' }[];
}
```

---

## 5. Modules

Each module lists: **Purpose → Requirements → Functions → How it works → Tests**.

### M1. Scan and read (`core/scan`)

**Purpose**: find `.md` files and decide whether each is readable text.
**Requirements**: F-ING-1, F-ING-3, I7, I8, I9, NFR-1.

| Function | Signature | How |
|---|---|---|
| `scanFolder` | `(dir, {recursive}) => string[]` | `fs.readdir`; keep names ending `.md` (case-insensitive); sort alphabetically so order is deterministic. Missing/unreadable dir throws `FolderError` (the only fatal error). |
| `readNote` | `(path) => {ok:true,text} \| {ok:false,reason}` | Read bytes. Empty or whitespace-only → `empty`. Contains a NUL byte, or >1% of the first 4 KB are U+FFFD or control chars → `binary`. Otherwise decode UTF-8, strip BOM, normalise `\r\n` → `\n`. Wrapped in try/catch → `unreadable`. |

Tests: empty file, PNG-as-`.md`, BOM file, CRLF file, `.txt` ignored.

### M2. Meeting parser (`core/parse/meeting.ts`, `frontmatter.ts`)

**Purpose**: extract title, date, attendees from either header style.
**Requirements**: I1–I6, R2 (date parsing part).

| Function | Signature | How |
|---|---|---|
| `splitFrontMatter` | `(text) => {data, body, bodyOffsetLines}` | If the file starts with `---\n`, find the closing `---`, parse with `yaml`; on YAML error treat as no front matter and warn. `bodyOffsetLines` keeps line numbers true to the original file. |
| `parseMeetingHeader` | `(text, fileName) => Meeting` | Title: front matter `title`, else first `# Meeting: X` / `# X`, else filename slug. Date: front matter `date`, else `Date:` line. Attendees: front matter list, else `Attendees:` line split on `,`/`;`/` and `. |
| `parseDateText` | `(s) => ISODate \| null` | Tries in order: ISO `\d{4}-\d{2}-\d{2}`; `[Weekday,] D Month YYYY`; `Month D, YYYY`. Month names and 3-letter abbreviations. Validates the real calendar date. Weekday present but wrong → still returns the date, caller warns. |
| `dateFromFileName` | `(name) => ISODate \| null` | Leading `YYYY-MM-DD-`. |
| `inferMeetingDate` | `(headerDate, fileName) => {date, inferred}` | Header date if valid; else filename date with `inferred = true` + warning `DATE_INFERRED`; else `null` (untitled.md). |

Tests: ISO, `9 September 2026`, `Monday, 14 September 2026`, `sometime last week`, missing `Date:`, no attendees (09-23), no header at all, front matter files.

### M3. Candidate extractor (`core/parse/candidates.ts`)

**Purpose**: find every *line that could be* an action item, and reject the fake ones.
**Requirements**: I10–I16, R8.

The key function is a **line-by-line state machine**, not a regex over the whole file. It carries state: `inFence` (toggled by ``` or ~~~), `inHtmlComment` (opened by `<!--`, closed by `-->`, may span lines).

| Function | Signature | How |
|---|---|---|
| `extractCandidates` | `(body, lineOffset) => {candidates: Candidate[], ignored: IgnoredCandidate[]}` | Iterate lines with the state above. For each line decide: **ignore** (inside fence / comment / starts with `>` → record in `ignored` with the reason) or **candidate** if it matches one of the forms below. |
| `matchCheckbox` | `(line) => {checked, text, indent} \| null` | `^(\s*)[-*+]\s+\[( \|x\|X)\]\s+(.*)$` |
| `matchActionLine` | `(line) => {text} \| null` | `^\s*ACTION:\s*(.*)$` (case-insensitive) → unchecked item |
| `matchTableRow` | `(line, header) => {owner, text, due} \| null` | Detect a header row containing `Owner` and `Action` (and optionally `Due`), skip the `---` separator row, then map each following `\|` row until the table ends. |
| `linkParents` | `(candidates) => void` | A checkbox with greater indent than the previous checkbox gets `parentLine = previous.line`. |

Notes:
- A candidate carries `{line, rawLine, checked, text, indent, parentLine?, tableCells?}`.
- Section does not matter (I15): the offsite's actions under "Morning" and "Afternoon" are found because the scan is whole-file.
- Prose without a checkbox is never extracted (I14).
- A partial row such as `- [ ]` with empty text is dropped with a warning.

Tests: each of the 4 bullets, `[X]`, nested, table, `ACTION:`, blockquote (09-21), fenced block and HTML comment (10-09), multi-line comment, unclosed fence (treat the rest as code; warn).

### M4. Line parser (`core/parse/line.ts`)

**Purpose**: split `"Priya N. to send revised quote to Acme — by Friday"` into owner text, task, due text.
**Requirements**: R1, R2 (extraction part).

| Function | Signature | How |
|---|---|---|
| `splitOwnerTask` | `(text) => {ownerRaw, task}` | Strip leading `@`. Try, in order: `^@?(owner):\s+(task)`; `^(owner)\s+to\s+(task)`; `^(owner)\s+(will\|should)\s+(task)`. `owner` pattern allows: names, `Priya N.`, `A & B`, `A and B`, `A (with B)`, `Everyone`, `Team`, `Someone`, `TBD`. No match → `ownerRaw = ''` (unassigned) and `task = text`. |
| `splitTaskDue` | `(task) => {task, dueRaw}` | Look for a **trailing** due clause: `(—\|-\|,)?\s*(by\|before\|due\|until)\s+<date phrase>$`; also trailing `EOD`, `by tomorrow`; also `, results due 15 October`; also `proposal by 2026-10-09`. The phrase is matched against the **known date-phrase grammar** of M6 so that "by the end of the cutover" is captured as unresolvable rather than cut wrongly. The task keeps its remaining text, trimmed. |
| `parseCandidate` | `(c: Candidate) => ParsedLine` | Table rows take owner/due from their cells. Combines the two above. |

Owner grammar details:
- `A & B` / `A and B` → `ownerRaw = 'A & B'`, kept raw; M5 splits into two.
- `Lena (with Priya)` → primary `Lena`, helper `Priya`.
- Verbs after "to" (send, write, fix…) are not interpreted. The task text is kept verbatim.

Tests: all 12+ owner/due shapes in the sample, including `Priya S.`, `@anita:`, `Everyone`, `Someone`, `TBD`, the no-owner case, `Team to decide on the launch date`.

### M5. People and owner resolution (`core/people`)

**Purpose**: turn owner text into real people, handling the two Priyas and two Rahuls.
**Requirements**: R1, R5, F-LST-2 (owner filter), F-FUP-8.

| Function | Signature | How |
|---|---|---|
| `buildDirectory` | `(meetings, config?) => Directory` | Collect every name from all attendee lists. Split to first/last. Merge `config/people.json` (emails, aliases). Person id = slug of full name. |
| `resolveOwner` | `(ownerRaw, meeting, dir) => OwnerRef` | See decision list below. |
| `findPeople` | `(query, dir) => Person[]` | For `list --owner` and `followup`: case-insensitive; full name → 1; first name → all matches. Caller errors when >1. |
| `groupOwner` | `(raw) => 'group' \| null` | `everyone`, `all`, `team`, `everybody`. |

`resolveOwner` decision list (first hit wins):
1. Empty, `someone`, `tbd`, `?`, `n/a` → `unassigned`.
2. Group word → `group`.
3. Split joint owners on `&`, `and`, `,`; resolve each part with the rules below; item has several people.
4. Part matches a **full name** in directory → `person`.
5. Part is `First I.` (initial) → people whose first matches and last starts with the initial; exactly one → `person`.
6. Part is a bare first name → candidates = directory people with that first name. Narrow to candidates **who attended this meeting**:
   - exactly 1 left → `person`;
   - 0 left and exactly 1 in the whole directory → `person` (the person simply wasn't listed);
   - more than 1 left, or no attendee list and more than 1 in the directory → `ambiguous`, `candidates` filled, warning `OWNER_AMBIGUOUS`;
   - not in the directory → `unassigned` with warning `OWNER_UNKNOWN`.
7. Config `aliases` (global, or scoped to a note file, e.g. `{"2026-09-17-billing-migration-sync.md": {"Priya": "Priya Nair"}}`) are consulted before rule 6. This is how a user resolves an ambiguous owner: edit the config, re-run `ingest`.

Tests: `Priya` in 09-03 (→ Shah), in 09-17 (→ ambiguous), `Priya N.`, `Rahul` in 09-02 (→ Mehta), 10-07 (ambiguous), 09-30 (ambiguous), `Anita & Rahul`, `Lena (with Priya)`, 09-23 (no attendees).

### M6. Date resolution (`core/dates`)

**Purpose**: turn due text into a real date, relative to the meeting date.
**Requirements**: R2, F-ING-2, F-LST-2 (`--due-before`).

Dates are strings; all arithmetic is done in UTC to avoid DST/timezone bugs.

| Function | Signature | How |
|---|---|---|
| `resolveDue` | `(raw, meetingDate, meetingDateInferred) => DueRef` | Normalise (lowercase, strip `by`, `on`, `due`, `before`, trailing punctuation). Try each rule in the order below. If no meeting date and the phrase is relative → `date = null`, `reason = 'no-meeting-date'`. If the meeting date was inferred, resolve but set `inferred = true`. |
| `parseAbsolute` | `(s, year) => ISODate \| null` | ISO; `D Mon[th] [YYYY]`; `Mon[th] D[st/nd/rd/th]`; `Weekday D Mon` (checks weekday, flags `weekday-mismatch`). Missing year → meeting's year. |
| `nextWeekday` | `(from, weekday, {strictlyAfter}) => ISODate` | First matching weekday after `from`; same weekday → +7 (Q1). |
| `endOfNextWeek` | `(from) => ISODate` | Friday of next ISO week. |
| `endOfMonth`, `midMonth` | `(from \| month) => ISODate` | Last day; 15th. |
| `weekdayNumber` | `(s) => 0..6 \| null` | `mon`, `monday`, `wed`, `thu`, `thurs` … |

Rule order (most specific first):
1. ISO
2. Absolute with day/month
3. `tomorrow`, `eod tomorrow`, `by tomorrow` (+1)
4. `eod`, `today`, `end of day` (+0)
5. `next <weekday>` (the weekday in the following week)
6. `<weekday>` (next occurrence)
7. `end of next week`, `end of (the) month`, `mid-<month>`, `mid <month>`, `end of <month>`
8. anything else → `date = null`, `reason = 'unresolvable'`, raw text kept, warning `DUE_UNRESOLVABLE`.

Tests: the full table in R2 as a data-driven test; plus meeting on a Friday saying "by Friday"; leap years; year rollover (meeting 2026-12-30 + `by Friday`); `Wed 16 Sep` with a wrong weekday.

### M7. De-duplication and status carry-over (`core/dedupe`)

**Purpose**: collapse repeats across meetings into one item with history.
**Requirements**: R3, R6, F-ING-6, F-DON-3.

| Function | Signature | How |
|---|---|---|
| `normaliseTask` | `(task) => string` | Lowercase; strip punctuation, articles, filler (`the`, `a`, `to`, `our`); drop a trailing due clause if one was missed; collapse whitespace; light stemming (`finalise`/`finalize`, `update`/`updated`). |
| `ownerKey` | `(owner: OwnerRef) => string` | Sorted person ids; or `group`/`unassigned`; or `?first` for ambiguous. |
| `similarity` | `(a, b) => number` | Dice coefficient on word sets, boosted when one task is a prefix of the other. 0..1. |
| `stageGuard` | `(a, b) => boolean` | Returns `false` (do not merge) if the two tasks differ in a **stage verb** from a fixed list: `estimate/start/finish/publish/collect/write/review/book/schedule/send/deploy/fix`. This is what keeps "estimate SSO work" and "start SSO spike" apart. A small, explicit list, easy to extend. |
| `mergeOccurrences` | `(parsed: ParsedItem[]) => {items, uncertain}` | Process in (meeting date, file name) order. For each parsed item find an existing item with the **same ownerKey** and `similarity ≥ 0.85` and `stageGuard`. Merge: add occurrence; latest due date wins and the old one goes to `dueHistory`; status per the rules below. A pair scoring 0.6–0.85 is **not merged** and goes into `uncertain` for the report. Different owner never merges. |

Status rules inside `mergeOccurrences`:
- Any occurrence `checked` → item is `done` (`doneBy: 'notes'`).
- If a *later* occurrence is unchecked after a checked one → stay `done`, add flag `reopened-in-notes`, warn.
- The ambiguous-owner case: `?priya` items only merge with `?priya`.
- A sub-item stores `parentId` by mapping `parentLine` to the item created from that line.

Item id: `ids.makeId(firstOccurrence)` = first 6 hex of SHA-1 of `sourceFile + normalised raw line without status/due`. Collisions extend to 8 hex. The id is **stable under re-ingest**, and not affected by owner resolution (so resolving an ambiguity doesn't change it).

Tests: the golden cases from §10 of the requirements (quote item ×3 done; budget item; wireframes slip; SSO estimate vs spike; quotes collect vs publish; CTO call book vs QBR schedule; same task different owner; refund line; freeze invoice edits ×2).

### M8. Store and overrides (`core/store`)

**Purpose**: persist items; protect human edits across re-ingest.
**Requirements**: F-ING-4, F-ING-5, F-DON-4, NFR-3.

Store file shape:

```json
{ "version": 1, "meetings": [...], "items": [...],
  "overrides": { "<itemId>": { "status": "done", "doneAt": "..." } },
  "drafts": { "<personId>": { "draftId": "...", "createdAt": "..." } },
  "lastIngest": { "at": "...", "report": {...} } }
```

| Function | Signature | How |
|---|---|---|
| `loadStore` / `saveStore` | `(path) => Store` / `(path, store)` | Missing file → empty store. Save = write temp file, then rename (atomic). Version check; unknown version → clear error. |
| `applyIngest` | `(store, parsedMeetings, items) => Store` | Replace meetings and items derived from the ingested files; keep `overrides` and `drafts` untouched. Items whose source line no longer exists get flag `missing-from-notes` (F-ING-5), not deleted. |
| `applyOverrides` | `(items, overrides) => items` | Last step of ingest and of every read: a `done` override beats the notes. |
| `markDone` | `(store, id) => {item, changed}` | Sets override + `doneAt`; idempotent. |

Location: `--store <path>` flag, `ACTIONTRACK_STORE` env, default `./.actiontrack/store.json`.

Tests: ingest twice (same output), done then re-ingest, changed file, removed line, corrupted JSON (clear error, no overwrite).

### M9. Ingest orchestrator (`core/ingest.ts`)

**Purpose**: wire M1–M8 and build the report.
**Requirements**: F-ING-1…6, NFR-1.

```ts
async function ingest(dir: string, opts): Promise<IngestReport> {
  files = scanFolder(dir)
  for f of files:
    r = readNote(f); if (!r.ok) { report.skipped.push(...); continue }
    try {
      meeting = parseMeetingHeader(r.text, f)
      {candidates, ignored} = extractCandidates(body)
      if (!candidates.length) report.skipped.push({reason:'no-actions'})   // still keep meeting
      parsed += candidates.map(parseCandidate)
    } catch (e) { report.skipped.push({reason:'unreadable'}); continue }   // one bad file never aborts
  dir = buildDirectory(meetings, config)
  items = parsed → resolveOwner → resolveDue → mergeOccurrences
  store = applyIngest(...) ; applyOverrides ; saveStore
  return report
}
```

The whole per-file body sits in try/catch. This is the single place that guarantees NFR-1. Exit code: 0 whenever at least one file was processed.

### M10. Query (`core/query`)

**Purpose**: filtering for `list`.
**Requirements**: F-LST-1…5, R7.

| Function | Signature | How |
|---|---|---|
| `effectiveStatus` | `(item, asOf) => 'open' \| 'done' \| 'overdue'` | `done` if done; `overdue` if open and `due.date < asOf`; else `open`. |
| `isOverdue` | `(item, asOf) => boolean` | Items with `due.date = null` are never overdue. |
| `queryItems` | `(items, filters, dir, asOf) => ActionItem[]` | Filters AND-ed. `--owner`: use `findPeople`; >1 match → throw `AmbiguousOwnerError(candidates)`; `none` matches unassigned. `--status open` = not done (Q4); `overdue` = overdue only; `done` = done only. `--due-before D` = `due.date < D`, nulls excluded. Default (no status filter) = not done. Sort: overdue first, then due date ascending, nulls last, then id. |

### M11. Follow-up and Gmail (`core/followup`)

**Purpose**: build one review-ready email per owner and create a Gmail draft.
**Requirements**: F-FUP-1…10, R9, NFR-5.

| Function | Signature | How |
|---|---|---|
| `selectItemsFor` | `(person, items, asOf, {includeGroup}) => ActionItem[]` | Items whose owner includes this person (or helpers if wanted), not done. Group items only with `includeGroup`. Ambiguous items are never included. |
| `buildFollowup` | `(person, items, asOf) => Draft` | `{to, subject, body, itemIds, warnings}`. Subject: `Follow-up: N open action items (M overdue)`. Overdue section first, then open. Per item: task, due date (+ "N days overdue"), meeting title and date, item id. |
| `renderBody` | `(person, sections) => string` | Plain text template; short, polite, no blame. Template lives in a constant so it is easy to review/edit. |
| `redactForConfidential` | `(item, recipient, meetings) => item` | If the item's meeting is `confidential` and the recipient did not attend it, the item is omitted and a warning explains why. Otherwise only the task text is used, never the meeting's discussion text (R9). |
| `GmailDrafter` (interface) | `createDraft(d: Draft): Promise<{draftId}>` | **The only method.** No `send` exists anywhere in the codebase; a unit test greps the source for `send` calls into the adapter. |
| `McpGmailDrafter` | | Connects to the Gmail MCP server with `@modelcontextprotocol/sdk` client; calls its create-draft tool. Needs one-time OAuth (see §9 risks). |
| `FileGmailDrafter` | | Writes the draft as JSON/`.eml` in `.actiontrack/drafts/` and returns a fake id. Default until the connector is set up; `--gmail mock\|mcp` selects it. |
| `followup` | `(ownerQuery, opts) => Result` | Resolve person (`findPeople`; refuse when ambiguous, F-FUP-8) → select items → none: say so and stop (F-FUP-6) → build → `--dry-run` prints → else check `store.drafts[person]` and, if there is already a draft, warn and require `--replace` (F-FUP-7) → `createDraft` → record draft id. |

Tests: Karan (overdue first), person with no items, ambiguous `Priya`, missing email, `--dry-run` creates nothing (spy on drafter), confidential 10-09 items, run twice.

### M12. CLI (`src/cli`)

**Purpose**: argument parsing and human output only; no logic.
**Requirements**: all F-* command items, NFR-6.

| Command | Wiring |
|---|---|
| `ingest <folder> [--recursive] [--store p] [--verbose] [--json]` | calls `ingest()`; prints the report (files read, meetings, items, skipped + reasons, warnings grouped by code, uncertain merges) |
| `list [--owner n] [--status open\|done\|overdue] [--due-before d] [--as-of d] [--json]` | `queryItems`; table with columns `ID · OWNER · TASK · DUE · STATUS · SOURCE`; overdue red, unassigned dim |
| `done <id>` | `markDone`; prefix id match allowed if unique |
| `followup <owner> [--dry-run] [--include-group] [--replace] [--gmail mock\|mcp] [--as-of d]` | `followup()` |

Shared pieces:
- `format.ts`: `renderTable(items)`, `renderReport(report)`, colour only when stdout is a TTY.
- Error handling: one top-level handler maps `FolderError`, `AmbiguousOwnerError`, `UnknownIdError`, `StoreError` to a message plus exit code 1. Anything else prints a short message and a hint to re-run with `--verbose` for the stack.
- Binary name `actiontrack` via `package.json` `bin`.


## 6. Cross-module behaviour

**Warnings** use stable codes so the CLI output and tests can group them: `DATE_INFERRED`, `DUE_UNRESOLVABLE`, `DUE_WEEKDAY_MISMATCH`, `OWNER_AMBIGUOUS`, `OWNER_UNKNOWN`, `ITEM_REOPENED`, `FENCE_UNCLOSED`, `EMPTY_ITEM`, `MISSING_EMAIL`.

**Errors**: only these are fatal — folder missing, store corrupt/unknown version, bad CLI arguments. Everything per-file is caught and reported.

**Determinism**: files sorted by name; items by (meeting date, file, line); ids from content hashes; no `Date.now()` inside core except via an injected `clock`/`asOf`.

**Configuration** (`actiontrack.config.json`, optional): `people` (emails, aliases), `confidentialMeetings` (file globs), `mergeThreshold`. Defaults are applied when the file is missing.

## 7. Build order (milestones)

| # | Milestone | Modules | Done when |
|---|---|---|---|
| 1 | Project scaffold: TS strict, vitest, eslint, fixtures copied | — | `npm test` runs with one passing test |
| 2 | Read and parse | M1, M2, M3, M4 | All 36 sample files parse or skip with no crash; ignored-candidate cases pass |
| 3 | Dates and people | M6, M5 | R2 table and R5 cases pass |
| 4 | Merge and store | M7, M8, M9 | Acceptance criteria 1–6, 14 pass; ingest idempotent |
| 5 | CLI core | M10, M12 (`ingest`, `list`, `done`) | Criteria 7–10 pass from the terminal |
| 6 | Follow-up | M11 with mock drafter, M12 `followup` | Criteria 11–13 pass |
| 7 | Real Gmail | `McpGmailDrafter` | One real draft created and verified in Gmail Drafts |

Each milestone ends with its tests green before the next starts. Milestones 2–4 carry the highest risk, because parsing, dates and merging decide whether the data is right.

## 8. Test strategy

- **Unit** (fast, pure): one file per function group; the R2 date table and R5 owner cases are **data-driven** (`it.each`) so adding a case is one line.
- **Fixture integration**: ingest the full sample folder, snapshot `items.json` and the report. Reviewed by hand once, then locked. Changes in the snapshot show up in code review.
- **Property checks**: ingest is idempotent; shuffling file order does not change the result; any random byte file never throws.
- **CLI e2e**: spawn the built binary against a temp store; assert stdout, exit codes.
- **Safety test**: the `GmailDrafter` interface has exactly one method, and `followup --dry-run` makes zero calls to it.

## 9. Risks and how the design handles them

| Risk | Handling |
|---|---|
| Gmail MCP connector is a claude.ai connector that needs OAuth; a standalone CLI may not reach it directly | `GmailDrafter` interface + file-based mock so everything else is built and tested first; milestone 7 is isolated. To be checked early (Q10) |
| Fuzzy merging merges things that differ or splits things that match | Conservative threshold, `stageGuard`, borderline pairs listed in the report, thresholds configurable, golden cases in tests |
| Ambiguous owners silently get emails | Ambiguous items are excluded from `followup` by construction |
| Relative dates misread | Single documented rule set; raw text always stored and displayed; unresolvable stays null instead of guessing |
| Hand edits lost on re-ingest | Overrides stored separately from derived data and re-applied last |
| Confidential content leaks into drafts | Drafts use only task text; confidential meeting items filtered by recipient; covered by a test |

## 10. Open items to settle before coding

1. Confirm the §11 answers in the requirements, especially Q1 (weekday rule), Q2 (email source) and Q10 (Gmail connector access).
