# Tasks — M1 Scan and read

Plan: [plan.md](plan.md) · Tests: [tests.md](tests.md) · Mark `[x]` when done.

## Implementation (from plan.md)

- [x] 1. `scanFolder`: `fs.readdir`, filter `.md` (case-insensitive), sort by plain string `<`
- [x] 2. `--recursive` depth-first walk; skip `node_modules` and dot-folders
- [x] 3. `looksBinary(buf)` (NUL byte, or >1% U+FFFD/control chars in first 4096 bytes)
- [x] 4. `readNote`: empty check → binary check → UTF-8 decode → strip BOM → normalise `\r\n` / `\r` to `\n`
- [x] 5. Wrap all file I/O in try/catch; map permission/I/O errors to `unreadable`
- [x] 6. Unit tests with synthetic temp-dir files
- [x] 7. Integration test against `test/fixtures/notes`
- [x] Edge cases handled: 0-byte file, PNG in `.md`, `.txt` excluded, blank-only file, Latin-1 text, directory named `x.md`

## Tests (from tests.md)

- [x] A. `scanFolder` unit tests — M1-01 to M1-15
- [x] B. `looksBinary` unit tests — M1-20 to M1-30
- [x] C. `readNote` unit tests (incl. property test M1-57) — M1-40 to M1-57
- [x] D. Integration on sample folder (35 paths, 33 ok, 2 fail) — M1-60 to M1-69

## Done when

- [x] All rows pass
- [x] No input file can make `readNote` throw (M1-57)
