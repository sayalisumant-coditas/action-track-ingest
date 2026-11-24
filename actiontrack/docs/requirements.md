# actiontrack — Requirements Specification

Status: Draft v1 · Date: 2026-11-24
Source material: 36 files in `notes/` (Sept 1 – Oct 14, 2026) and the CLI brief.

## 1. Purpose

Meeting notes pile up as markdown. Action items get lost and follow-up emails are late or never written. `actiontrack` reads the notes, tracks every action item, and drafts follow-up emails for a human to review. **It never sends email.**

## 2. Scope

**In scope**
- A Node/TypeScript CLI with four commands: `ingest`, `list`, `done`, `followup`.
- A local store of meetings and action items.
- Gmail draft creation through the Gmail MCP connector.
- A small optional config file for people (emails, aliases) and settings.

**Out of scope (v1)**
- Any web UI or HTTP API (the tool is CLI-only), sending email, calendar integration, writing back into the note files, multi-user auth, notes in languages other than English.

## 3. Users

- **Team member**: wants to see their own open and overdue items.
- **Meeting organiser / team lead**: runs `ingest` after meetings, then `followup` to chase owners.

## 4. Input: what the notes actually look like

The sample folder has 36 files. Parsing must handle every shape below. Treat the list as the test corpus.

| # | Observation | Example file(s) | Required behaviour |
|---|---|---|---|
| I1 | Standard header: `# Meeting: …`, `Date:`, `Attendees:` (comma list), `## Discussion`, `## Action items` | most files | Parse normally |
| I2 | YAML front matter (`title`, `date`, `attendees: [..]`) instead of header | 09-16-standup, 09-30-standup | Parse normally |
| I3 | Date in several formats: `2026-09-01`, `9 September 2026`, `Monday, 14 September 2026` | 09-09-qa-standup, 09-14-onboarding | Normalise to ISO date |
| I4 | Unparseable date: `sometime last week` | 10-03-sales-pipeline | Fall back to the filename date, mark the meeting date as *inferred*, warn |
| I5 | No attendees section | 09-23-standup | Parse; owner resolution has no attendee context (see R5) |
| I6 | No header, date or attendees at all | `untitled.md` | Ingest the items with `meeting = unknown`, no date; relative due dates cannot be resolved, so flag them |
| I7 | Empty file | `2026-09-09-notes-final-v2.md` | Skip, report as malformed (empty) |
| I8 | Binary file named `.md` (PNG bytes) | `scratch.md` | Skip, report as malformed (not text). Must not crash |
| I9 | Non-meeting `.txt` file with a checkbox | `2026-09-19-offsite-draft.txt` | Not ingested: only `.md` files are read. The brief says `.md` |
| I10 | Checkbox bullet variants: `- [ ]`, `- [x]`, `- [X]`, `* [ ]`, `+ [ ]` | 09-30-offsite, 10-02-finance-sync | All recognised; `x`/`X` = done |
| I11 | Nested sub-item under a parent item | 09-30-offsite (Karan under Meera) | Extract as its own item; record the parent link |
| I12 | Non-checkbox forms of an action: `ACTION: Karan to …` line, and a markdown table (`Owner | Action | Due`) | 09-30-offsite | Extract as items |
| I13 | Checkboxes that are **not** real action items: inside a `>` blockquote, inside a fenced code block, inside an HTML comment | 09-21-incident-review, 10-09-security-review | Ignore. Report the count of ignored candidates in verbose mode |
| I14 | Action items hidden in the Discussion prose (e.g. "Everybody should look at the prototype", "they will settle it between them") | 09-18-design-review, 09-30-offsite | Not extracted (no checkbox). Only checkbox/ACTION/table forms count |
| I15 | Action items in sections other than `## Action items` (offsite has "Morning" and "Afternoon" sections) | 09-30-offsite | Extract from anywhere in the file, subject to I13 |
| I16 | Long, messy, multi-section note (the offsite) | 09-30-offsite | Must not break parsing of surrounding items |

## 5. Data model

**Meeting**: `id`, `sourceFile`, `title`, `date`, `dateInferred` (bool), `attendees[]`.

**ActionItem**: `id` (stable, short, human-typeable), `task` (text), `owner` (resolved person, a group such as Everyone, or none), `ownerRaw` (text as written), `ownerAmbiguity` (resolved | ambiguous | unassigned | group), `due` (ISO date or null), `dueRaw` (text as written), `dueInferred` (bool), `status` (open | done), `sourceFile`, `sourceLine`, `meetingId`, `occurrences[]` (every meeting where it appeared, with the status and due date seen there), `parentId`, `doneAt`.

