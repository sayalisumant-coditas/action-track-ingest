# Tests — M7 De-duplication and status carry-over

Plan: [plan.md](plan.md) · Files under test: `normalise.ts`, `similarity.ts`, `stageGuard.ts`, `merge.ts`, `ids.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

This module carries the **duplicates across meetings** edge case, and most of the **same-first-name** logic (`?priya` keys). Tests use small `ParsedItem` objects first, then the real sample.

## A. `normaliseTask`

| ID | Input | Expected |
|---|---|---|
| M7-01 | `Send the revised quote to Acme` | `send revised quote acme` (articles and filler removed) |
| M7-02 | `send revised quote to Acme!` | same as M7-01 (punctuation, case) |
| M7-03 | `Share updated wireframes` vs `Share wireframes` | differ only by `updated`; still similar enough to compare |
| M7-04 | `finalise welcome-email copy` / `finalize welcome-email copy` | same output |
| M7-05 | `update` / `updated` / `updating` | same stem |
| M7-06 | Leftover due clause `confirm budget by Friday` | clause dropped |
| M7-07 | Hyphenated words `design-system changelog` | consistent handling, same for both inputs |
| M7-08 | Numbers and symbols `cut cloud costs by 10%` | `10%` kept; not stripped as a due clause |
| M7-09 | `''` or only filler words | `''`, no throw `[BAD]` |
| M7-10 | Unicode quotes and dashes | normalised |
| M7-11 | Idempotent | `normaliseTask(normaliseTask(x)) = normaliseTask(x)` (property) |

## B. `ownerKey`

| ID | Owner | Expected key |
|---|---|---|
| M7-20 | Person Nair | `priya-nair` |
| M7-21 | Joint owners Rahul Mehta + Anita Desai | sorted ids, same regardless of order |
| M7-22 | `group` | `group` |
| M7-23 | `unassigned` `[GAP]` | `unassigned` |
| M7-24 | Ambiguous `Priya` `[NAME]` | `?priya` |
| M7-25 | Ambiguous `Rahul` | `?rahul`; different from `?priya` |
| M7-26 | Person Nair vs ambiguous Priya | different keys (never merge) |

## C. `similarity`

| ID | Pair | Expected |
|---|---|---|
| M7-30 | Identical normalised text | 1.0 |
| M7-31 | No shared words | 0 |
| M7-32 | `send revised quote acme` vs `send quote acme` | ≥ 0.85 (pinned) |
| M7-33 | One task is the prefix of the other | boosted; score ≥ unboosted |
| M7-34 | Symmetric | `similarity(a,b) = similarity(b,a)` (property) |
| M7-35 | Range | always 0..1 (property over random pairs) |
| M7-36 | Word order changed | same score (word sets) |
| M7-37 | Empty vs non-empty | 0, no divide-by-zero `[BAD]` |
| M7-38 | `estimate SSO work` vs `start SSO spike` | below threshold |
| M7-39 | `collect 5 customer quotes` vs `publish the customer quotes` | below 0.85 |

## D. `stageGuard`

| ID | Pair | Expected |
|---|---|---|
| M7-40 | `estimate SSO work` / `start SSO spike` | `false` (do not merge) |
| M7-41 | `collect customer quotes` / `publish customer quotes` | `false` |
| M7-42 | `book renewal call` / `schedule QBR` | `false` |
| M7-43 | `send revised quote` / `send quote` | `true` (same stage verb) |
| M7-44 | Neither task has a stage verb | `true` |
| M7-45 | One has a stage verb, the other none | `true` (guard needs two different stage verbs) |
| M7-46 | Each verb in the list: estimate, start, finish, publish, collect, write, review, book, schedule, send, deploy, fix, prepare, approve, freeze, notify | a data-driven test confirms each is detected |
| M7-47 | Verb as a noun inside a task (`review` meeting vs `review` doc) | pinned; documented as a known limit |
| M7-48 | Case differences `Estimate` / `estimate` | same |

## E. `mergeOccurrences`: golden cases from the sample `[DUP]`

| ID | Case | Expected |
|---|---|---|
| M7-50 | Priya: send the revised quote to Acme (09-01 open, 09-08 open as `Priya N.`, 09-15 done) | **1** item, `done`, **3** occurrences |
| M7-51 | Sam: confirm cloud budget with finance (09-01, 09-15, 09-22 done) | 1 item, `done`, 3 occurrences |
| M7-52 | Anita: share updated wireframes (09-15 Thu, 09-22 Thu) | merge into 1; due 2026-09-24; `dueHistory = [2026-09-17]` |
| M7-53 | Anita: 09-01 "share first wireframes" | borderline: either merged or listed in `uncertain`; the test **pins whichever the 0.85 threshold produces** |
| M7-54 | Rahul Mehta: set up staging (09-01 open, 09-08 `[x]`) | 1 item, `done` |
| M7-55 | Karan: export last quarter invoices (09-03, `[x]` 09-17) | 1 item, `done` |
| M7-56 | Karan: freeze invoice edits from 9 Oct (09-29, 10-08) | 1 item, **2** occurrences, still `open` |
| M7-57 | Karan: approve Q4 cloud spend (09-30 open, 10-02 `[X]`) | 1 item, `done` |
| M7-58 | Meera: book renewal call with CTO (09-10, 09-28, `[x]` 10-14) | 1 item, `done`, 3 occurrences |
| M7-59 | Priya Nair: prepare the renewal one-pager (09-28, 10-14) | 1 item, `open`, 2 occurrences; the 10-14 line has no due, so per M7-97 the due stays 2026-10-02 and `dueHistory` is empty (M7-59b: a new later due pushes 2026-10-02 into the history) |
| M7-60 | Rahul Verma: review schema mapping doc (09-03, 09-17) | 1 item, `open` |
| M7-61 | Anita: finalise welcome-email copy (09-14, 09-24, `[x]` 10-05) | 1 item, `done` |
| M7-62 | Each merged item | `occurrences` listed in meeting-date order with the status and due seen at each |
| M7-63 | Merged item's `task` | the text from the **first** occurrence (pinned) |

## F. Items that must stay separate `[DUP]`

| ID | Case | Expected |
|---|---|---|
| M7-70 | Rahul: **estimate** SSO work (09-14, 09-24) vs **start** SSO spike (10-05) | **2** items |
| M7-71 | Lena: **collect** 5 customer quotes vs **publish** the customer quotes | 2 items |
| M7-72 | Meera: **book** renewal call vs Lena: **schedule** QBR | 2 items |
| M7-73 | Same task text, different owners (Sam / Karan) | 2 items, never merged |
| M7-74 | Same task, one owner joint (`Anita & Rahul`) and one single (`Anita`) | 2 items (owner keys differ) |
| M7-75 | Same task, owner `Priya Nair` vs `Priya Shah` `[NAME]` | 2 items |
| M7-76 | Same task by `Priya` (ambiguous) and `Priya Nair` `[NAME]` | 2 items (`?priya` ≠ `priya-nair`) |
| M7-77 | `?priya` in 09-17 and `?priya` in 09-30 with the same task | merge only with each other `[NAME]` |
| M7-78 | `?priya` and `?rahul` with the same task | 2 items `[NAME]` |
| M7-79 | Two `unassigned` items with the same text (`Someone to update CRM notes` in two meetings) | merge together `[GAP]` `[DUP]` |
| M7-80 | `unassigned` and `group` with the same text | 2 items `[GAP]` |
| M7-81 | Two `group` items (`Everyone to…`) with same text | merge |
| M7-82 | Borderline pair (0.6 ≤ score < 0.85, same owner) | **not merged**; appears in `uncertain` with score |
| M7-83 | Score below 0.6 | new item; not in `uncertain` |

## G. Status and due-date rules

| ID | Case | Expected |
|---|---|---|
| M7-90 | Any occurrence checked | item `done`, `doneBy = 'notes'` |
| M7-91 | `[x]` then later `[ ]` (synthetic) | stays `done`; flag `reopened-in-notes`; warning `ITEM_REOPENED` |
| M7-92 | `[ ]`, `[ ]`, `[ ]` | `open` |
| M7-93 | `[ ]` then `[x]` then `[x]` | `done`, no warning |
| M7-94 | Latest due date wins | item due is the last occurrence's date |
| M7-95 | New due differs | old due appended to `dueHistory`; order preserved |
| M7-96 | New due equal to old | `dueHistory` unchanged |
| M7-97 | Later occurrence has no due `[GAP]` | decision pinned: keeps the earlier date (a missing date never erases a known one) |
| M7-98 | First occurrence has no due, later has one `[GAP]` | later date becomes current |
| M7-99 | Unresolved due (`null` with raw text) on a later occurrence | previous resolved date kept; raw kept in the occurrence |
| M7-100 | Late status conflicts across the same meeting date | ordering by file name keeps result stable |
| M7-101 | Same line twice in **one file** `[DUP]` | merged, with a warning |

## H. Ordering, undated meetings, parents

| ID | Case | Expected |
|---|---|---|
| M7-110 | Input given in shuffled order | identical output to sorted input (property) |
| M7-111 | Sort key | (meeting date, file name, line) |
| M7-112 | Undated meeting (`untitled.md`) processed **last** `[GAP]` | its items come after dated ones |
| M7-113 | `untitled.md` item with same owner and different wording | not merged into a dated item |
| M7-114 | `untitled.md` item with identical owner and text `[GAP]` | merged (exact match only) |
| M7-115 | Nested candidate | `parentId` = id of the parent line's item (offsite: Karan under Meera) |
| M7-116 | Parent line dropped (empty) | child has no `parentId`, no throw |
| M7-117 | Parent merges into an older item | child's `parentId` follows the merged item's id |
| M7-118 | Child merged across meetings | one child item, parent link kept |

## I. `makeId`

| ID | Case | Expected |
|---|---|---|
| M7-120 | Id format | 6 hex characters |
| M7-121 | Same file and line text, run twice | identical id |
| M7-122 | Status changes `[ ]` → `[x]` | id unchanged |
| M7-123 | Due text changes | id unchanged |
| M7-124 | Owner resolution changes (alias added) | id unchanged |
| M7-125 | Two items with different source file, same text | different ids |
| M7-126 | Forced collision (stub the hash) | id extends to 8 hex; both ids unique |
| M7-127 | Whole fixture folder | all ids unique |
| M7-128 | Merged item's id | derived from its **first** occurrence |
| M7-129 | Whitespace-only differences in the raw line | same id |

## J. Configuration

| ID | Case | Expected |
|---|---|---|
| M7-130 | Default threshold | 0.85 |
| M7-131 | Threshold 0.7 | M7-82's borderline pair now merges; golden cases still hold |
| M7-132 | Threshold 0.95 | M7-32's pair (`the`-less variant) may split; result is predictable and documented |
| M7-133 | Invalid threshold (`1.5`, `-1`, `'x'`) | clear error `[BAD]` |

## K. Fixture integration

| ID | Case | Expected |
|---|---|---|
| M7-140 | Run the full folder twice | identical items and ids (acceptance 14) |
| M7-141 | Shuffle file order | identical items |
| M7-142 | Acceptance 3 | quote-to-Acme item appears once, `done`, 3 occurrences |
| M7-143 | Acceptance 4 | cloud-budget item appears once, `done` |
| M7-144 | Acceptance 5 | wireframes item appears once, due 2026-09-24, with slip history |
| M7-145 | Item count | matches the reviewed snapshot; total number of occurrences equals the candidate count from M3 minus merges |
| M7-146 | No occurrence is lost | `sum(occurrences) = total parsed lines` (property) |
| M7-147 | Blockquoted refund line (09-21) | no item exists for it (ignored upstream) `[DUP]` |
| M7-148 | `uncertain` list | matches snapshot; appears in the report |
| M7-149 | Empty input | `{items:[], uncertain:[], warnings:[]}` `[BAD]` |

## Done when

All golden cases (E, F) pass, ids are identical across runs (M7-140), shuffled order gives the same result (M7-141), and the borderline pair appears in `uncertain` (M7-82).
