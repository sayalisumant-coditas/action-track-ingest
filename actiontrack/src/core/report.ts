import type { ActionItem, IngestReport } from './types.js';

export interface ReportParts {
  filesScanned: number;
  filesRead: number;
  meetings: number;
  items: ActionItem[];
  skipped: IngestReport['skipped'];
  warnings: IngestReport['warnings'];
  uncertainMerges: IngestReport['uncertainMerges'];
  ignoredCandidates: IngestReport['ignoredCandidates'];
}

/** Number of warnings per code, codes in alphabetical order. */
export function summariseWarnings(warnings: IngestReport['warnings']): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of warnings) counts[w.code] = (counts[w.code] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * Assemble the report: summary numbers, warnings grouped by code (`warningCounts`) and the full
 * warning list (for `--verbose`), skipped files with reasons, uncertain merges, ignored lines.
 * The result is plain data, so it survives `JSON.stringify`.
 */
export function buildReport(parts: ReportParts): IngestReport {
  const { items } = parts;
  return {
    filesScanned: parts.filesScanned,
    filesRead: parts.filesRead,
    meetings: parts.meetings,
    items: items.length,
    skipped: parts.skipped,
    warnings: parts.warnings,
    warningCounts: summariseWarnings(parts.warnings),
    counts: {
      unassigned: items.filter((i) => i.owner.kind === 'unassigned').length,
      noDueDate: items.filter((i) => i.due.date === null && i.due.raw === null).length,
      ambiguousOwner: items.filter((i) => i.owner.kind === 'ambiguous').length,
    },
    uncertainMerges: parts.uncertainMerges,
    ignoredCandidates: parts.ignoredCandidates,
  };
}

/**
 * Per-file problems never make a run fail, so this is 0. Fatal errors (FolderError, StoreError)
 * are thrown by `ingest` instead and mapped to a non-zero code by the CLI.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function exitCodeFor(_report: IngestReport): 0 {
  return 0;
}
