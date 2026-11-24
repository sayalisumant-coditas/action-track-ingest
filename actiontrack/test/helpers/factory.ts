import type { ActionItem, DueRef, Meeting, OwnerRef, Person } from '../../src/core/types.js';
import type { IngestReport } from '../../src/core/types.js';

export const FIXED_NOW = '2026-11-24T10:00:00.000Z';
export const fixedClock = () => new Date(FIXED_NOW);

export const owner = (...people: string[]): OwnerRef => ({
  kind: 'person',
  raw: people[0] ?? '',
  people,
  helpers: [],
  candidates: [],
});
export const unassignedOwner = (): OwnerRef => ({
  kind: 'unassigned',
  raw: '',
  people: [],
  helpers: [],
  candidates: [],
});
export const groupOwner = (): OwnerRef => ({
  kind: 'group',
  raw: 'everyone',
  people: [],
  helpers: [],
  candidates: [],
});
export const ambiguousOwner = (...candidates: string[]): OwnerRef => ({
  kind: 'ambiguous',
  raw: 'Priya',
  people: [],
  helpers: [],
  candidates,
});
export const due = (date: string | null, raw: string | null = date): DueRef => ({
  raw,
  date,
  inferred: false,
});

export function meeting(over: Partial<Meeting> = {}): Meeting {
  const file = over.sourceFile ?? '2026-09-01-kickoff.md';
  return {
    id: over.id ?? file.replace(/\.md$/, ''),
    sourceFile: file,
    title: 'Kickoff',
    date: '2026-09-01',
    dateInferred: false,
    attendees: ['Priya Nair', 'Karan Joshi'],
    confidential: false,
    ...over,
  };
}

export function item(over: Partial<ActionItem> & { id: string }): ActionItem {
  const m = over.occurrences?.[0];
  return {
    task: 'do the thing',
    owner: owner('priya-nair'),
    due: due('2026-10-01'),
    status: 'open',
    dueHistory: [],
    flags: [],
    occurrences: m
      ? over.occurrences!
      : [
          {
            meetingId: '2026-09-01-kickoff',
            sourceFile: '2026-09-01-kickoff.md',
            line: 5,
            checked: false,
            due: due('2026-10-01'),
            rawLine: `- [ ] Priya: ${over.task ?? 'do the thing'} by 1 Oct`,
          },
        ],
    ...over,
  };
}

export const person = (id: string, full: string, email?: string): Person => {
  const [first = '', ...rest] = full.split(' ');
  const p: Person = { id, fullName: full, first, last: rest.join(' ') };
  if (email) p.email = email;
  return p;
};

export const emptyReport = (): IngestReport => ({
  filesRead: 0,
  meetings: 0,
  items: 0,
  skipped: [],
  warnings: [],
  warningCounts: {},
  counts: { unassigned: 0, noDueDate: 0, ambiguousOwner: 0 },
  uncertainMerges: [],
  ignoredCandidates: [],
});
