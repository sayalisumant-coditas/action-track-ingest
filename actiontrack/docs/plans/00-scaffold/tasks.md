# Tasks — 00 Scaffold

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

## Implementation (from plan.md)

- [x] 1. `package.json` (`type: module`, Node >= 20, `bin: { actiontrack: dist/cli/index.js }`)
- [x] 2. Install `typescript`, `vitest`, `commander`, `yaml`, `date-fns`, `@modelcontextprotocol/sdk` (later, deferred), `eslint`, `prettier`, `tsx`
- [x] 3. `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `module: NodeNext`, `outDir: dist`
- [x] 4. Create folders from technical spec §3 (`src/core/*`, `src/cli`, `test/`)
- [x] 5. `src/core/types.ts` (spec §4) and `src/core/errors.ts` (`FolderError`, `StoreError`, `AmbiguousOwnerError`, `UnknownIdError`)
- [x] 6. Copy sample folder to `test/fixtures/notes/` untouched; add `test/fixtures/synthetic/`
- [x] 7. npm scripts: `build`, `test`, `lint`, `format`, `dev`
- [x] 8. `warnings.ts` (stable codes + `Warning` type) and `Clock` type
- [x] 9. Smoke test importing `types.ts`
- [x] 10. `.gitignore` (`dist`, `node_modules`, `.actiontrack`) and short README pointing to `docs/`
- [x] Eslint `no-restricted-imports` rule: core never imports `cli/`
- [x] `ISODate` brand + `isISODate(s)` helper
- [x] `test/fixtures/notes.manifest.json` (SHA-256 of each sample file) and exported `copyFixturesToTemp()` helper

## Tests (from tests.md, in `test/unit/scaffold/`)

- [x] A. Build and tooling — S0-01 to S0-07
- [x] B. Types, errors, warnings, clock — S0-10 to S0-18
- [x] C. ISO date helper — S0-20 to S0-25
- [x] D. Architecture guards — S0-30 to S0-32
- [x] E. Fixture folder (36 files, hashes, edge-case sets) — S0-40 to S0-49

## Done when

- [x] `npm test` and `npm run build` succeed on a clean clone
- [x] Fixture folder contains exactly the 36 sample files; S0-40 to S0-47 pass without edits to samples
