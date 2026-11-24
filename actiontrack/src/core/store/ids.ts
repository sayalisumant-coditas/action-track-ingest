import { createHash } from 'node:crypto';
import { splitTaskDue } from '../parse/line.js';
import { isDatePhrase } from '../dates/resolveDue.js';

export type HashFn = (text: string) => string;

export const sha1Hex: HashFn = (text) => createHash('sha1').update(text).digest('hex');

const MARKER = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*/;

/**
 * The raw line without what changes between meetings: list marker, checkbox state, due clause
 * (or the date cell of a table row), case and spacing. Owner resolution is not involved.
 */
export function idText(rawLine: string): string {
  let s = (rawLine ?? '').replace(MARKER, '').replace(/\s+/g, ' ').trim();
  if (s.startsWith('|')) {
    s = s
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '' && !isDatePhrase(c))
      .join(' | ');
  } else {
    s = splitTaskDue(s).task;
  }
  return s.toLowerCase();
}

/**
 * Item id from the first occurrence: first 6 hex of SHA-1 over `sourceFile` + cleaned raw line.
 * When `taken` already holds that id it is extended (8, 10, … hex) until it is free.
 */
export function makeId(
  first: { sourceFile: string; rawLine: string },
  taken: ReadonlySet<string> = new Set(),
  hash: HashFn = sha1Hex,
): string {
  const digest = hash(`${first.sourceFile}\n${idText(first.rawLine)}`);
  for (let len = 6; len < digest.length; len += 2) {
    const id = digest.slice(0, len);
    if (!taken.has(id)) return id;
  }
  let n = 2;
  while (taken.has(`${digest}-${n}`)) n++;
  return `${digest}-${n}`;
}
