import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FolderError } from '../../../src/core/errors.js';
import { scanFolder } from '../../../src/core/scan/scanFolder.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'at-scan-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const touch = (...parts: string[]) => {
  const p = join(dir, ...parts);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, 'x');
};
const names = (paths: string[]) => paths.map((p) => relative(dir, p).replaceAll('\\', '/'));

describe('A. scanFolder', () => {
  it('M1-01 returns absolute paths', () => {
    touch('a.md');
    touch('b.md');
    const r = scanFolder(dir);
    expect(r.map((p) => basename(p))).toEqual(['a.md', 'b.md']);
    expect(r.every((p) => isAbsolute(p))).toBe(true);
  });

  it('M1-02 only .md, case-insensitive [BAD]', () => {
    for (const f of ['a.md', 'b.txt', 'c.markdown', 'd.MD']) touch(f);
    expect(names(scanFolder(dir))).toEqual(['a.md', 'd.MD']);
  });

  it('M1-03 sorted regardless of creation order', () => {
    for (const f of ['c.md', 'a.md', 'b.md']) touch(f);
    expect(names(scanFolder(dir))).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('M1-04 plain string order', () => {
    for (const f of ['B.md', 'a.md', '_x.md', '10.md', '2.md']) touch(f);
    expect(names(scanFolder(dir))).toEqual(['10.md', '2.md', 'B.md', '_x.md', 'a.md']);
  });

  it('M1-05 empty folder', () => expect(scanFolder(dir)).toEqual([]));

  it('M1-06 only .txt files', () => {
    touch('a.txt');
    touch('b.txt');
    expect(scanFolder(dir)).toEqual([]);
  });

  it('M1-07 directory named x.md is not returned [BAD]', () => {
    mkdirSync(join(dir, 'x.md'));
    touch('real.md');
    expect(names(scanFolder(dir))).toEqual(['real.md']);
    expect(names(scanFolder(dir, { recursive: true }))).toEqual(['real.md']);
  });

  it('M1-08 sub-folder ignored when not recursive', () => {
    touch('sub', 'n.md');
    expect(scanFolder(dir, { recursive: false })).toEqual([]);
  });

  it('M1-09 sub-folder included when recursive', () => {
    touch('sub', 'n.md');
    expect(names(scanFolder(dir, { recursive: true }))).toEqual(['sub/n.md']);
  });

  it('M1-10 node_modules and dot-folders skipped', () => {
    touch('node_modules', 'z.md');
    touch('.git', 'y.md');
    touch('ok.md');
    expect(names(scanFolder(dir, { recursive: true }))).toEqual(['ok.md']);
  });

  it('M1-11 three levels deep, still sorted', () => {
    touch('z.md');
    touch('a', 'b', 'c', 'deep.md');
    touch('a', 'mid.md');
    touch('a', 'b', 'low.md');
    expect(names(scanFolder(dir, { recursive: true }))).toEqual([
      'a/b/c/deep.md',
      'a/b/low.md',
      'a/mid.md',
      'z.md',
    ]);
  });

  it('M1-12 missing path throws FolderError naming it', () => {
    const missing = join(dir, 'nope');
    expect(() => scanFolder(missing)).toThrow(FolderError);
    expect(() => scanFolder(missing)).toThrow(missing);
  });

  it('M1-13 a file path throws FolderError', () => {
    touch('f.md');
    expect(() => scanFolder(join(dir, 'f.md'))).toThrow(FolderError);
  });

  it('M1-14 spaces and non-ASCII in folder name', () => {
    const odd = join(dir, 'réunions été 2026');
    mkdirSync(odd);
    writeFileSync(join(odd, 'n.md'), 'x');
    expect(scanFolder(odd).map((p) => basename(p))).toEqual(['n.md']);
  });

  it('M1-15 deterministic', () => {
    for (const f of ['c.md', 'a.md', 'b.md']) touch(f);
    expect(scanFolder(dir)).toEqual(scanFolder(dir));
  });
});
