import { splitTaskDue } from '../parse/line.js';

/** Words dropped from a task before comparing (articles, prepositions-of-purpose, possessives). */
const FILLER = new Set(['the', 'a', 'an', 'to', 'our', 'their', 'my', 'your', 'his', 'her', 'its']);

/**
 * Light stemming: `finalize` and `finalise` agree, and `update`, `updated`, `updating` share one
 * stem. Applied until nothing changes so that normalising twice gives the same text.
 */
export function stemWord(word: string): string {
  let w = word;
  for (;;) {
    let n = w.replace(/iz(e|es|ed|ing)$/, 'is$1');
    if (n.length > 5 && n.endsWith('ing')) n = n.slice(0, -3);
    else if (n.length > 4 && n.endsWith('ed')) n = n.slice(0, -2);
    else if (n.length > 3 && n.endsWith('s') && !n.endsWith('ss')) n = n.slice(0, -1);
    if (n.length > 3 && n.endsWith('e')) n = n.slice(0, -1);
    if (n === w) return w;
    w = n;
  }
}

function once(task: string): string {
  let s = task;
  try {
    s = splitTaskDue(s).task; // a due clause the line parser missed
  } catch {
    /* keep s */
  }
  const words = s
    .toLowerCase()
    .replace(/['’‘`"“”]/g, '')
    .replace(/[^\p{L}\p{N}%\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && !FILLER.has(w));
  // only the leading verb is stemmed, so nouns and adjectives stay readable (`revised quote`)
  if (words.length > 0) words[0] = stemWord(words[0] as string);
  return words.join(' ');
}

/**
 * Comparable form of a task: lower-case, no punctuation (but `%` and digits stay), no articles or
 * filler words, no trailing due clause, a stemmed leading verb, single spaces. Never throws; idempotent.
 */
export function normaliseTask(task: string): string {
  let cur = typeof task === 'string' ? task : '';
  for (;;) {
    const next = once(cur);
    if (next === cur) return cur;
    cur = next;
  }
}