**Overdue** is a derived state, not stored: `status = open` and `due < today`. "Today" comes from a `--as-of <date>` option (default: the system date), so results are reproducible.

## 6. Functional requirements

### 6.1 `actiontrack ingest <folder>`

- **F-ING-1**: Parse every `.md` file in the folder, non-recursive by default (`--recursive` optional).
- **F-ING-2**: For each item store owner, task, due date resolved to a real date, source file, source line and status.
- **F-ING-3**: Malformed files are skipped, never fatal. At the end, print a report: files read, meetings parsed, items stored, files skipped with a reason, and warnings (inferred dates, ambiguous owners, unresolvable due dates). Exit code 0 if any file was processed, even when some were skipped; non-zero only if the folder is missing or unreadable.
- **F-ING-4**: Ingest is **idempotent**. Running it twice on the same folder produces the same items and the same ids, no new duplicates, and keeps any `done` marking made via the CLI.
- **F-ING-5**: Re-ingesting a changed file updates items from that file. An item that disappears from a file is flagged, not silently deleted.
- **F-ING-6**: Items are processed in meeting-date order so that status carry-over (R3) is deterministic.

### 6.2 `actiontrack list`

- **F-LST-1**: By default show all **open and overdue** items, one row per de-duplicated item: id, owner, task, due, status, source.
- **F-LST-2**: Filters, combinable (AND):
  - `--owner <name>`: case-insensitive; matches the full name, or a first name if unambiguous. A first name shared by two people must return a clear message listing both, not a silent merge (R5).
  - `--status open|done|overdue`: `open` means not done (overdue items are a subset of open and are marked as such; `open` excludes overdue **only if** the decision in §11 Q4 says so).
  - `--due-before <date>`: due date strictly before the given date. Items with no due date are excluded.
- **F-LST-3**: Overdue items are visibly flagged (and, in a terminal, coloured).
- **F-LST-4**: Output formats: a table (default) and `--json`.
- **F-LST-5**: Items with no owner or no due date appear in a clearly marked state (`unassigned`, `no due date`), not hidden and not erroring.

### 6.3 `actiontrack done <id>`

- **F-DON-1**: Mark the item done, with a `doneAt` timestamp.
- **F-DON-2**: Unknown id → clear error, non-zero exit. Already done → no-op with a notice.
- **F-DON-3**: Marking a de-duplicated item done applies to the whole item (all its occurrences).
- **F-DON-4**: A manual `done` survives re-ingest (F-ING-4), even if the notes still show it unchecked.

### 6.4 `actiontrack followup <owner>`

- **F-FUP-1**: For one owner, build one email covering their **open and overdue** items. Overdue items come first and are labelled.
- **F-FUP-2**: Create a **Gmail draft** through the Gmail MCP connector. The command must never call a send operation. This is enforced in code, not only by convention: the Gmail adapter exposes only `createDraft`.
- **F-FUP-3**: Email content per item: task, original due date (and days overdue), the meeting it came from (title and date). Short, plain, polite tone; no blaming language.
- **F-FUP-4**: Recipient address comes from a people directory (§7); the notes contain no email addresses. If the owner has no address, create the draft with an empty "To" and warn, or stop. See §11 Q2.
- **F-FUP-5**: `--dry-run` prints the draft to the terminal and creates nothing. This is the review step before a real draft is created.
- **F-FUP-6**: If the owner has no open items, say so and create no draft.
- **F-FUP-7**: Re-running `followup` for the same owner must not pile up duplicate drafts: either update the earlier draft or warn first (record the draft id against the owner).
- **F-FUP-8**: Ambiguous owner names (R5) are refused with a clear message; never guess.
- **F-FUP-9**: Items owned by a group (e.g. "Everyone") are included in every attendee's email only when `--include-group` is passed.
- **F-FUP-10**: Confidentiality: items from meetings marked confidential (see R9) must not have sensitive content copied into an email addressed to anyone who was not in that meeting.

## 7. Business rules (derived from the notes)

**R1 — Owner extraction.** Pattern is `<Owner> to <task>`; also `@name:`, `Owner: task`, table column. Owner may be: a first name, a full name, an abbreviation with initial (`Priya N.`, `Priya S.`), `Anita & Rahul` (joint), `Lena (with Priya)` (owner plus helper), `Everyone`/`Team`, `Someone`, `TBD`, or absent.
- Joint owners: record all; item appears in each owner's list.
- Owner with helper: primary = first name; helper stored as secondary.
- `Everyone`/`Team`: group owner (see F-FUP-9).
- `Someone`/`TBD`/none: **unassigned**.

