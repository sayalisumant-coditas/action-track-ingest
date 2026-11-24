# Plan M3 — Candidate extractor

**Goal**: find every line that is a real action item, and reject the lines that only look like one.
**Requirements**: I10–I16, R8 · **Milestone**: 2 · **Depends on**: scaffold (works on plain text)
**Files**: `src/core/parse/candidates.ts`

## Approach

A single pass over the lines with a small state machine. State: `inFence` (opened and closed by a line starting with ``` or ~~~) and `inHtmlComment` (opened by `<!--`, closed by `-->`, can span lines). Regex over the whole file is not used, because it cannot tell a code block from a real list.

## Functions

| Function | Behaviour |
|---|---|
| `extractCandidates(body, lineOffset)` | Returns `{candidates, ignored, warnings}`. |
| `matchCheckbox(line)` | `^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$` → `{indent, checked, text}`. |
| `matchActionLine(line)` | `^\s*ACTION:\s*(.+)$` (case-insensitive) → unchecked item. |
| `parseTable(lines, startIdx)` | Detects a header row containing `Owner` and `Action` (optional `Due`/`Status`), skips the separator row, returns rows until the table ends. |
| `linkParents(candidates)` | A checkbox indented deeper than the previous checkbox gets `parentLine`. |

Candidate shape: `{line, rawLine, checked, text, indent, parentLine?, table?: {owner, action, due}}`.

## Tasks

1. Build the line loop with the two state flags. Handle `<!-- ... -->` on one line as well as multi-line.
2. Before any matching, decide ignore reasons in this order: inside comment → `comment`; inside fence → `code`; line starts with `>` (after optional spaces) → `blockquote`. Record each ignored checkbox-looking line in `ignored` with its reason.
3. Implement the four line forms (checkbox with three bullet characters, `ACTION:`, table row).
4. Table handling: a row starts with `|`; header detection is case-insensitive; the `|---|` row is skipped; the table ends at the first non-`|` line.
5. Parent linking for nested checkboxes (indent compared in columns; a tab counts as 4).
6. Drop empty items (`- [ ]` with no text) and warn `EMPTY_ITEM`.
7. Unclosed fence: treat the rest of the file as code and warn `FENCE_UNCLOSED`.
8. Tests (unit with small strings, then fixtures).

## Sample cases (must pass)

| File | Expected |
|---|---|
| 2026-09-21-incident-review | 4 candidates; the `> - [ ] Karan to refund … by Friday` line is **ignored** (blockquote) |
| 2026-10-09-security-review | 4 candidates; the fenced `- [ ] Owner to remediate…` is ignored (code); the `<!-- - [ ] Sam to buy hardware tokens… -->` is ignored (comment) |
| 2026-09-30-q4-offsite | 9 candidates: Meera (`-`), Karan nested (`  -`, parent = Meera's line), Lena (`*`), Sam (`+`), Priya hiring, Rahul architecture, Everyone Q4 goals, table row Anita, `ACTION:` Karan |
| 2026-10-02-finance-sync | `[X]` read as checked; `*` and `+` bullets read |
| 2026-09-18-design-review | 5 candidates; prose "Everybody should look at the prototype" is not extracted |
| 2026-09-19-offsite-draft.txt | never reaches this module |
| untitled.md | 2 candidates, no header present |

## Edge cases

- Checkbox with uppercase `[X]`; with extra spaces `-   [ ]  text`.
- Numbered list `1. [ ] text` (not in the sample; support it, cheap).
- Table with an empty owner cell → owner unassigned, still a candidate.
- Checkbox inside a nested blockquote or list inside a blockquote → ignored.
- `ACTION:` line inside a fenced block → ignored.

## Done when

The sample counts above are exact, and the ignore reasons are reported (`blockquote` ×1, `code` ×1, `comment` ×1 across the folder).
