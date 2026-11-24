import { readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { FolderError } from '../errors.js';

export interface ScanOptions {
  recursive?: boolean;
}

const isMarkdown = (name: string) => name.toLowerCase().endsWith('.md');

/**
 * Sorted absolute paths of `*.md` files (case-insensitive extension) under `dir`.
 * Order is plain string `<` on the posix-style relative path, so it is the same on every OS.
 * Throws FolderError if `dir` is missing, unreadable or not a directory.
 */
export function scanFolder(dir: string, opts: ScanOptions = {}): string[] {
  const root = resolve(dir);
  try {
    if (!statSync(root).isDirectory()) throw new FolderError(dir, 'not a directory');
  } catch (e) {
    if (e instanceof FolderError) throw e;
    throw new FolderError(dir, 'cannot read folder');
  }

  const found: string[] = [];
  const walk = (current: string, isRoot: boolean): void => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      if (isRoot) throw new FolderError(dir, 'cannot read folder');
      return; // unreadable sub-folder: skip it
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isFile()) {
        if (isMarkdown(entry.name)) found.push(full);
      } else if (entry.isDirectory() && opts.recursive) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        walk(full, false);
      }
    }
  };
  walk(root, true);

  const key = (p: string) => relative(root, p).split(sep).join('/');
  return found
    .map((p) => ({ p, k: key(p) }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.p);
}
