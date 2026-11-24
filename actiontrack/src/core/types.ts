/** Calendar date as `YYYY-MM-DD`. Use `isISODate` to validate. */
export type ISODate = string;
export type OwnerKind = 'person' | 'group' | 'unassigned' | 'ambiguous';

export interface Person {
  id: string;
  fullName: string;
  first: string;
  last: string;
  email?: string;
}

export interface Meeting {
  id: string;
  sourceFile: string;
  title: string;
  date: ISODate | null;
  dateInferred: boolean;
  /** Full names, as written. */
  attendees: string[];
  confidential: boolean;
}

export interface OwnerRef {
  kind: OwnerKind;
  /** Text as written. */
  raw: string;
  /** Person ids (empty unless kind=person). */
  people: string[];
  /** e.g. "(with Priya)". */
  helpers: string[];
  /** Possible Person ids when ambiguous. */
  candidates: string[];
}

export interface DueRef {
  raw: string | null;
  date: ISODate | null;
  /** Relative to an inferred meeting date. */
  inferred: boolean;
  reason?: 'unresolvable' | 'no-meeting-date' | 'weekday-mismatch';
}

export interface Occurrence {
  meetingId: string;
  sourceFile: string;
  line: number;
  checked: boolean;
  due: DueRef;
  rawLine: string;
  /** Set by the store when this line is no longer in the notes. */
  missing?: boolean;
}

export interface ActionItem {
  id: string;
  task: string;
  owner: OwnerRef;
  due: DueRef;
  status: 'open' | 'done';
  doneAt?: string;
  doneBy?: 'notes' | 'cli';
  occurrences: Occurrence[];
  dueHistory: ISODate[];
  parentId?: string;
  /** e.g. 'reopened-in-notes'. */
  flags: string[];
}

export interface IngestReport {
  /** `.md` files found by the scan (set by the ingest orchestrator). */
  filesScanned?: number;
  /** Files that were read as text (including ones with no action items). */
  filesRead: number;
  meetings: number;
  items: number;
  skipped: {
    file: string;
    reason: 'empty' | 'binary' | 'unreadable' | 'no-actions';
    message?: string;
  }[];
  /** Number of warnings per code (set by the ingest orchestrator). */
  warningCounts?: Record<string, number>;
  /** Item counts worth a second look (set by the ingest orchestrator). */
  counts?: { unassigned: number; noDueDate: number; ambiguousOwner: number };
  warnings: { file: string; line?: number; code: string; message: string }[];
  uncertainMerges: { a: string; b: string; score: number }[];
  ignoredCandidates: { file: string; line: number; why: 'blockquote' | 'code' | 'comment' }[];
}
