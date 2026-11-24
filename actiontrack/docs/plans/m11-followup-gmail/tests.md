# Tests — M11 Follow-up and Gmail drafts

Plan: [plan.md](plan.md) · Files under test: `select.ts`, `build.ts`, `render.ts`, `redact.ts`, `gmail.ts`, `fileGmail.ts`, `mcpGmail.ts`, `followup.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

All tests use `FileGmailDrafter` or a spy drafter. **No test calls a real Gmail endpoint** except the manual milestone-7 check in section J. Fixed `--as-of 2026-10-15`.

## A. `selectItemsFor`

| ID | Case | Expected |
|---|---|---|
| M11-01 | Person with 3 open items and 1 done | 3 returned |
| M11-02 | Done items | never included |
| M11-03 | Joint owner (`Anita & Rahul`) | item in **both** people's selections |
| M11-04 | Group item, no `includeGroup` | excluded |
| M11-05 | Group item with `includeGroup: true` | included for every attendee of that meeting only |
| M11-06 | Ambiguous item (`?priya`) `[NAME]` | **never** included, for Nair or for Shah |
| M11-07 | Unassigned item `[GAP]` | never selected for anyone |
| M11-08 | Person who is only a helper | not selected (pinned) |
| M11-09 | Item with no due date `[GAP]` | included; listed under Open |
| M11-10 | Merged item (3 occurrences) `[DUP]` | included once |
| M11-11 | Items flagged `missing-from-notes` | included (still open) with note (pinned) |
| M11-12 | Person owns nothing | empty list |
| M11-13 | Selection order | stable: overdue first, then due, then id |

## B. Command flow and refusal rules

| ID | Case | Expected |
|---|---|---|
| M11-20 | `followup "Karan Joshi" --as-of 2026-10-15` (mock) | one draft created; overdue items first; **nothing sent** (acceptance 11) |
| M11-21 | `followup Priya` `[NAME]` | refused; message lists Priya Nair and Priya Shah; drafter not called (acceptance 12) |
| M11-22 | `followup "Priya Nair"` | draft created |
| M11-23 | `followup Rahul` `[NAME]` | refused; lists both Rahuls |
| M11-24 | `followup "priya nair"` (case) | works |
| M11-25 | `followup Zed` (not in directory) | clear error; no draft |
| M11-26 | Person with no open items | prints "no open items for X"; no draft; exit 0 (F-FUP-6) |
| M11-27 | Person whose only items are ambiguous `[NAME]` | "no open items" message, plus a notice that ambiguous items were left out |
| M11-28 | `followup none` / unassigned owner `[GAP]` | refused: unassigned items cannot be targeted |
| M11-29 | `followup everyone` | refused unless pinned otherwise; group items go out only via attendees with `--include-group` |
| M11-30 | Empty query `''` | usage error `[BAD]` |
| M11-31 | `--include-group` | group items added to the person's email |

## C. Draft content (`buildFollowup`, `renderBody`)

| ID | Case | Expected |
|---|---|---|
| M11-40 | Subject | `Follow-up: N open action items (M overdue)` with correct numbers |
| M11-41 | Singular wording | `1 open action item (1 overdue)` or the pinned singular form |
| M11-42 | No overdue items | subject omits or shows `(0 overdue)` as pinned; no Overdue section |
| M11-43 | Overdue section first | Overdue list precedes Open list |
| M11-44 | Overdue line | task, due date, `N days overdue`, meeting title, meeting date, item id |
| M11-45 | Open line | task, due date, meeting title and date |
| M11-46 | No due date `[GAP]` | line says "no due date" under Open |
| M11-47 | Due date unresolved but raw text exists `[GAP]` | shows the raw text (`by the end of the cutover`) as written |
| M11-48 | Item from a merged item `[DUP]` | meeting shown is the **latest** occurrence's (pinned); no repeated lines |
| M11-49 | Item with a slipped due date `[DUP]` | shows the current due date; no blaming wording |
| M11-50 | Tone | body contains no words from a blocklist (`failed`, `late again`, `you forgot`, `blame`, `overdue!!`) |
| M11-51 | Body is plain text | no HTML tags |
| M11-52 | Template | one constant; snapshot test locks the whole body for Karan |
| M11-53 | Meeting with null date `[GAP]` | shows title only, no `null` or `undefined` text |
| M11-54 | Special characters in task (quotes, `&`, emoji) | preserved |
| M11-55 | `itemIds` | lists exactly the included items |
| M11-56 | Same input twice | identical draft (determinism) |

## D. Recipients and missing email

| ID | Case | Expected |
|---|---|---|
| M11-60 | Person with email in config | `to = email` |
| M11-61 | No email `[GAP]` | draft built with empty `to`; warning `MISSING_EMAIL` (Q2) |
| M11-62 | Invalid email in config | warning; empty `to` |
| M11-63 | Two people with the same first name, only one has an email `[NAME]` | each draft uses its **own** address |
| M11-64 | Draft addressed to someone other than the owner | impossible: test asserts `to` ∈ {owner email, ''} |
| M11-65 | cc and bcc | never set (Q7) |

## E. Confidentiality (10-09 security review)

| ID | Case | Expected |
|---|---|---|
| M11-70 | Items from `2026-10-09-security-review`, recipient attended (Sam, Rahul Verma, Priya Shah, Karan) | included; **task text only** |
| M11-71 | Recipient did **not** attend (e.g. Meera) | those items omitted; warning explains why (acceptance 13) |
| M11-72 | Draft body | contains no discussion text, no finding details, no content from the fenced block or comment |
| M11-73 | Recipient with confidential and normal items | normal ones included; confidential ones filtered per attendance |
| M11-74 | Meeting flagged by front matter `confidential: true` | same behaviour |
| M11-75 | Meeting flagged by config glob | same behaviour |
| M11-76 | Group owner item from the confidential meeting with `--include-group` | only attendees can receive it |
| M11-77 | Confidential item whose owner is ambiguous `[NAME]` | not included for anyone |
| M11-78 | Meeting title is itself sensitive | pinned: title is shown only to attendees |
| M11-79 | Merged item with one confidential occurrence and one normal `[DUP]` | treated as confidential if any occurrence is (pinned, safest) |
| M11-80 | Redaction never alters the stored item | pure function; input unchanged |

## F. Duplicate-draft protection

| ID | Case | Expected |
|---|---|---|
| M11-90 | First run | draft created, `recordDraft` called |
| M11-91 | Second run, no `--replace` `[DUP]` | warns, creates nothing, exits cleanly; drafter call count stays 1 |
| M11-92 | Second run with `--replace` | creates a new draft (or updates), records the new id |
| M11-93 | Different person | unaffected by the first person's draft record |
| M11-94 | Two Priyas, draft recorded for Nair `[NAME]` | `followup "Priya Shah"` is not blocked |
| M11-95 | `--dry-run` after a real draft | prints; no warning about duplicates needed; nothing changes |
| M11-96 | Store drafts survive re-ingest | still blocks a second draft |

## G. `--dry-run`

| ID | Case | Expected |
|---|---|---|
| M11-100 | Spy drafter | **zero** calls to `createDraft` |
| M11-101 | `.actiontrack/drafts/` | unchanged (no files) |
| M11-102 | Store file | byte-identical before and after |
| M11-103 | Output | To, Subject, Body, item ids, warnings |
| M11-104 | `--dry-run` with ambiguous owner | still refused |
| M11-105 | `--dry-run` with no email | prints draft, warning `MISSING_EMAIL` |

## H. Gmail adapter safety (NFR-5)

| ID | Case | Expected |
|---|---|---|
| M11-110 | `GmailDrafter` interface has exactly **one** method, `createDraft` | type-level and runtime check |
| M11-111 | Grep `src/**` for `send` calls into any adapter (`.send(`, `sendMessage`, `messages.send`, `drafts.send`) | none |
| M11-112 | `McpGmailDrafter` public API | only `createDraft` |
| M11-113 | `FileGmailDrafter` | writes JSON or `.eml`; returns an id; id is deterministic under the test clock |
| M11-114 | `FileGmailDrafter` with read-only folder | clear error; store not updated `[BAD]` |
| M11-115 | Drafter throws | error shown; **no draft id recorded**; store unchanged |
| M11-116 | `--gmail mock` is the default | `mcp` used only when asked |
| M11-117 | `--gmail mcp` with connector not authorised | clear message pointing to setup; no crash; no fallback to sending |
| M11-118 | Draft body built only from item and meeting data (NFR-4) | no environment variables, paths or store contents leak into the body |

## I. Joint owners and fixtures

| ID | Case | Expected |
|---|---|---|
| M11-120 | `Anita & Rahul` item (09-18) | appears in Anita Desai's and Rahul Mehta's drafts |
| M11-121 | Same item for `Rahul` (ambiguous query) `[NAME]` | refused before selection |
| M11-122 | Karan Joshi on the sample | overdue items first; includes offsite summary due 2026-10-01 |
| M11-123 | Offsite Everyone Q4 goals | only with `--include-group` |
| M11-124 | Items from `untitled.md` `[GAP]` | never in any email (no owner) |
| M11-125 | Items with `Someone` / `TBD` `[GAP]` | never in any email |
| M11-126 | Snapshot of Karan's and Priya Nair's drafts | match reviewed snapshots |

## J. Milestone 7: real Gmail (manual checklist, not automated)

| ID | Step | Expected |
|---|---|---|
| M11-130 | Confirm the connector is authorised for this workstation (Q10) | yes, or limitation recorded in docs |
| M11-131 | List the connector's tools | a create-draft tool exists; no send tool is used |
| M11-132 | Map `Draft` to the tool inputs | fields match |
| M11-133 | Create one real draft for a test address | draft appears in Gmail Drafts |
| M11-134 | Check the Sent folder | nothing sent |

## Done when

Acceptance 11–13 pass with the mock, safety tests H pass, and either M11-133 is verified or the limitation is written into the docs.

## Implementation notes (automated coverage)

Tests live in `test/unit/followup/followup.test.ts` and `test/unit/followup/m11-spec.test.ts` (IDs are in the test titles). Pinned to actual behaviour:

- M11-42: zero overdue shows `(0 overdue)` and no Overdue section.
- M11-27: the notice says "items with an unclear owner … left out"; Priya Shah has no open items of her own on the sample.
- M11-62: a bad config email gives a warning and the email is dropped.
- M11-78: the meeting title is left out of the draft for non-attendees because the whole confidential item is removed.
- Items with no due date tie on date, so they are ordered by id.
- Not automated: M11-130 to M11-134 (real Gmail, manual; `McpGmailDrafter` is intentionally a stub that fails with a clear message, M11-117).