**R2 — Due date resolution.** All resolved relative to the **meeting date**, never the ingest date. The raw text is always kept.

| Written as | Example | Resolves to |
|---|---|---|
| ISO | `2026-09-08` | itself |
| Day + month, no year | `10 Sep`, `by 12 Oct`, `Oct 3rd`, `15 October`, `2 Oct` | that date, in the meeting's year |
| Weekday | `by Friday`, `Wed`, `by Mon`, `Thursday` | the **next** such weekday strictly after the meeting date |
| `next <weekday>` | `by next Tuesday` | the first such weekday in the week after the meeting's week |
| `tomorrow` / `by tomorrow` / `EOD tomorrow` | | meeting date + 1 |
| `EOD` / `today` | | meeting date |
| Weekday + date | `Wed 16 Sep` | the date (check the weekday matches; warn if not) |
| `end of next week` | | Friday of next week |
| `end of month` | | last day of the meeting's month |
| `mid-October` | | the 15th |
| `by the end of the <thing>`, `before the next review`, `after the cutover` | | not resolvable: due = null, keep the raw text, warn |
| nothing | | due = null |

Rule: a weekday due that matches the meeting's own weekday means +7 days. Ambiguity is always resolved the same way, and the rule is documented in the CLI `--help`.
Where the meeting date was inferred (I4/I6), any relative due date is marked `dueInferred` with a warning or left unresolved.

**R3 — De-duplication across meetings.** The same action is repeated in follow-up meetings, e.g. "Priya to send the revised quote to Acme" in 09-01 (open), 09-08 (open), 09-15 (done); "Sam to confirm cloud budget" in 09-01, 09-15, 09-22 (done).
- Match key: normalised owner + normalised task text (case, punctuation, leading verbs and "by …" due clauses stripped), with a fuzzy-similarity threshold.
- A later occurrence merges into the earlier one: **one item**, with all occurrences listed.
- **Latest status wins**: a later `[x]` closes the item. A later `[ ]` after a `[x]` does not reopen it, but raises a warning.
- **Latest due date wins**; earlier dates are kept in history (e.g. wireframes "by Thursday" slipped a week, 09-15 → 09-22).
- Same task, different owner → **different items** (do not merge).
- Same owner, same topic, **different stage** → different items: "estimate SSO work" vs "start SSO spike"; "collect customer quotes" vs "publish customer quotes"; "book renewal call" vs "schedule the QBR". Fuzzy matching must stay conservative; uncertain merges are listed in the ingest report for confirmation rather than applied silently (see §11 Q5).
- A duplicate *within* a single meeting (the quoted refund line in 09-21 and the real one) is also merged, but see I13: the quoted line is ignored in the first place.

**R4 — Missing owner or date.** Kept and shown. They are never dropped and never crash the tool. `list` shows them as `unassigned` / `no due date`. They cannot be targeted by `followup <owner>`, but a report command or `list --owner none` surfaces them. Examples: "Someone to update the CRM notes", "TBD to write the design-system changelog", "Team to decide on the launch date", `untitled.md` items.

**R5 — Owner identity and the two Priyas / two Rahuls.** The team has **Priya Nair** and **Priya Shah**, and **Rahul Mehta** and **Rahul Verma**. Resolution order:
1. Full name, or name with initial (`Priya N.`, `Priya S.`) → exact person.
2. A bare first name where **exactly one** person with that first name attended the meeting → that person. (e.g. 09-03 billing sync lists only Rahul Verma and Priya Shah; 09-02 standup lists only Rahul Mehta.)
3. A bare first name where **both** people with that name attended, or no attendee list exists → **ambiguous**. The item is stored with `ownerAmbiguity = ambiguous`, shown as e.g. `Priya (Nair or Shah?)`, and warned about in ingest. It is excluded from `followup` until resolved.
4. A config alias map (§11 Q3) lets a user pin a bare name to a person, optionally scoped to one note file (e.g. `"2026-09-17-billing-migration-sync.md": {"Priya": "Priya Nair"}`). It is applied on the next `ingest`. The CLI has no separate resolve command.
Known ambiguous cases in the sample: 09-17 ("Priya to sign off", both Priyas present), 09-30 offsite ("Priya to own the hiring plan", "Rahul to prepare the architecture overview" — the note itself says it is unclear which Rahul), 10-07 standup ("Rahul to review Anita's PR", both Rahuls present). The attendee lists for 09-30 offsite include all nine people.
Names are matched against a **people directory** built from all attendee lists across the notes, plus the optional config file.

