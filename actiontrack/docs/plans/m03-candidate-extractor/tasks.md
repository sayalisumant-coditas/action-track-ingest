# Tasks — M3 Candidate extractor

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

## Implementation (from plan.md)

- [x] 1. Line loop with `inFence` and `inHtmlComment` state (one-line and multi-line comments)
- [x] 2. Ignore reasons in order: `comment` → `code` → `blockquote`; record each in `ignored`
- [x] 3. Four line forms: checkbox (`-`, `*`, `+`, numbered), `ACTION:`, table row
- [x] 4. Table handling: header with `Owner` + `Action` (case-insensitive), skip separator row, end at first non-`|` line
- [x] 5. `linkParents` for nested checkboxes (tab = 4 columns)
- [x] 6. Drop empty items and warn `EMPTY_ITEM`
- [x] 7. Unclosed fence → rest is code + `FENCE_UNCLOSED` warning
- [x] 8. Unit tests, then fixture tests
- [x] Unclosed comment handled (rest ignored as `comment`, warning, no throw)

## Tests (from tests.md)

- [x] A. `matchCheckbox` — M3-01 to M3-14
- [x] B. `matchActionLine` — M3-20 to M3-25
- [x] C. Tables (`parseTable`) — M3-30 to M3-44
- [x] D. Ignore rules and state machine — M3-50 to M3-68
- [x] E. Nesting (`linkParents`) — M3-70 to M3-78
- [x] F. Whole-file behaviour (incl. property test M3-87, perf M3-86) — M3-80 to M3-87
- [x] G. Fixture tests + snapshot — M3-90 to M3-101

## Done when

- [x] Sample counts in G are exact (incident-review 4, security-review 4, q4-offsite 9, design-review 5, untitled 2)
- [x] Ignore totals across folder: `blockquote` 1, `code` 1, `comment` 1
- [x] Property test M3-87 passes
