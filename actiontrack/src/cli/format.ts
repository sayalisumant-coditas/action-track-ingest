import type { Draft } from '../core/followup/gmail.js';
import type { Directory } from '../core/people/directory.js';
import { effectiveStatus } from '../core/query/status.js';
import { MISSING_FLAG } from '../core/store/store.js';
import type { ActionItem, IngestReport, ISODate } from '../core/types.js';

// ---- colour ----------------------------------------------------------------------------------

export interface Style {
  red(s: string): string;
  dim(s: string): string;
}

const wrap = (open: number, close: number) => (s: string) => `\u001b[${open}m${s}\u001b[${close}m`;

export const colour: Style = { red: wrap(31, 39), dim: wrap(2, 22) };
export const plain: Style = { red: (s) => s, dim: (s) => s };

/** Colour only on a terminal, and not with `--no-color` or the NO_COLOR variable. */
export function useColour(opts: {
  isTTY: boolean;
  noColor?: boolean;
  env?: Record<string, string | undefined>;
}): boolean {
  if (!opts.isTTY || opts.noColor === true) return false;
  const nc = opts.env?.NO_COLOR;
  return nc === undefined || nc === '';
}

// ---- items -----------------------------------------------------------------------------------

const lastName = (full: string) => full.split(' ').slice(1).join(' ') || full;

function personName(dir: Directory, id: string): string {
  return dir.people.find((p) => p.id === id)?.fullName ?? id;
}

/** Owner as shown to people: names, `unassigned`, the group word, or `Priya (Nair or Shah?)`. */
export function ownerText(item: ActionItem, dir: Directory): string {
  const o = item.owner;
  switch (o.kind) {
    case 'person':
      return o.people.map((id) => personName(dir, id)).join(' & ');
    case 'group':
      return o.raw ? o.raw.charAt(0).toUpperCase() + o.raw.slice(1) : 'Everyone';
    case 'ambiguous':
      return `${o.raw} (${o.candidates.map((id) => lastName(personName(dir, id))).join(' or ')}?)`;
    default:
      return 'unassigned';
  }
}

export function dueText(item: ActionItem): string {
  if (item.due.date !== null) return item.due.date;
  if (item.due.raw !== null && item.due.raw.trim() !== '') return `? ${item.due.raw.trim()}`;
  return 'no due date';
}

/** `file:line` of the latest occurrence. */
export function sourceText(item: ActionItem): string {
  const o = item.occurrences[item.occurrences.length - 1];
  return o ? `${o.sourceFile}:${o.line}` : '';
}

function statusText(item: ActionItem, asOf: ISODate): string {
  const s = effectiveStatus(item, asOf);
  return item.flags.includes(MISSING_FLAG) ? `${s} (not in notes)` : s;
}

const truncate = (s: string, max: number): string =>
  max <= 1 ? s.slice(0, Math.max(max, 0)) : s.length <= max ? s : `${s.slice(0, max - 1)}~`;

/**
 * Table with columns ID, OWNER, TASK, DUE, STATUS, SOURCE. Overdue rows are red; `unassigned` and
 * `no due date` are dim. The TASK column is cut to fit the terminal width; ids are never cut.
 */
export function renderTable(
  items: ActionItem[],
  dir: Directory,
  asOf: ISODate,
  opts: { columns?: number; style?: Style } = {},
): string {
  const style = opts.style ?? plain;
  const columns = opts.columns ?? 100;
  const rows = items.map((i) => ({
    item: i,
    id: i.id,
    owner: ownerText(i, dir),
    task: i.task,
    due: dueText(i),
    status: statusText(i, asOf),
    source: sourceText(i),
  }));
  const head = {
    id: 'ID',
    owner: 'OWNER',
    task: 'TASK',
    due: 'DUE',
    status: 'STATUS',
    source: 'SOURCE',
  };
  const all = [head, ...rows];
  const w = (k: 'id' | 'owner' | 'due' | 'status' | 'source') =>
    Math.max(...all.map((r) => r[k].length));
  const widths = {
    id: w('id'),
    owner: w('owner'),
    due: w('due'),
    status: w('status'),
    source: w('source'),
  };
  const gaps = 2 * 5;
  const fixed = widths.id + widths.owner + widths.due + widths.status + widths.source + gaps;
  const longest = Math.max(...all.map((r) => r.task.length));
  const taskWidth = Math.min(longest, Math.max(12, columns - fixed));

  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
  const line = (r: (typeof all)[number], paint: (cell: string, key: string) => string): string =>
    [
      paint(pad(r.id, widths.id), 'id'),
      paint(pad(truncate(r.owner, widths.owner), widths.owner), 'owner'),
      paint(pad(truncate(r.task, taskWidth), taskWidth), 'task'),
      paint(pad(r.due, widths.due), 'due'),
      paint(pad(r.status, widths.status), 'status'),
      paint(r.source, 'source'),
    ].join('  ');

  const out = [line(head, (c) => c)];
  for (const r of rows) {
    const overdue = effectiveStatus(r.item, asOf) === 'overdue';
    out.push(
      line(r, (cell, key) => {
        if (overdue) return style.red(cell);
        if (key === 'owner' && r.item.owner.kind === 'unassigned') return style.dim(cell);
        if (key === 'due' && r.due === 'no due date') return style.dim(cell);
        return cell;
      }).trimEnd(),
    );
  }
  return out.join('\n');
}

