import { WarningCode, type WarningInfo } from '../warnings.js';

export type IgnoreReason = 'blockquote' | 'code' | 'comment';

export interface TableCells {
  owner: string;
  action: string;
  due: string;
  status?: string;
}

export interface Candidate {
  /** 1-based line in the original file (body line + lineOffset). */
  line: number;
  rawLine: string;
  checked: boolean;
  text: string;
  /** Leading whitespace in columns (a tab counts as 4). */
  indent: number;
  parentLine?: number;
  table?: TableCells;
  kind: 'checkbox' | 'action' | 'table';
}

export interface IgnoredCandidate {
  line: number;
  why: IgnoreReason;
}

export interface ExtractResult {
  candidates: Candidate[];
  ignored: IgnoredCandidate[];
  warnings: WarningInfo[];
}

const CHECKBOX = /^(\s*)(?:[-*+]|\d+[.)])\s+\[( |x|X)\](?:\s+(.*))?$/;
const ACTION = /^\s*ACTION:\s*(.*)$/i;
const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;

function columns(ws: string): number {
  let n = 0;
  for (const ch of ws) n += ch === '\t' ? 4 : 1;
  return n;
}

export function matchCheckbox(
  line: string,
): { indent: number; checked: boolean; text: string } | null {
  const m = CHECKBOX.exec(line);
  if (!m) return null;
  return { indent: columns(m[1] ?? ''), checked: m[2] !== ' ', text: (m[3] ?? '').trim() };
}

export function matchActionLine(line: string): { text: string } | null {
  const m = ACTION.exec(line);
  return m ? { text: (m[1] ?? '').trim() } : null;
}

// ---- tables -------------------------------------------------------------------------------

function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

const isPipeRow = (line: string) => line.trimStart().startsWith('|');
const isSeparator = (line: string) =>
  isPipeRow(line) && splitCells(line).every((c) => /^:?-+:?$/.test(c));

interface Header {
  owner: number;
  action: number;
  due: number;
  status: number;
}

function parseHeader(line: string): Header | null {
  if (!isPipeRow(line) || isSeparator(line)) return null;
  const names = splitCells(line).map((c) => c.toLowerCase());
  const owner = names.indexOf('owner');
  const action = names.indexOf('action');
  if (owner < 0 || action < 0) return null;
  return { owner, action, due: names.indexOf('due'), status: names.indexOf('status') };
}

function cell(cells: string[], i: number): string {
  return i < 0 ? '' : (cells[i] ?? '');
}

export interface TableRow {
  /** Index into `lines`. */
  idx: number;
  cells: TableCells;
}

/**
 * If `lines[startIdx]` is an Owner/Action header, read the table: skip the separator row and
 * return every row until the first line that does not start with `|`. `next` is the index of
 * the first line after the table. Returns null when the line is not a header.
 */
export function parseTable(
  lines: string[],
  startIdx: number,
): { rows: TableRow[]; next: number } | null {
  const header = parseHeader(lines[startIdx] ?? '');
  if (!header) return null;
  const rows: TableRow[] = [];
  let i = startIdx + 1;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!isPipeRow(line)) break;
    if (isSeparator(line)) continue;
    const c = splitCells(line);
    const cells: TableCells = {
      owner: cell(c, header.owner),
      action: cell(c, header.action),
      due: cell(c, header.due),
    };
    if (header.status >= 0) cells.status = cell(c, header.status);
    rows.push({ idx: i, cells });
  }
  return { rows, next: i };
}

// ---- parent links -------------------------------------------------------------------------

/**
 * A checkbox indented deeper than the nearest preceding checkbox becomes its child, as long as
 * every non-blank line in between is itself indented deeper than that parent (so a heading or
 * a plain bullet at the parent's level breaks the link). `bodyLines` is optional; without it
 * the in-between check is skipped.
 */
export function linkParents(candidates: Candidate[], bodyLines?: string[], lineOffset = 0): void {
  const indentOf = (l: string) => columns(/^\s*/.exec(l)?.[0] ?? '');
  let stack: Candidate[] = [];
  for (const c of candidates) {
    if (c.kind !== 'checkbox') {
      stack = [];
      continue;
    }
    while (stack.length && (stack[stack.length - 1] as Candidate).indent >= c.indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent && bodyLines) {
      for (let ln = parent.line + 1; ln < c.line; ln++) {
        const l = bodyLines[ln - lineOffset - 1] ?? '';
        if (l.trim() !== '' && indentOf(l) <= parent.indent) {
          stack = [];
          break;
        }
      }
    }
    const linked = stack[stack.length - 1];
    if (linked) c.parentLine = linked.line;
    stack.push(c);
  }
}

// ---- main ---------------------------------------------------------------------------------

const looksLikeCandidate = (s: string) => matchCheckbox(s) !== null || matchActionLine(s) !== null;

/**
 * One pass over the lines with two state flags (inside a fence, inside an HTML comment).
 * Ignore reasons are decided in this order: comment, code, blockquote. Never throws.
 * `lineOffset` is added to every reported line number (front matter lines).
 */
