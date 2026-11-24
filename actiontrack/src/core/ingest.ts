import path from 'node:path';
import { resolveDueWithWarnings } from './dates/resolveDue.js';
import { mergeOccurrences, type ParsedItem } from './dedupe/merge.js';
import { extractCandidates, type Candidate, type IgnoredCandidate } from './parse/candidates.js';
import { splitFrontMatter } from './parse/frontmatter.js';
import { parseCandidate, type ParsedLine } from './parse/line.js';
import { parseMeetingHeader } from './parse/meeting.js';
import { defaultPeopleConfig, type PeopleConfig } from './people/config.js';
import { buildDirectory, type Directory } from './people/directory.js';
import { resolveOwner } from './people/resolveOwner.js';
import { buildReport } from './report.js';
import { readNote } from './scan/readNote.js';
import { scanFolder } from './scan/scanFolder.js';
import { applyIngest, loadStore, saveStore, type ApplyIngestOptions } from './store/store.js';
import type { DueRef, IngestReport, Meeting, OwnerRef } from './types.js';
import { WarningCode, systemClock, type Clock, type Warning } from './warnings.js';

/** The per-line stages, replaceable so tests can make one of them throw. */
export interface Stages {
  parseHeader: typeof parseMeetingHeader;
  extract: typeof extractCandidates;
  parseLine: typeof parseCandidate;
  resolveDue: typeof resolveDueWithWarnings;
}

export const defaultStages: Stages = {
  parseHeader: parseMeetingHeader,
  extract: extractCandidates,
  parseLine: parseCandidate,
  resolveDue: resolveDueWithWarnings,
};

export interface IngestOptions {
  /** Path of the store file (see `resolveStorePath`). */
  store: string;
  config?: PeopleConfig;
  /** File names or globs treated as confidential. */
  confidentialPatterns?: string[];
  /** Merge threshold, 0 to 1. */
  mergeThreshold?: number;
  recursive?: boolean;
  /** Keep stored items from files outside this ingest untouched (see `applyIngest`). */
  mergeFolders?: boolean;
  clock?: Clock;
  stages?: Partial<Stages>;
}

interface Context {
  stages: Stages;
  confidentialPatterns: string[];
}

/** A line after parsing and due resolution; the owner needs the directory, so it comes later. */
interface PendingLine {
  line: ParsedLine;
  candidate: Candidate;
  due: DueRef;
}

export type FileOutcome =
  | { kind: 'skip'; skipped: IngestReport['skipped'][number]; warnings: Warning[] }
  | {
      kind: 'ok';
      meeting: Meeting;
      lines: PendingLine[];
      ignored: IgnoredCandidate[];
      warnings: Warning[];
    };

