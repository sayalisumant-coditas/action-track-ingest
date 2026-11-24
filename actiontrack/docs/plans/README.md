# Module plans

One plan per module of [technical-spec.md](../technical-spec.md). Each plan lives in its own folder as `plan.md`.

| Order | Folder | Module | Build milestone | Depends on |
|---|---|---|---|---|
| 0 | [00-scaffold](00-scaffold/plan.md) | Project setup | 1 | — |
| 1 | [m01-scan-read](m01-scan-read/plan.md) | Scan and read | 2 | scaffold |
| 2 | [m02-meeting-parser](m02-meeting-parser/plan.md) | Meeting header parser | 2 | m01 |
| 3 | [m03-candidate-extractor](m03-candidate-extractor/plan.md) | Candidate extractor | 2 | scaffold |
| 4 | [m04-line-parser](m04-line-parser/plan.md) | Line parser | 2 | m03, m06 (date grammar) |
| 5 | [m06-date-resolution](m06-date-resolution/plan.md) | Date resolution | 3 | scaffold |
| 6 | [m05-people-owner](m05-people-owner/plan.md) | People and owner resolution | 3 | m02 |
| 7 | [m07-dedupe](m07-dedupe/plan.md) | De-duplication and status | 4 | m04, m05, m06 |
| 8 | [m08-store](m08-store/plan.md) | Store and overrides | 4 | m07 |
| 9 | [m09-ingest-orchestrator](m09-ingest-orchestrator/plan.md) | Ingest orchestrator | 4 | m01–m08 |
| 10 | [m10-query](m10-query/plan.md) | Query (list filters, overdue) | 5 | m05, m08 |
| 11 | [m12-cli](m12-cli/plan.md) | CLI (`ingest`, `list`, `done`, then `followup`) | 5–6 | m09, m10, m11 |
| 12 | [m11-followup-gmail](m11-followup-gmail/plan.md) | Follow-up and Gmail drafts | 6–7 | m05, m08, m10 |

Folder numbers follow the module numbers in the technical spec, so the build order differs from the folder order: **m06 before m05**, and **m04 needs the date grammar from m06**.

## Conventions used in every plan

- **Done when** lists what must be true, with tests green, before the module counts as finished.
- Test cases name the real sample files so they can be copied into the fixture folder.
- Dates in examples are worked out from the meeting date in the file (e.g. 2026-09-01 is a Tuesday).
- A task is finished only with its tests. No module is merged without its unit tests.
- Each plan folder also holds a `tests.md` with numbered test cases (e.g. `M7-50`). Cases are tagged with the four brief edge cases: `[DUP]` duplicate items across meetings, `[GAP]` missing owner or date, `[NAME]` two people with the same first name, `[BAD]` malformed notes. `tasks.md` will be built from these.