**R6 — Status carry-over and sequence.** `[x]` in the source = done. Done items stay in the store and are shown with `--status done`. Open items that never reappear in later notes remain open (the notes are the only source of truth until `done` is used).

**R7 — Overdue.** `open` and `due < as-of date`. Items without a due date are never overdue. With the sample dated Sept–Oct 2026 and today being 2026-11-24, most open items will be overdue. This is expected; `--as-of` exists so reviews and tests can use a fixed date.

**R8 — Dependencies.** A sub-item (e.g. Karan validating targets "against the budget", nested under Meera's targets) keeps a `parentId`. Informational only; no scheduling logic.

**R9 — Confidentiality.** 10-09-security-review states "the pen-test findings should not be shared outside this group." Follow-up emails for items from that meeting go only to its attendees and contain the task text, not the finding details. The tool offers a per-meeting `confidential: true` front-matter flag, and v1 also treats this specific meeting as confidential via a keyword rule in config. Open question in §11 Q6.

## 8. Cross-cutting requirements

**Non-functional**
- **NFR-1 Robustness**: no unhandled exception on any file in the sample folder. Malformed files are always skipped with a reason.
- **NFR-2 Performance**: ingesting 200 files < 5 s on a laptop.
- **NFR-3 Determinism**: same input and `--as-of` date → identical output and ids. Ids are derived from content, not random.
- **NFR-4 Privacy**: notes and the store stay on the local machine. The only outbound call is the Gmail draft. Draft bodies are built only from item and meeting data.
- **NFR-5 Safety**: the Gmail adapter has no send capability. Draft creation is the only write.
- **NFR-6 Usability**: every error says what happened and what to do; `--help` for each command; non-zero exit codes only for real failures.
- **NFR-7 Testability**: parser, date resolver, de-duplicator and owner resolver are pure functions with unit tests. The sample `notes/` folder is the integration fixture, with expected-output snapshot tests.
- **NFR-8 Platform**: Windows and macOS/Linux, Node 20+.

**Technology constraints**
- CLI and core in Node + TypeScript.
- CLI only: no frontend and no HTTP backend.
- Storage: a local file (JSON or SQLite). A choice for the design doc.
- Gmail: via the Gmail MCP connector. This needs one-time authorisation of the connector before `followup` can create real drafts. Until then a mock Gmail adapter must be available so the tool can be developed and tested.

## 9. Configuration (optional file)

`actiontrack.config.json` in the working directory, or `--config <path>`. Every key is optional; defaults apply when the file is missing.
- `people`: list of `{fullName, email}`, used for draft recipients (F-FUP-4). Names should match the attendee lists.
- `aliases`: bare name → person, global or scoped to a note file (R5 rule 4).
- `confidentialMeetings`: file names or globs treated as confidential (R9).
- `mergeThreshold`: similarity cut-off for duplicate merging (R3).

## 10. Acceptance criteria (against the sample folder)

1. `ingest notes/` finishes with exit 0 and reports exactly two skipped files: the empty `2026-09-09-notes-final-v2.md` and the binary `scratch.md`. The `.txt` file is not read at all. `untitled.md` is ingested with an unknown meeting.
2. No item from the blockquote (Karan refund, 09-21), the fenced code block, or the HTML comment (hardware tokens, 10-09) is stored.
3. "Priya to send the revised quote to Acme" appears once, status done, with 3 occurrences.
4. "Sam to confirm cloud budget with finance" appears once, done.
5. "Anita to share updated wireframes" appears once, due 2026-09-24 → shows the history of slipping.
6. The 09-30 offsite yields: Meera targets, Karan validation (child), Lena survey, Sam on-call, Priya hiring (ambiguous), Rahul architecture (ambiguous), Everyone Q4 goals (group, due 2026-10-07), Anita brand kit (2026-10-09), Karan offsite summary (`ACTION:` line, due 2026-10-01).
7. `list --owner Priya` lists a disambiguation message for the two Priyas instead of merging; `list --owner "Priya Shah"` works.
8. `list --status overdue --as-of 2026-10-15` flags items due before that date and none without a due date.
9. `list --due-before 2026-10-01` excludes items with no due date.
10. `done <id>` followed by a re-`ingest` leaves the item done.
11. `followup "Karan Joshi" --dry-run` shows overdue items first, and creates nothing. Without `--dry-run`, one Gmail draft is created, nothing is sent.
12. `followup Priya` is refused as ambiguous; `followup "Priya Nair"` works.
13. Follow-up emails for items from 10-09 security review are addressed only to attendees of that meeting.
14. Running `ingest` twice yields identical counts and ids.

## 11. Open questions / assumptions to confirm

| # | Question | Assumption used until answered |
|---|---|---|
| Q1 | How are weekday dues resolved when the meeting falls on that weekday? | Next occurrence, +7 days (R2) |
| Q2 | Where do email addresses come from? The notes have none. | A `people.json` config mapping name → email. Missing address: draft created with an empty To, plus a warning |
| Q3 | How should a user resolve an ambiguous owner? | A config alias map (R5 rule 4). No fifth CLI command in v1 |
| Q4 | Should `--status open` include overdue items? | Yes, `open` = not done; `overdue` is the subset past due |
| Q5 | How aggressive should duplicate merging be? | Conservative: merge only above a high similarity threshold and list borderline cases for confirmation |
| Q6 | How is confidentiality detected? | An explicit `confidential` flag, with the 10-09 meeting pre-flagged by config |
| Q7 | Should one follow-up email go to the owner only, or cc the meeting organiser? | Owner only |
| Q8 | Should `.txt` files ever be ingested? | No, the brief says `.md` |
| Q9 | Group owners (`Everyone`): fan out? | Only with `--include-group` |
| Q10 | Is the Gmail MCP connector authorised for this workstation? | Not yet. A mock adapter is used until it is |

## 12. Appendix A — Input file inventory

| File | Type | Notes |
|---|---|---|
| 2026-09-01-quote-portal-kickoff | meeting | Relative dues (Friday, Thursday), ISO due |
| 2026-09-02-standup | meeting | Single Rahul (Mehta) |
| 2026-09-03-billing-migration-sync | meeting | Rahul Verma + Priya Shah only; `10 Sep`, `Monday`, `end of next week` |
| 2026-09-08-quote-portal-weekly | meeting | `Priya N.`, duplicate of 09-01, done item |
| 2026-09-09-notes-final-v2 | **empty** | skip |
| 2026-09-09-qa-standup | meeting | Date `9 September 2026` |
| 2026-09-10-acme-renewal-prep | meeting | `Someone to…` (unassigned); `tomorrow` |
| 2026-09-14-onboarding-flow-design | meeting | `Monday, 14 September 2026`; `Wed 16 Sep`; `end of month`; no-due item |
| 2026-09-15-quote-portal-weekly | meeting | Repeats and closes the quote item |
| 2026-09-16-standup | meeting | YAML front matter |
| 2026-09-17-billing-migration-sync | meeting | Both Priyas present → ambiguous "Priya" |
| 2026-09-18-design-review | meeting | `@anita:`, joint owners, helper, `TBD`, `Everyone`; prose tasks not extracted |
| 2026-09-19-offsite-draft.txt | non-meeting | not `.md`, ignored |
| 2026-09-21-incident-review | meeting | Blockquoted checkbox must be ignored; `EOD tomorrow` |
| 2026-09-22-quote-portal-weekly | meeting | Wireframes slip; done budget item |
| 2026-09-23-standup | meeting | No attendees |
| 2026-09-24-onboarding-flow-design | meeting | Repeats with shifted dues |
| 2026-09-25-qa-sync | meeting | |
| 2026-09-28-acme-renewal-checkin | meeting | Repeats CTO-call item |
| 2026-09-29-billing-cutover-planning | meeting | `Priya S.` / `Priya N.` disambiguated |
| 2026-09-30-q4-offsite | meeting | Long and messy: 4 bullet styles, nested item, table, `ACTION:` line, group owner, ambiguous Priya and Rahul, parking lot (no actions) |
| 2026-09-30-standup | meeting | YAML front matter |
| 2026-10-01-quote-portal-weekly | meeting | Group-ish owner `Team` |
| 2026-10-02-finance-sync | meeting | `[X]` uppercase, `*` and `+` bullets |
| 2026-10-03-sales-pipeline | meeting | Date `sometime last week` |
| 2026-10-05-onboarding-retro | meeting | Title differs from filename |
| 2026-10-06-quote-portal-weekly | meeting | |
| 2026-10-07-standup | meeting | Both Rahuls present → ambiguous |
| 2026-10-08-billing-go-no-go | meeting | Duplicate "freeze invoice edits" |
| 2026-10-09-security-review | meeting | Fenced code + HTML comment pseudo-items; confidentiality statement |
| 2026-10-10-sales-weekly | meeting | |
| 2026-10-12-billing-post-cutover | meeting | |
| 2026-10-13-quote-portal-weekly | meeting | |
| 2026-10-14-acme-renewal-wrapup | meeting | |
| scratch.md | **binary** | PNG bytes; skip |
| untitled.md | no header | items with no meeting, date or attendees |
