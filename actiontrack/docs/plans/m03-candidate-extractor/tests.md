# Tests — M3 Candidate extractor

Plan: [plan.md](plan.md) · File under test: `candidates.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

Unit tests use small inline strings. Fixture tests run the whole file body through `extractCandidates`.

## A. `matchCheckbox`

| ID | Line | Expected |
|---|---|---|
| M3-01 | `- [ ] Priya to send quote` | unchecked, text `Priya to send quote`, indent 0 |
| M3-02 | `- [x] Priya to send quote` | checked |
| M3-03 | `- [X] Karan to approve` | checked (uppercase) |
| M3-04 | `* [ ] Lena to run survey` | unchecked |
| M3-05 | `+ [ ] Sam to cover on-call` | unchecked |
| M3-06 | `-   [ ]  text` (extra spaces) | text trimmed to `text` |
| M3-07 | `1. [ ] numbered item` | candidate (cheap support) |
| M3-08 | `  - [ ] nested` | indent 2 |
| M3-09 | `- [] no space` / `- [  ] two spaces` / `- [y] wrong mark` | no match |
| M3-10 | `-[ ] no space after dash` | no match |
| M3-11 | `- [ ]` (no text) | no candidate; warning `EMPTY_ITEM` `[GAP]` |
| M3-12 | `- [ ]    ` (only spaces) | no candidate; `EMPTY_ITEM` `[GAP]` |
| M3-13 | `- plain bullet without box` | no match (prose is never extracted) |
| M3-14 | Text containing brackets: `- [ ] Fix [urgent] bug` | text keeps `[urgent]` |

## B. `matchActionLine`

| ID | Line | Expected |
|---|---|---|
| M3-20 | `ACTION: Karan to circulate summary by 2026-10-01` | unchecked candidate |
| M3-21 | `action: karan to …` (lowercase) | candidate |
| M3-22 | `  ACTION:   spaced` | text trimmed |
| M3-23 | `ACTION:` with nothing after | none; `EMPTY_ITEM` `[GAP]` |
| M3-24 | `ACTIONS: …`, `Action item: …`, `INACTION: x` | no match |
| M3-25 | `ACTION:` inside a fence | ignored, reason `code` |

## C. Tables (`parseTable`)

| ID | Table | Expected |
|---|---|---|
| M3-30 | Header `Owner \| Action \| Due`, separator, 1 row | 1 candidate with `table.owner`, `table.action`, `table.due` |
| M3-31 | Header in lowercase / mixed case | detected |
| M3-32 | Header `Owner \| Action` (no Due) | candidate with `due` empty `[GAP]` |
| M3-33 | Optional `Status` column | recorded, does not break the mapping |
| M3-34 | Empty owner cell | candidate; owner empty → unassigned later `[GAP]` |
| M3-35 | Empty due cell | candidate; due empty `[GAP]` |
| M3-36 | Empty action cell | row dropped, `EMPTY_ITEM` `[GAP]` |
| M3-37 | Table with 3 rows | 3 candidates, line numbers true to the file |
| M3-38 | Table ends at the first line not starting with `\|` | next paragraph not read as a row |
| M3-39 | Separator variants `\|---\|`, `\| :--- \| ---: \|` | skipped |
| M3-40 | A table with other headers (`Item \| Cost`) | not treated as actions |
| M3-41 | Table row with an escaped pipe `\|` in the text | stays one cell |
| M3-42 | Header row with no body rows | zero candidates, no throw |
| M3-43 | Table inside a blockquote or fence | ignored (`blockquote` / `code`) |
| M3-44 | Table whose row has fewer cells than the header | row read with missing cells empty, no throw `[BAD]` |

## D. Ignore rules and state machine

| ID | Input | Expected |
|---|---|---|
| M3-50 | `> - [ ] Karan to refund by Friday` | ignored, `blockquote` |
| M3-51 | `  > - [ ] x` (indented quote) | ignored, `blockquote` |
| M3-52 | `> > - [ ] x` (nested quote) | ignored |
| M3-53 | `> - [ ] x` then a normal checkbox on the next line | only the second is a candidate |
| M3-54 | Fence with three backticks around `- [ ] Owner to remediate` | ignored, `code` |
| M3-55 | Fence with `~~~` | ignored, `code` |
| M3-56 | Fence with a language tag (```` ```md ````) | ignored |
| M3-57 | Checkbox **after** the fence closes | candidate |
| M3-58 | Fence opened with ``` and a `~~~` line inside | the `~~~` does not close it |
| M3-59 | One-line HTML comment `<!-- - [ ] Sam to buy tokens -->` | ignored, `comment` |
| M3-60 | Multi-line comment, checkbox on the middle line | ignored, `comment` |
| M3-61 | Checkbox on the same line **after** `-->` closes | candidate |
| M3-62 | Comment opens inside a fence | stays code; no state leak after the fence closes |
| M3-63 | Fence opens inside a comment | stays comment |
| M3-64 | Unclosed fence | rest of file treated as code; warning `FENCE_UNCLOSED`; candidates before it kept `[BAD]` |
| M3-65 | Unclosed comment (`<!--` never closed) | rest ignored as `comment`; warning; no throw `[BAD]` |
| M3-66 | Checkbox inside a list inside a blockquote | ignored |
| M3-67 | Priority: line inside both fence and quote | one ignore reason recorded (comment, then code, then blockquote) |
| M3-68 | Every ignored line | recorded once in `ignored` with `{line, why}` |

## E. Nesting (`linkParents`)

| ID | Input | Expected |
|---|---|---|
| M3-70 | Parent at indent 0, child at indent 2 | child `parentLine` = parent's line |
| M3-71 | Two children under one parent | both point at the parent |
| M3-72 | Grandchild (indent 4) | points at the child, not the root |
| M3-73 | Child then a sibling at indent 0 | sibling has no parent |
| M3-74 | Tab indent | a tab counts as 4 columns |
| M3-75 | Child under a **non-checkbox** bullet | no parent |
| M3-76 | Indent jumps back to a level that has no parent | no parent, no throw |
| M3-77 | Indented checkbox with no parent before it | no parent `[GAP]` |
| M3-78 | Parent in a different section (separated by a heading) | link still made only if directly preceding; test pins behaviour |

## F. Whole-file behaviour

| ID | Case | Expected |
|---|---|---|
| M3-80 | `lineOffset = 5` | all reported line numbers shifted by 5 |
| M3-81 | Empty body | `{candidates:[], ignored:[], warnings:[]}` `[BAD]` |
| M3-82 | Body with only prose | zero candidates |
| M3-83 | Action items under `## Morning`, `## Afternoon`, `## Action items` | all found (section does not matter) |
| M3-84 | Same checkbox text twice in one file | two candidates (merging is M7's job) `[DUP]` |
| M3-85 | Windows `\r` leftovers | handled (M1 removes them; extractor does not fail if present) |
| M3-86 | 5,000-line body | finishes under 200 ms |
| M3-87 | Property: 200 random strings | never throws; every candidate's `line` is within range `[BAD]` |

## G. Fixture tests

| ID | File | Expected |
|---|---|---|
| M3-90 | 2026-09-21-incident-review | **4** candidates; the blockquoted Karan refund line is in `ignored` as `blockquote` |
| M3-91 | 2026-10-09-security-review | **4** candidates; fenced `Owner to remediate` ignored as `code`; `<!-- … hardware tokens … -->` ignored as `comment` |
| M3-92 | 2026-09-30-q4-offsite | **9** candidates in order: Meera (`-`), Karan nested (parent = Meera's line), Lena (`*`), Sam (`+`), Priya hiring, Rahul architecture, Everyone Q4 goals, Anita table row, Karan `ACTION:` `[NAME]` |
| M3-93 | 2026-10-02-finance-sync | `[X]` checked; `*` and `+` bullets read |
| M3-94 | 2026-09-18-design-review | **5** candidates; "Everybody should look at the prototype" absent; includes `TBD`, `@anita:`, joint owner `[GAP]` |
| M3-95 | 2026-09-10-acme-renewal-prep | the `Someone to…` item is a candidate `[GAP]` |
| M3-96 | untitled.md | **2** candidates though no header exists `[GAP]` |
| M3-97 | Quote-portal files (09-01, 09-08, 09-15, 09-22) | each yields its candidates; repeated lines are all present `[DUP]` |
| M3-98 | 2026-09-30-q4-offsite parking-lot section | contributes zero candidates |
| M3-99 | Whole folder (33 readable files) | ignored totals: `blockquote` 1, `code` 1, `comment` 1 |
| M3-100 | No exceptions on any of the 33 files | pass `[BAD]` |
| M3-101 | Snapshot of all candidates | matches reviewed snapshot |

## Done when

Sample counts in G are exact, the three ignore reasons are reported once each, and the property test M3-87 passes.