export function extractCandidates(body: string, lineOffset = 0): ExtractResult {
  const lines = body === '' ? [] : body.split('\n').map((l) => l.replace(/\r$/, ''));
  const candidates: Candidate[] = [];
  const ignored: IgnoredCandidate[] = [];
  const warnings: WarningInfo[] = [];

  let fence: { ch: string; len: number; line: number } | null = null;
  let commentLine: number | null = null; // line where the open comment started
  let ignoredTable = false; // inside an Owner/Action table that is itself ignored

  const ignore = (line: number, why: IgnoreReason) => ignored.push({ line, why });
  const empty = (line: number, what: string) =>
    warnings.push({
      line,
      code: WarningCode.EMPTY_ITEM,
      message: `${what} has no text and was dropped`,
    });

  /** Treat `s` as an ignored region's content: record it if it looks like an action line. */
  const ignoreContent = (text: string, line: number, why: IgnoreReason) => {
    const s = text.replace(/^(\s*>\s?)+/, ''); // a quoted line inside code/comment still counts once
    if (parseHeader(s)) {
      ignoredTable = true;
    } else if (isPipeRow(s)) {
      if (ignoredTable && !isSeparator(s)) ignore(line, why);
    } else {
      ignoredTable = false;
      if (looksLikeCandidate(s)) ignore(line, why);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string;
    const line = i + 1 + lineOffset;
    let s = raw;

    // 1. inside an HTML comment (highest priority; fences inside stay comment)
    if (commentLine !== null) {
      const end = s.indexOf('-->');
      if (end < 0) {
        ignoreContent(s, line, 'comment');
        continue;
      }
      ignoreContent(s.slice(0, end), line, 'comment');
      commentLine = null;
      s = s.slice(end + 3);
      if (s.trim() === '') continue;
    }

    // 2. inside a fence
    if (fence) {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(s);
      if (
        close &&
        (close[1] as string)[0] === fence.ch &&
        (close[1] as string).length >= fence.len
      ) {
        fence = null;
        ignoredTable = false;
      } else {
        ignoreContent(s, line, 'code');
      }
      continue;
    }

    // 3. fence opens
    const open = FENCE_OPEN.exec(s);
    if (open) {
      const run = open[1] as string;
      fence = { ch: run[0] as string, len: run.length, line };
      ignoredTable = false;
      continue;
    }

    // 4. HTML comments opening on this line (one-line or multi-line)
    let guard = 0;
    while (s.includes('<!--') && guard++ < 100) {
      const start = s.indexOf('<!--');
      const end = s.indexOf('-->', start + 4);
      if (end < 0) {
        ignoreContent(s.slice(start + 4), line, 'comment');
        s = s.slice(0, start);
        commentLine = line;
        break;
      }
      ignoreContent(s.slice(start + 4, end), line, 'comment');
      s = s.slice(0, start) + ' ' + s.slice(end + 3);
    }
    if (s.trim() === '' && s !== raw) continue;

    // 5. blockquote
    if (/^\s*>/.test(s)) {
      ignoreContent(s.replace(/^(\s*>\s?)+/, ''), line, 'blockquote');
      continue;
    }
    ignoredTable = false;

    // 6. live line
    const cb = matchCheckbox(s);
    if (cb) {
      if (cb.text === '') empty(line, 'Checkbox');
      else
        candidates.push({
          line,
          rawLine: raw,
          checked: cb.checked,
          text: cb.text,
          indent: cb.indent,
          kind: 'checkbox',
        });
      continue;
    }
    const act = matchActionLine(s);
    if (act) {
      if (act.text === '') empty(line, 'ACTION line');
      else
        candidates.push({
          line,
          rawLine: raw,
          checked: false,
          text: act.text,
          indent: columns(/^\s*/.exec(s)?.[0] ?? ''),
          kind: 'action',
        });
      continue;
    }
    const table = isPipeRow(s)
      ? parseTable(
          lines.map((l) => l),
          i,
        )
      : null;
    if (table) {
      for (const row of table.rows) {
        const rowLine = row.idx + 1 + lineOffset;
        if (row.cells.action === '') {
          empty(rowLine, 'Table row');
          continue;
        }
        candidates.push({
          line: rowLine,
          rawLine: lines[row.idx] as string,
          checked: false,
          text: row.cells.action,
          indent: 0,
          table: row.cells,
          kind: 'table',
        });
      }
      i = table.next - 1;
    }
  }

  if (fence) {
    warnings.push({
      line: fence.line,
      code: WarningCode.FENCE_UNCLOSED,
      message: 'Code fence is never closed; the rest of the file was treated as code',
    });
  }
  if (commentLine !== null) {
    warnings.push({
      line: commentLine,
      code: WarningCode.FENCE_UNCLOSED,
      message: 'HTML comment is never closed; the rest of the file was ignored as a comment',
    });
  }

  linkParents(candidates, lines, lineOffset);
  return { candidates, ignored, warnings };
}
