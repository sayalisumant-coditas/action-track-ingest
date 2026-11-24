import { dateFromFileName, parseDateTextDetailed } from '../dates/parseDate.js';
import type { ISODate, Meeting } from '../types.js';
import { WarningCode, type Warning, type WarningInfo } from '../warnings.js';
import { splitFrontMatter } from './frontmatter.js';

export interface HeaderOptions {
  /** File names or globs (`*security-review*`) treated as confidential (R9). */
  confidentialPatterns?: string[];
}

export interface HeaderResult {
  meeting: Meeting;
  /** 1-based line in the original file of the first line after the header. */
  bodyStartLine: number;
  warnings: Warning[];
  /** Non-warning remarks, e.g. "no attendees listed". */
  notices: string[];
}

/** Lowercase file path without extension; separators become `/`, other runs become `-`. */
export function slug(fileName: string): string {
  return fileName
    .replace(/\\/g, '/')
    .replace(/\.[^./]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/(^|\/)-+|-+($|\/)/g, '$1$2')
    .replace(/^\/+|\/+$/g, '');
}

const baseName = (fileName: string) => fileName.split(/[\\/]/).pop() ?? fileName;

/** `Priya Nair (PM)` -> `Priya Nair`: the name to match against the people directory. */
export function attendeeMatchName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split on `,` `;` and the word `and` (outside parentheses); trim; drop empties and duplicates. */
export function parseAttendees(s: string): string[] {
  if (typeof s !== 'string') return [];
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';')) {
      parts.push(cur);
      cur = '';
      continue;
    }
    if (depth === 0 && /\s/.test(ch) && /^\s+and\s+/i.test(s.slice(i))) {
      parts.push(cur);
      cur = '';
      i += (/^\s+and\s+/i.exec(s.slice(i)) as RegExpExecArray)[0].length - 1;
      continue;
    }
    cur += ch;
  }
  parts.push(cur);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const raw = p.replace(/\s+/g, ' ').trim();
    if (raw === '') continue;
    const key = attendeeMatchName(raw).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

export interface InferredDate {
  date: ISODate | null;
  inferred: boolean;
  warnings: WarningInfo[];
}

/**
 * Header date first (text, parsed here); the file-name date second (inferred = true,
 * DATE_INFERRED); else null. A valid header date that disagrees with the file name wins and
 * raises DATE_MISMATCH_FILENAME. A written weekday that does not match raises DATE_WEEKDAY_MISMATCH.
 */
export function inferMeetingDate(headerDate: string | null, fileName: string): InferredDate {
  const warnings: WarningInfo[] = [];
  const fromName = dateFromFileName(fileName);
  const parsed = headerDate ? parseDateTextDetailed(headerDate) : null;

  if (parsed) {
    if (parsed.weekdayMismatch) {
      warnings.push({
        code: WarningCode.DATE_WEEKDAY_MISMATCH,
        message: `weekday "${parsed.weekdayMismatch.written}" does not match ${parsed.date} (a ${parsed.weekdayMismatch.actual}); keeping the date`,
      });
    }
    if (fromName && fromName !== parsed.date) {
      warnings.push({
        code: WarningCode.DATE_MISMATCH_FILENAME,
        message: `header date ${parsed.date} differs from file name date ${fromName}; using the header`,
      });
    }
    return { date: parsed.date, inferred: false, warnings };
  }

  if (fromName) {
    warnings.push({
      code: WarningCode.DATE_INFERRED,
      message: headerDate
        ? `could not read date "${headerDate}"; using file name date ${fromName}`
        : `no date in header; using file name date ${fromName}`,
    });
    return { date: fromName, inferred: true, warnings };
  }
  return { date: null, inferred: false, warnings };
}

function globToRegExp(glob: string): RegExp {
  const src = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${src}$`, 'i');
}

function isConfidentialByConfig(fileName: string, patterns: string[]): boolean {
  const norm = fileName.replace(/\\/g, '/');
  const base = baseName(norm);
  return patterns.some((p) => {
    const re = globToRegExp(p);
    return re.test(base) || re.test(norm);
  });
}

/**
 * Title, date and attendees from either header style (front matter or `# Meeting:` + `Date:` +
 * `Attendees:` lines). Always returns a Meeting. Never throws.
 * Header lines are only read before the first `##` heading or the first list item.
 */
export function parseMeetingHeader(
  text: string,
  fileName: string,
  opts: HeaderOptions = {},
): HeaderResult {
  const safe = typeof text === 'string' ? text : '';
  const fm = splitFrontMatter(safe);
  const warnings: Warning[] = fm.warnings.map((w) => ({ ...w, file: fileName }));
  const notices: string[] = [];

  const lines = fm.body.split('\n');
  let headerEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] as string;
    if (/^#{2,}\s/.test(l) || /^\s*[-*+]\s/.test(l)) {
      headerEnd = i;
      break;
    }
  }

  let headingTitle: string | null = null;
  let dateLine: string | null = null;
  let attendeesLine: string | null = null;
  let lastHeaderIdx = -1; // index in `lines` of the last recognised header line
  for (let i = 0; i < headerEnd; i++) {
    const l = lines[i] as string;
    let m: RegExpExecArray | null;
    if (headingTitle === null && (m = /^#\s+(?:Meeting:\s*)?(.+?)\s*$/i.exec(l))) {
      headingTitle = m[1] as string;
      lastHeaderIdx = i;
    } else if (dateLine === null && (m = /^Date:[ \t]*(.*?)\s*$/i.exec(l))) {
      dateLine = m[1] as string;
      lastHeaderIdx = i;
    } else if (attendeesLine === null && (m = /^Attendees:[ \t]*(.*?)\s*$/i.exec(l))) {
      attendeesLine = m[1] as string;
      lastHeaderIdx = i;
    }
  }

  const fmStr = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

  const title = fmStr(fm.data.title) ?? headingTitle ?? baseName(slug(fileName));

  const headerDate = fmStr(fm.data.date) ?? (dateLine && dateLine !== '' ? dateLine : null);
  const inferred = inferMeetingDate(headerDate, fileName);
  for (const w of inferred.warnings) warnings.push({ ...w, file: fileName });

  const fmAttendees = fm.data.attendees;
  let attendees: string[];
  if (Array.isArray(fmAttendees)) {
    attendees = parseAttendees(fmAttendees.map((a) => String(a)).join(';'));
  } else if (typeof fmAttendees === 'string') {
    attendees = parseAttendees(fmAttendees);
  } else {
    attendees = parseAttendees(attendeesLine ?? '');
  }
  if (attendees.length === 0) notices.push('no attendees listed');

  const confidential =
    fm.data.confidential === true ||
    fm.data.confidential === 'true' ||
    isConfidentialByConfig(fileName, opts.confidentialPatterns ?? []);

  const bodyStartLine = fm.bodyOffsetLines + (lastHeaderIdx >= 0 ? lastHeaderIdx + 1 : 0) + 1;

  return {
    meeting: {
      id: slug(fileName),
      sourceFile: fileName,
      title,
      date: inferred.date,
      dateInferred: inferred.inferred,
      attendees,
      confidential,
    },
    bodyStartLine,
    warnings,
    notices,
  };
}
