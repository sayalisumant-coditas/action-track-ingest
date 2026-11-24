# Tests — M1 Scan and read

Plan: [plan.md](plan.md) · Files under test: `scanFolder.ts`, `readNote.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

Unit tests write synthetic files to a temp dir (`mkdtemp`); integration tests read `test/fixtures/notes`.

## A. `scanFolder` unit tests

| ID | Setup | Expected |
|---|---|---|
| M1-01 | Folder with `a.md`, `b.md` | both returned, absolute paths |
| M1-02 | Folder with `a.md`, `b.txt`, `c.markdown`, `d.MD` | `a.md` and `d.MD` only (case-insensitive `.md`) `[BAD]` |
| M1-03 | Files created in order `c.md`, `a.md`, `b.md` | returned `a, b, c` (sorted) |
| M1-04 | Names `B.md`, `a.md`, `_x.md`, `10.md`, `2.md` | order follows plain string `<` (`10.md, 2.md, B.md, _x.md, a.md`), same on every OS |
| M1-05 | Empty folder | `[]`, no throw |
| M1-06 | Folder with only `.txt` files | `[]` |
| M1-07 | A **directory** named `x.md` | not returned `[BAD]` |
| M1-08 | Sub-folder `sub/n.md`, `recursive: false` | `sub/n.md` not returned |
| M1-09 | Same, `recursive: true` | `sub/n.md` returned |
| M1-10 | `recursive: true` with `node_modules/z.md` and `.git/y.md` | both skipped |
| M1-11 | Recursive, 3 levels deep | depth-first, final list still sorted |
| M1-12 | Path that does not exist | throws `FolderError`; message contains the path |
| M1-13 | Path is a file, not a folder | throws `FolderError` |
| M1-14 | Folder name with spaces and non-ASCII characters | works |
| M1-15 | Called twice | identical output (determinism) |

## B. `looksBinary` unit tests

| ID | Buffer | Expected |
|---|---|---|
| M1-20 | Plain ASCII text | false |
| M1-21 | UTF-8 text with accents and emoji | false |
| M1-22 | PNG header `89 50 4E 47 0D 0A 1A 0A 00 …` | true |
| M1-23 | Text with one NUL byte at position 2000 | true |
| M1-24 | 4096 bytes where exactly 1% (41 bytes) are U+FFFD | false (limit is *more than* 1%) |
| M1-25 | Same with 42 bytes | true |
| M1-26 | Text full of `\t \n \r` | false (excluded from control chars) |
| M1-27 | Text with 5% control chars like `\x01` | true |
| M1-28 | 10-byte buffer | decided on the bytes present, no out-of-range read |
| M1-29 | Only the **first 4096 bytes** are checked | text file with binary junk after byte 5000 is treated as text |
| M1-30 | UTF-16 file with BOM (contains NUL bytes) | true (documented limitation: UTF-16 not supported) |

## C. `readNote` unit tests

| ID | Setup | Expected |
|---|---|---|
| M1-40 | 0-byte file | `{ok:false, reason:'empty'}` `[BAD]` |
| M1-41 | Only spaces and newlines | `empty` `[BAD]` |
| M1-42 | Only a BOM (`EF BB BF`) | `empty` |
| M1-43 | PNG bytes in a `.md` file | `binary` `[BAD]` |
| M1-44 | Random 2 KB of bytes (seeded) | `binary`, no throw |
| M1-45 | Normal text | `{ok:true, text}` equal to file content |
| M1-46 | Text with BOM | `ok`, text does not start with U+FEFF |
| M1-47 | CRLF line endings | text contains no `\r` |
| M1-48 | Lone `\r` line endings (old Mac) | converted to `\n` |
| M1-49 | Mixed `\r\n`, `\n`, `\r` | all become `\n`; line count is preserved |
| M1-50 | Latin-1 bytes (`caf\xE9`) | `ok:true` with replacement char (under the 1% limit) |
| M1-51 | Latin-1 file with more than 1% bad bytes | `binary` |
| M1-52 | File deleted between scan and read | `unreadable`, no throw |
| M1-53 | Path is a directory | `unreadable`, no throw |
| M1-54 | No read permission (skip on Windows, or mock `fs`) | `unreadable` |
| M1-55 | Very large text file (5 MB) | `ok`, finishes in under 1 s |
| M1-56 | Tab characters and trailing spaces | preserved (needed for nesting in M3) |
| M1-57 | Property test: 200 random byte buffers | `readNote` never throws; result is always `ok:true` or one of the 3 reasons `[BAD]` |

## D. Integration on the sample folder

| ID | Case | Expected |
|---|---|---|
| M1-60 | `scanFolder(fixtures/notes)` | **35** paths |
| M1-61 | `.txt` check | `2026-09-19-offsite-draft.txt` is not in the list |
| M1-62 | `readNote` on all 35 | exactly 33 `ok`, 2 fail |
| M1-63 | Failing files | `2026-09-09-notes-final-v2.md` → `empty`; `scratch.md` → `binary` `[BAD]` |
| M1-64 | `untitled.md` | `ok:true` (no header is not a read failure) `[GAP]` |
| M1-65 | Same-name files (09-17, 09-30 offsite, 10-07, 09-23) | all `ok` `[NAME]` |
| M1-66 | Duplicate-heavy quote-portal files | all `ok`, listed in date order `[DUP]` |
| M1-67 | YAML files (09-16, 09-30 standup) | `ok`; text still starts with `---` |
| M1-68 | Order of the 35 paths | matches a snapshot (so M7's date/file ordering is stable) |
| M1-69 | Missing folder from CLI-style input | `FolderError` naming the path |

## Done when

All rows pass, and the property test M1-57 shows that no input can make `readNote` throw.