/** Stable JSON row for `list --json`. */
export function jsonRow(item: ActionItem, dir: Directory, asOf: ISODate) {
  return {
    id: item.id,
    owner: ownerText(item, dir),
    ownerKind: item.owner.kind,
    ownerAmbiguity: item.owner.kind === 'ambiguous' ? ('ambiguous' as const) : null,
    ownerCandidates: item.owner.candidates.map((id) => personName(dir, id)),
    task: item.task,
    due: item.due.date,
    dueRaw: item.due.raw,
    status: effectiveStatus(item, asOf),
    source: sourceText(item),
    occurrences: item.occurrences.length,
    flags: item.flags,
  };
}

// ---- ingest report ---------------------------------------------------------------------------

/** Human-readable report. Per-warning and per-line detail only with `verbose`. */
export function renderReport(report: IngestReport, verbose = false): string {
  const bad = report.skipped.filter((s) => s.reason !== 'no-actions');
  const noActions = report.skipped.filter((s) => s.reason === 'no-actions');
  const out: string[] = [];
  out.push(
    `Scanned ${report.filesScanned ?? report.filesRead + bad.length} files: ${report.filesRead} read, ${bad.length} skipped`,
  );
  out.push(`Meetings: ${report.meetings}   Items: ${report.items}`);

  if (bad.length > 0) {
    out.push('', 'Skipped:');
    for (const s of bad) out.push(`  ${s.file}: ${s.reason}${s.message ? ` (${s.message})` : ''}`);
  }
  if (noActions.length > 0) {
    out.push(
      '',
      `No action items found in ${noActions.length} file${noActions.length === 1 ? '' : 's'}${verbose ? ':' : '.'}`,
    );
    if (verbose) for (const s of noActions) out.push(`  ${s.file}`);
  }

  const counts = report.warningCounts ?? {};
  const codes = Object.keys(counts);
  if (codes.length > 0) {
    out.push('', 'Warnings:');
    for (const c of codes) out.push(`  ${c} x${counts[c]}`);
  }
  if (report.counts) {
    const c = report.counts;
    out.push(
      '',
      `To review: ${c.unassigned} with no owner, ${c.ambiguousOwner} with an unclear owner, ${c.noDueDate} with no due date`,
    );
  }
  if (report.uncertainMerges.length > 0) {
    out.push('', `Possible duplicates kept apart (${report.uncertainMerges.length}):`);
    for (const m of report.uncertainMerges) out.push(`  ${m.a} ~ ${m.b} (similarity ${m.score})`);
  }

  if (verbose) {
    if (report.warnings.length > 0) {
      out.push('', 'Warning details:');
      for (const w of report.warnings) {
        out.push(`  ${w.file}${w.line !== undefined ? `:${w.line}` : ''} ${w.code} ${w.message}`);
      }
    }
    if (report.ignoredCandidates.length > 0) {
      out.push('', 'Ignored lines:');
      for (const g of report.ignoredCandidates) out.push(`  ${g.file}:${g.line} (${g.why})`);
    }
  }
  return out.join('\n');
}

// ---- draft -----------------------------------------------------------------------------------

export function renderDraft(draft: Draft): string {
  const out = [
    `To:      ${draft.to === '' ? '(empty)' : draft.to}`,
    `Subject: ${draft.subject}`,
    `Items:   ${draft.itemIds.join(', ')}`,
  ];
  if (draft.warnings.length > 0) {
    out.push('Warnings:');
    for (const w of draft.warnings) out.push(`  ${w.code}: ${w.message}`);
  }
  out.push('', draft.body);
  return out.join('\n');
}
