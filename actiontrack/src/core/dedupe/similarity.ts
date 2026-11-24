/** Same owner and a score at or above this merges two lines into one item. */
export const DEFAULT_MERGE_THRESHOLD = 0.85;
/** A same-owner pair scoring from here up to the threshold is not merged but reported. */
export const UNCERTAIN_FLOOR = 0.6;
/** Added to the score when one task's words are the start of the other's. */
export const PREFIX_BOOST = 0.1;

const words = (s: string): string[] => s.split(/\s+/).filter((w) => w !== '');

/**
 * Dice coefficient on the word sets of two normalised tasks (word order is ignored), boosted by
 * `PREFIX_BOOST` when the shorter task's words are the beginning of the longer one's. Result 0..1;
 * 0 when either side is empty.
 */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return 0;
  const sa = new Set(wa);
  const sb = new Set(wb);
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  const dice = (2 * shared) / (sa.size + sb.size);
  if (dice === 0) return 0;

  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const isPrefix = short.length < long.length && short.every((w, i) => long[i] === w);
  return Math.min(1, isPrefix ? dice + PREFIX_BOOST : dice);
}
