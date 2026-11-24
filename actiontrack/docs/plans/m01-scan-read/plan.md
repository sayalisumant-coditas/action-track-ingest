# Plan M1 — Scan and read

**Goal**: list the `.md` files in a folder and safely read each one, rejecting empty and binary files without crashing.
**Requirements**: F-ING-1, F-ING-3, I7, I8, I9, NFR-1 · **Milestone**: 2 · **Depends on**: scaffold
**Files**: `src/core/scan/scanFolder.ts`, `src/core/scan/readNote.ts`

## Functions

| Function | Behaviour |
|---|---|
| `scanFolder(dir, {recursive})` | Returns sorted absolute paths of `*.md` (case-insensitive). Throws `FolderError` if `dir` is missing or not a directory. |
| `readNote(path)` | Returns `{ok:true, text}` or `{ok:false, reason: 'empty' \| 'binary' \| 'unreadable'}`. |
| `looksBinary(buf)` | True if a NUL byte exists, or more than 1% of the first 4096 bytes decode to U+FFFD or control chars (excluding `\t \n \r`). |

## Tasks

1. Implement `scanFolder` with `fs.readdir`; filter by extension; sort with a locale-independent comparison (plain string `<`) so the order is the same on every OS.
2. Implement `--recursive` with a simple depth-first walk; skip `node_modules` and dot-folders.
3. Implement `looksBinary` on a `Buffer`.
4. Implement `readNote`: read bytes → empty check (zero bytes, or whitespace only after decoding) → binary check → decode UTF-8 → strip BOM → normalise `\r\n` and lone `\r` to `\n`.
5. Wrap all file I/O in try/catch; map permission and I/O errors to `unreadable`.
6. Unit tests with synthetic files written to a temp dir.
7. Integration test against `test/fixtures/notes`.

## Edge cases

- `2026-09-09-notes-final-v2.md` is 0 bytes → `empty`.
- `scratch.md` has PNG bytes → `binary`.
- `2026-09-19-offsite-draft.txt` is not returned by `scanFolder`.
- A file containing only blank lines → `empty`.
- Latin-1 text (invalid UTF-8) → decoded with replacement chars; counts as text unless over the 1% limit.
- A directory named `x.md` → skipped, not read.

## Tests

- Sample folder: `scanFolder` returns **35** paths (36 files minus the `.txt`).
- Of those 35, `readNote` fails for exactly 2 (empty, binary); 33 succeed.
- CRLF input produces text with no `\r`.
- Missing folder throws `FolderError` with a message that names the path.

## Done when

All the above pass and no input file can make `readNote` throw.
