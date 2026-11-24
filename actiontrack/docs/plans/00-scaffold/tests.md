# Tests — 00 Scaffold

Plan: [plan.md](plan.md) · Runner: `vitest` · Location: `test/unit/scaffold/`

**Edge-case tags** used in every tests.md: `[DUP]` duplicates across meetings · `[GAP]` missing owner or date · `[NAME]` same first name · `[BAD]` malformed notes.

The scaffold has little logic. Its tests make sure the foundation the other modules rely on is correct, **above all the fixture folder**, because every later test names real sample files.

## A. Build and tooling

| ID | Case | Expected |
|---|---|---|
| S0-01 | `npm test` on a clean clone | exits 0; at least the smoke test runs |
| S0-02 | `npm run build` | exits 0; `dist/cli/index.js` exists |
| S0-03 | `npm run lint` and `npm run format -- --check` | exit 0 on the empty project |
| S0-04 | `package.json` | `type = module`; `engines.node` is `>=20`; `bin.actiontrack = dist/cli/index.js` |
| S0-05 | `tsconfig.json` | `strict`, `noUncheckedIndexedAccess` true; `module = NodeNext`; `outDir = dist` |
| S0-06 | `.gitignore` | contains `dist`, `node_modules`, `.actiontrack` |
| S0-07 | Folder layout | every folder in technical-spec §3 exists (`src/core/{scan,parse,people,dates,dedupe,store,query,followup}`, `src/cli`, `test/{unit,integration,snapshots,fixtures}`) |

## B. Shared types, errors, warnings, clock

| ID | Case | Expected |
|---|---|---|
| S0-10 | Smoke: import `types.ts` | passes; compiles with `tsc --noEmit` |
| S0-11 | Type shape check (compile-time, `expectTypeOf`) | `ActionItem` has `occurrences`, `dueHistory`, `parentId?`, `flags`; `OwnerRef.kind` is the four-value union; `DueRef.reason` allows `unresolvable`, `no-meeting-date`, `weekday-mismatch` |
| S0-12 | `IngestReport` shape | has `skipped[].reason` values `empty`, `binary`, `unreadable`, `no-actions` `[BAD]` |
| S0-13 | Errors | `FolderError`, `StoreError`, `AmbiguousOwnerError`, `UnknownIdError` are `instanceof Error`, keep their own `name`, and can be told apart with `instanceof` |
| S0-14 | `AmbiguousOwnerError` | carries `candidates` (array of person names) `[NAME]` |
| S0-15 | `FolderError` message | contains the folder path it was given |
| S0-16 | Warning codes | `warnings.ts` exports every code used in the plans: `DATE_INFERRED`, `DATE_MISMATCH_FILENAME`, `DATE_WEEKDAY_MISMATCH`, `DUE_UNRESOLVABLE`, `DUE_WEEKDAY_MISMATCH`, `OWNER_AMBIGUOUS`, `OWNER_UNKNOWN`, `OWNER_NOT_ATTENDEE`, `ITEM_REOPENED`, `FENCE_UNCLOSED`, `EMPTY_ITEM`, `MISSING_EMAIL` |
| S0-17 | Warning codes are unique | no duplicate string values |
| S0-18 | `Clock` | `const c: Clock = () => new Date(0)` compiles; `c().toISOString()` is `1970-01-01T00:00:00.000Z` |

## C. ISO date helper

| ID | Input to `isISODate` | Expected |
|---|---|---|
| S0-20 | `2026-09-08` | true |
| S0-21 | `2024-02-29` (leap day) | true |
| S0-22 | `2026-02-29` | false (not a leap year) |
| S0-23 | `2026-13-01`, `2026-00-10`, `2026-09-31` | false |
| S0-24 | `2026-9-8`, `08/09/2026`, `9 September 2026` | false (only `YYYY-MM-DD`) `[GAP]` |
| S0-25 | `''`, `null`, `undefined`, `sometime last week` | false, never throws `[GAP]` |

## D. Architecture guards

| ID | Case | Expected |
|---|---|---|
| S0-30 | Create a temp file under `src/core/` that imports from `src/cli/`, run eslint | lint **fails** with `no-restricted-imports` |
| S0-31 | Grep `src/core/**` for `Date.now(` and `new Date()` with no arguments | no hits outside the clock helper (NFR-3) |
| S0-32 | Grep `src/**` for `.send(` / `sendMessage` / `messages.send` | no hits (NFR-5 early guard, repeated in M11) |

## E. Fixture folder (the test corpus)

This is the most important section. A broken fixture folder would corrupt every later test.

| ID | Case | Expected |
|---|---|---|
| S0-40 | File count in `test/fixtures/notes/` | exactly **36** files |
| S0-41 | Extension split | 35 `.md` + 1 `.txt` (`2026-09-19-offsite-draft.txt`) |
| S0-42 | Fixtures are untouched | SHA-256 of each file equals the hash in `test/fixtures/notes.manifest.json` (written once from the original sample) |
| S0-43 | Malformed set is present `[BAD]` | `2026-09-09-notes-final-v2.md` is 0 bytes; `scratch.md` starts with PNG signature `89 50 4E 47`; `untitled.md` exists with no `Meeting:` header |
| S0-44 | Duplicate-heavy set is present `[DUP]` | the quote-portal files for 09-01, 09-08, 09-15, 09-22, 10-01, 10-06, 10-13 all exist |
| S0-45 | Same-name set is present `[NAME]` | `2026-09-17-billing-migration-sync.md`, `2026-09-30-q4-offsite.md`, `2026-10-07-standup.md`, `2026-09-23-standup.md` exist |
| S0-46 | Missing owner/date set is present `[GAP]` | `2026-09-10-acme-renewal-prep.md` (Someone), `2026-09-18-design-review.md` (TBD), `2026-10-03-sales-pipeline.md` (bad date) exist |
| S0-47 | Every name in Appendix A of requirements.md maps to a file | script compares the appendix list to the folder; no missing, no extra |
| S0-48 | `test/fixtures/synthetic/` | exists and is empty or holds only small hand-made `.md` files |
| S0-49 | Fixtures are read-only in tests | a helper `copyFixturesToTemp()` is exported, so no test writes into `test/fixtures/` |

## Done when

All rows pass on a clean clone, and S0-40 to S0-47 pass without edits to the sample files.
