import { ConfigError } from '../errors.js';
import { makeId } from '../store/ids.js';
import type { ActionItem, DueRef, Meeting, Occurrence, OwnerRef } from '../types.js';
import { WarningCode, type Warning } from '../warnings.js';
import { normaliseTask } from './normalise.js';
import { ownerKey } from './ownerKey.js';
import { DEFAULT_MERGE_THRESHOLD, UNCERTAIN_FLOOR, similarity } from './similarity.js';
import { stageGuard } from './stageGuard.js';

export { ownerKey } from './ownerKey.js';

/** One action line after M4 (parse), M5 (owner) and M6 (due) have run. */
export interface ParsedItem {
  meeting: Pick<Meeting, 'id' | 'sourceFile' | 'date'>;
  owner: OwnerRef;
  task: string;
  line: number;
  rawLine: string;
  checked: boolean;
  due: DueRef;
  /** Line (in the same file) of the item this one is nested under. */
  parentLine?: number;
}

export interface UncertainMerge {
  /** Existing item. */
  a: string;
  /** The new item that was kept apart from it. */
  b: string;
  score: number;
}

export interface MergeResult {
  items: ActionItem[];
  uncertain: UncertainMerge[];
  warnings: Warning[];
}

export interface MergeOptions {
  /** Similarity at or above which two same-owner lines merge. Default 0.85. */
  threshold?: number;
}

export const REOPENED_FLAG = 'reopened-in-notes';

interface Work {
  item: ActionItem;
  key: string;
  /** Distinct normalised wordings seen so far. */
  texts: Set<string>;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** (meeting date, file name, line); undated meetings last. */
function order(a: ParsedItem, b: ParsedItem): number {
  const da = a.meeting.date;
  const db = b.meeting.date;
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return cmp(da, db);
  }
  return cmp(a.meeting.sourceFile, b.meeting.sourceFile) || a.line - b.line || cmp(a.task, b.task);
}

function occurrenceOf(p: ParsedItem): Occurrence {
  return {
    meetingId: p.meeting.id,
    sourceFile: p.meeting.sourceFile,
    line: p.line,
    checked: p.checked,
    due: p.due,
    rawLine: p.rawLine,
  };
}

function checkThreshold(t: unknown): number {
  if (t === undefined) return DEFAULT_MERGE_THRESHOLD;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > 1) {
    throw new ConfigError(
      'mergeThreshold',
      `must be a number from 0 to 1, got ${JSON.stringify(t)}`,
    );
  }
  return t;
}

/**
 * Collapse repeated lines into items. Lines merge only when they have the same `ownerKey`, a
 * similarity of at least the threshold and no clash of stage verbs. Same-owner pairs scoring from
 * 0.6 up to the threshold stay separate and are listed in `uncertain`.
 *
 * Lines from an undated meeting are handled last and merge only with an exactly equal wording.
 * Throws ConfigError for a bad threshold; otherwise never throws.
 */
export function mergeOccurrences(parsed: ParsedItem[], opts: MergeOptions = {}): MergeResult {
  const threshold = checkThreshold(opts.threshold);
  const sorted = [...parsed].sort(order);

  const works: Work[] = [];
  const byKey = new Map<string, Work[]>();
  const byLine = new Map<string, Work>();
  const taken = new Set<string>();
  const uncertain: UncertainMerge[] = [];
  const warnings: Warning[] = [];
  const placed: { p: ParsedItem; w: Work }[] = [];

  for (const p of sorted) {
    const key = ownerKey(p.owner);
    const text = normaliseTask(p.task);
    const undated = p.meeting.date === null;
    const peers = byKey.get(key) ?? [];

    let best: { w: Work; score: number } | null = null;
    let borderline: { w: Work; score: number } | null = null;
    for (const w of peers) {
      for (const t of w.texts) {
        const score = undated ? (t === text && text !== '' ? 1 : 0) : similarity(text, t);
        if (!stageGuard(text, t)) continue;
        if (score >= threshold && score > 0) {
          if (!best || score > best.score) best = { w, score };
        } else if (!undated && score >= UNCERTAIN_FLOOR) {
          if (!borderline || score > borderline.score) borderline = { w, score };
        }
      }
    }

    let work: Work;
    if (best) {
      work = best.w;
      absorb(work, p, text, warnings);
    } else {
      const item: ActionItem = {
        id: makeId(occurrenceOf(p), taken),
        task: p.task,
        owner: p.owner,
        due: p.due,
        status: p.checked ? 'done' : 'open',
        occurrences: [occurrenceOf(p)],
        dueHistory: [],
        flags: [],
      };
      if (p.checked) item.doneBy = 'notes';
      taken.add(item.id);
      work = { item, key, texts: new Set([text]) };
      works.push(work);
      peers.push(work);
      byKey.set(key, peers);
      if (borderline) {
        uncertain.push({ a: borderline.w.item.id, b: item.id, score: round(borderline.score) });
      }
    }
    byLine.set(`${p.meeting.sourceFile}\n${p.line}`, work);
    placed.push({ p, w: work });
  }

  // nested items: parentLine -> the item built from that line
  for (const { p, w } of placed) {
    if (p.parentLine === undefined || w.item.parentId !== undefined) continue;
    const parent = byLine.get(`${p.meeting.sourceFile}\n${p.parentLine}`);
    if (parent && parent !== w) w.item.parentId = parent.item.id;
  }

  return { items: works.map((w) => w.item), uncertain, warnings };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Add a later line to an existing item: occurrence, due date, status. */
function absorb(w: Work, p: ParsedItem, text: string, warnings: Warning[]): void {
  const item = w.item;
  const occ = occurrenceOf(p);

  if (item.occurrences.some((o) => o.sourceFile === occ.sourceFile)) {
    warnings.push({
      file: occ.sourceFile,
      line: occ.line,
      code: WarningCode.DUPLICATE_IN_FILE,
      message: `"${p.task}" appears more than once in this file; merged with line ${
        (item.occurrences.filter((o) => o.sourceFile === occ.sourceFile).pop() as Occurrence).line
      }`,
    });
  }

  // due date: the latest known date wins; a missing date never erases a known one
  if (p.due.date !== null) {
    if (item.due.date !== null && item.due.date !== p.due.date) item.dueHistory.push(item.due.date);
    item.due = p.due;
  } else if (item.due.date === null && p.due.raw !== null) {
    item.due = p.due;
  }

  // status: any checked line makes the item done; an unchecked line after that reopens in the notes only
  const wasDone = item.occurrences.some((o) => o.checked);
  if (p.checked) {
    item.status = 'done';
    item.doneBy = 'notes';
  } else if (wasDone && !item.flags.includes(REOPENED_FLAG)) {
    item.flags.push(REOPENED_FLAG);
    warnings.push({
      file: occ.sourceFile,
      line: occ.line,
      code: WarningCode.ITEM_REOPENED,
      message: `"${item.task}" was checked in an earlier meeting but is unchecked here; kept as done`,
    });
  }

  item.occurrences.push(occ);
  w.texts.add(text);
}
