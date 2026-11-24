import type { Person } from '../types.js';

/** One item as shown in the email. */
export interface FollowupLine {
  id: string;
  task: string;
  /** Already worded, e.g. `due 2026-10-01`, `no due date`, `due "by the end of the cutover"`. */
  due: string;
  /** Whole days overdue; 0 when not overdue. */
  daysOverdue: number;
  /** `Quote portal kickoff, 2026-09-01`, or just the title when the meeting has no date. */
  meeting: string;
  /** Extra remark, e.g. that the line has gone from the notes. */
  note?: string;
}

/** The email wording lives here, so it is easy to review and change. */
export const TEMPLATE = {
  greeting: (first: string) => `Hi ${first},`,
  intro: 'Here is a short list of your open action items from our recent meetings.',
  overdueHeading: 'Overdue',
  openHeading: 'Open',
  closing:
    'If anything here has changed or is already done, just let me know and I will update the list.\n\nThanks!',
  subject: (open: number, overdue: number) =>
    `Follow-up: ${open} open action item${open === 1 ? '' : 's'} (${overdue} overdue)`,
  overdueNote: (days: number) => `${days} day${days === 1 ? '' : 's'} overdue`,
} as const;

function renderLine(l: FollowupLine): string {
  const when = l.daysOverdue > 0 ? `${l.due}, ${TEMPLATE.overdueNote(l.daysOverdue)}` : l.due;
  const note = l.note ? ` ${l.note}` : '';
  return `- ${l.task} (${when}) [${l.meeting}] #${l.id}${note}`;
}

/** Plain-text body: greeting, one line of context, Overdue list (if any), Open list (if any). */
export function renderBody(person: Person, overdue: FollowupLine[], open: FollowupLine[]): string {
  const out: string[] = [TEMPLATE.greeting(person.first || person.fullName), '', TEMPLATE.intro];
  if (overdue.length > 0) {
    out.push('', `${TEMPLATE.overdueHeading}:`, ...overdue.map(renderLine));
  }
  if (open.length > 0) {
    out.push('', `${TEMPLATE.openHeading}:`, ...open.map(renderLine));
  }
  out.push('', TEMPLATE.closing);
  return out.join('\n');
}
