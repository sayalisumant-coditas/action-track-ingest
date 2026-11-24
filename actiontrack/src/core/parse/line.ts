import { isDatePhrase } from '../dates/resolveDue.js';
import { matchPhrase, normalisePhrase } from '../dates/grammar.js';
import { WarningCode, type WarningInfo } from '../warnings.js';
import type { Candidate } from './candidates.js';
import { matchOwner } from './ownerGrammar.js';

export { displayOwner } from './ownerGrammar.js';

export interface ParsedLine {
  /** Owner text as written (no `@`); `''` when the line names no owner. */
  ownerRaw: string;
  /** Text of a `(with X)` part, kept raw for M5. */
  helperRaw?: string;
  /** The task wording, trimmed and whitespace-collapsed, otherwise untouched. Empty = drop it. */
  task: string;
  /** Due text cut from the line, for M6 to resolve; null if there was none. */
  dueRaw: string | null;
  candidate: Candidate;
  warnings: WarningInfo[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Split `owner to task`. No owner pattern: `ownerRaw = ''` and the whole text is the task. */
export function splitOwnerTask(text: string): {
  ownerRaw: string;
  helperRaw?: string;
  task: string;
} {
  const m = matchOwner(text);
  return m ?? { ownerRaw: '', task: clean(text) };
}

// ---- due clause -------------------------------------------------------------------------

/** Keywords that introduce a due clause on their own, or only before a full date. */
const STRONG = new Set(['by', 'before', 'due', 'until']);
const FULL_DATE_ONLY = new Set(['for', 'on']);

/** Words after `by` that mark an (unreadable) time phrase, e.g. `by the end of the cutover`. */
const TEMPORAL_START = /^(?:the\s+)?(?:end of|start of|beginning of|next|this)\b/i;

/** Words that label a due clause (`, results due …`, `— proposal by …`) and go with it; only after a comma or dash. */
const LABEL = /\s*[,;—–-]\s*(?:results?|proposal|draft|deadline|target|deliverable)\s*$/i;

const TRAILING_PUNCT = /[\s.,;:!?]+$/;
const SEPARATORS = /[\s,;—–-]+$/;

/** A full date: ISO, or day + month (optionally with weekday and year). */
function isFullDate(s: string): boolean {
  const p = matchPhrase(normalisePhrase(s));
  return p !== null && (p.rule === 'iso' || p.rule === 'absolute');
}

function cut(before: string, dueRaw: string): { task: string; dueRaw: string } {
  let task = before;
  const labelled = LABEL.exec(task);
  if (labelled) task = task.slice(0, labelled.index);
  return { task: task.replace(SEPARATORS, '').trim(), dueRaw };
}

/**
 * Cut a trailing due clause off a task. Only phrases of the M6 date grammar are cut, so
 * `by 10%`, `standby`, `before the next review` and `by Friday please` stay in the task.
 *
 *  - `by|before|due|until <date phrase>` at the end
 *  - `by the end of …` / `by next …` (unreadable but clearly a time phrase): cut with its `by`,
 *    for M6 to flag as unresolvable
 *  - `for|on <full date>` (`for Saturday 10 Oct`); a bare weekday after `for` is not a due
 *  - a bare trailing `EOD`, `tomorrow`, `today`
 *  - `by <date> — comment`: the date is the due, the comment stays in the task
 */
export function splitTaskDue(input: string): { task: string; dueRaw: string | null } {
  const s = clean(input).replace(TRAILING_PUNCT, '');
  const keywords = [...s.matchAll(/(?<=^|[\s—–,;(-])(by|before|due|until|for|on)\s+/gi)];

  for (let i = keywords.length - 1; i >= 0; i--) {
    const k = keywords[i] as RegExpMatchArray;
    const kw = (k[1] as string).toLowerCase();
    const at = k.index as number;
    const tail = s.slice(at + k[0].length);
    const before = s.slice(0, at);

    if (STRONG.has(kw) && isDatePhrase(tail)) return cut(before, tail);
    if (kw === 'by' && TEMPORAL_START.test(tail)) return cut(before, `by ${tail}`);
    if (FULL_DATE_ONLY.has(kw) && isFullDate(tail)) return cut(before, tail);

    // `by <date> — comment`
    const dated = /^(.+?)\s+[—–]\s+(.+)$/.exec(tail);
    if (STRONG.has(kw) && dated && isDatePhrase(dated[1] as string)) {
      return {
        task: clean(`${before.replace(SEPARATORS, '')} — ${dated[2] as string}`),
        dueRaw: dated[1] as string,
      };
    }
  }

  // bare trailing `EOD`, `tomorrow`, `EOD tomorrow`
  const words = s.split(' ');
  for (const n of [2, 1]) {
    if (words.length <= n - 1) continue;
    const phrase = words.slice(-n).join(' ');
    const p = matchPhrase(normalisePhrase(phrase));
    if (p && (p.rule === 'tomorrow' || p.rule === 'today')) {
      return cut(words.slice(0, -n).join(' '), phrase);
    }
  }

  return { task: s, dueRaw: null };
}

// ---- candidates -------------------------------------------------------------------------

/** Owner, task and due text for one candidate. Table rows take owner and due from their cells. */
export function parseCandidate(c: Candidate): ParsedLine {
  const warnings: WarningInfo[] = [];
  let ownerRaw: string;
  let helperRaw: string | undefined;
  let task: string;
  let dueRaw: string | null;

  if (c.table) {
    ownerRaw = clean(c.table.owner.replace(/(^|\s)@/g, '$1'));
    task = clean(c.table.action);
    const cell = clean(c.table.due);
    if (cell !== '') {
      dueRaw = cell;
    } else {
      const split = splitTaskDue(task);
      task = split.task;
      dueRaw = split.dueRaw;
    }
  } else {
    const o = splitOwnerTask(c.text);
    ownerRaw = o.ownerRaw;
    helperRaw = o.helperRaw;
    const split = splitTaskDue(o.task);
    task = split.task;
    dueRaw = split.dueRaw;
  }

  if (task === '') {
    warnings.push({
      line: c.line,
      code: WarningCode.EMPTY_ITEM,
      message: 'action item has no task text and should be dropped',
    });
  }

  const out: ParsedLine = { ownerRaw, task, dueRaw, candidate: c, warnings };
  if (helperRaw) out.helperRaw = helperRaw;
  return out;
}