/** Posix-style path of `file` relative to `root`; used as the meeting's source file name. */
function relName(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * Read and parse one note up to (but not including) owner resolution. Everything is inside a
 * try/catch, so a bad file becomes a `skipped` entry and never stops the run (NFR-1).
 */
export function processFile(file: string, name: string, ctx: Context): FileOutcome {
  try {
    const read = readNote(file);
    if (!read.ok) {
      return { kind: 'skip', skipped: { file: name, reason: read.reason }, warnings: [] };
    }
    const warnings: Warning[] = [];
    const head = ctx.stages.parseHeader(read.text, name, {
      confidentialPatterns: ctx.confidentialPatterns,
    });
    warnings.push(...head.warnings);
    const meeting = head.meeting;

    const fm = splitFrontMatter(read.text);
    const ex = ctx.stages.extract(fm.body, fm.bodyOffsetLines);
    for (const w of ex.warnings) warnings.push({ ...w, file: name });

    const lines: PendingLine[] = [];
    for (const candidate of ex.candidates) {
      const line = ctx.stages.parseLine(candidate);
      for (const w of line.warnings) warnings.push({ ...w, file: name });
      if (line.task === '') continue; // empty item: already warned about
      const resolved = ctx.stages.resolveDue(line.dueRaw, meeting.date, meeting.dateInferred);
      for (const w of resolved.warnings) warnings.push({ ...w, file: name, line: candidate.line });
      lines.push({ line, candidate, due: resolved.due });
    }
    return { kind: 'ok', meeting, lines, ignored: ex.ignored, warnings };
  } catch (e) {
    return {
      kind: 'skip',
      skipped: { file: name, reason: 'unreadable', message: (e as Error).message },
      warnings: [],
    };
  }
}

const unassigned = (raw: string): OwnerRef => ({
  kind: 'unassigned',
  raw,
  people: [],
  helpers: [],
  candidates: [],
});

/**
 * Run the whole pipeline for a folder and save the store: scan, read, parse, build the people
 * directory from all meetings, resolve owners, merge, apply to the store, save.
 * Throws only FolderError (bad folder) and StoreError (corrupt store); per-file problems are
 * reported. A corrupt store stops the run before anything is written.
 */
export async function ingest(dir: string, opts: IngestOptions): Promise<IngestReport> {
  const clock = opts.clock ?? systemClock;
  const config = opts.config ?? defaultPeopleConfig();
  const ctx: Context = {
    stages: { ...defaultStages, ...opts.stages },
    confidentialPatterns: opts.confidentialPatterns ?? [],
  };

  const files = scanFolder(dir, { recursive: opts.recursive ?? false });
  const store = loadStore(opts.store);
  const root = path.resolve(dir);

  const skipped: IngestReport['skipped'] = [];
  const warnings: Warning[] = [];
  const ignoredCandidates: IngestReport['ignoredCandidates'] = [];
  const meetings: Meeting[] = [];
  const pending: { meeting: Meeting; lines: PendingLine[] }[] = [];
  let filesRead = 0;

  for (const file of files) {
    const name = relName(root, file);
    const out = processFile(file, name, ctx);
    if (out.kind === 'skip') {
      skipped.push(out.skipped);
      warnings.push(...out.warnings);
      continue;
    }
    filesRead++;
    warnings.push(...out.warnings);
    for (const ig of out.ignored) ignoredCandidates.push({ file: name, ...ig });
    meetings.push(out.meeting);
    pending.push({ meeting: out.meeting, lines: out.lines });
    if (out.lines.length === 0) skipped.push({ file: name, reason: 'no-actions' });
  }

  // The directory comes from every meeting, so an attendee listed in a later file still counts.
  const directory: Directory = buildDirectory(meetings, config);
  for (const w of directory.warnings) warnings.push({ ...w, file: '' });

  const parsed: ParsedItem[] = [];
  for (const { meeting, lines } of pending) {
    for (const { line, candidate, due } of lines) {
      let owner: OwnerRef;
      try {
        const r = resolveOwner(line.ownerRaw, line.helperRaw, meeting, directory, config);
        owner = r.owner;
        for (const w of r.warnings) {
          warnings.push({ ...w, file: meeting.sourceFile, line: candidate.line });
        }
      } catch (e) {
        owner = unassigned(line.ownerRaw);
        warnings.push({
          file: meeting.sourceFile,
          line: candidate.line,
          code: WarningCode.OWNER_UNKNOWN,
          message: `owner could not be resolved: ${(e as Error).message}`,
        });
      }
      const item: ParsedItem = {
        meeting,
        owner,
        task: line.task,
        line: candidate.line,
        rawLine: candidate.rawLine,
        checked: candidate.checked,
        due,
      };
      if (candidate.parentLine !== undefined) item.parentLine = candidate.parentLine;
      parsed.push(item);
    }
  }

  const merged = mergeOccurrences(
    parsed,
    opts.mergeThreshold === undefined ? {} : { threshold: opts.mergeThreshold },
  );
  warnings.push(...merged.warnings);

  const report = buildReport({
    filesScanned: files.length,
    filesRead,
    meetings: meetings.length,
    items: merged.items,
    skipped,
    warnings,
    uncertainMerges: merged.uncertain,
    ignoredCandidates,
  });

  const applyOpts: ApplyIngestOptions = opts.mergeFolders ? { mergeFolders: true } : {};
  const next = applyIngest(store, meetings, merged.items, report, clock, applyOpts);
  saveStore(opts.store, next);
  return report;
}
