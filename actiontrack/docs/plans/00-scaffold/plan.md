# Plan 00 — Project scaffold

**Goal**: an empty but working TypeScript project that every module plugs into.
**Milestone**: 1 · **Depends on**: nothing

## Tasks

1. Create `package.json` (`type: module`, Node >= 20, `bin: { actiontrack: dist/cli/index.js }`).
2. Install: `typescript`, `vitest`, `commander`, `yaml`, `date-fns`, `@modelcontextprotocol/sdk` (later), `eslint`, `prettier`, `tsx`.
3. `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, `module: NodeNext`, `outDir: dist`.
4. Create the folders from the technical spec §3 (`src/core/*`, `src/cli`, `test/`).
5. Write `src/core/types.ts` from technical spec §4 (all shared types) and `src/core/errors.ts` (`FolderError`, `StoreError`, `AmbiguousOwnerError`, `UnknownIdError`).
6. Copy the sample folder to `test/fixtures/notes/` untouched. Add `test/fixtures/synthetic/` for small hand-made cases.
7. Add npm scripts: `build`, `test`, `lint`, `format`, `dev` (tsx).
8. Add a `warnings.ts` with the stable warning codes and a `Warning` type, and a tiny `Clock` type (`() => Date`) so nothing calls `Date.now()` directly.
9. One smoke test: imports `types.ts` and passes.
10. Add `.gitignore` (`dist`, `node_modules`, `.actiontrack`) and a short README pointing to `docs/`.

## Design notes

- Core never imports from `cli/`. Enforce with an eslint `no-restricted-imports` rule.
- All dates in code are `YYYY-MM-DD` strings; add a branded `ISODate` helper `isISODate(s)`.

## Done when

- `npm test` and `npm run build` both succeed on a clean clone.
- The fixture folder contains exactly the 36 sample files.
