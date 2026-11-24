import { daysOverdue, isOverdue } from '../query/status.js';
import { MISSING_FLAG } from '../store/store.js';
import type { ActionItem, ISODate, Meeting, Person } from '../types.js';
import { WarningCode, type WarningInfo } from '../warnings.js';
import type { Draft } from './gmail.js';
import { redactForConfidential } from './redact.js';
import { TEMPLATE, renderBody, type FollowupLine } from './render.js';
import { followupOrder } from './select.js';

/** Wording for the due date: the date, the text as written when it could not be read, or none. */
function dueText(item: ActionItem): string {
  if (item.due.date !== null) return `due ${item.due.date}`;
  if (item.due.raw !== null && item.due.raw.trim() !== '') return `due "${item.due.raw.trim()}"`;
  return 'no due date';
}

function toLine(item: ActionItem, asOf: ISODate, byId: Map<string, Meeting>): FollowupLine {
  // the latest occurrence is the last one: occurrences are stored in meeting order
  const last = item.occurrences[item.occurrences.length - 1];
  const m = last ? byId.get(last.meetingId) : undefined;
  const meeting = m ? (m.date ? `${m.title}, ${m.date}` : m.title) : (last?.sourceFile ?? '');
  const line: FollowupLine = {
    id: item.id,
    task: item.task,
    due: dueText(item),
    daysOverdue: daysOverdue(item, asOf),
    meeting,
  };
  if (item.flags.includes(MISSING_FLAG)) line.note = '(no longer in the notes)';
  return line;
}

/**
 * Build the email for one person from their selected items. Items from confidential meetings the
 * person did not attend are removed first, with a warning. Uses only task text and meeting
 * title/date. Pure and deterministic. When nothing is left, `itemIds` is empty.
 */
export function buildFollowup(
  person: Person,
  items: ActionItem[],
  asOf: ISODate,
  meetings: Meeting[],
): Draft {
  const warnings: WarningInfo[] = [];
  const redacted = redactForConfidential(items, person, meetings);
  warnings.push(...redacted.warnings);

  const sorted = [...redacted.items].sort(followupOrder(asOf));
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const overdue = sorted.filter((i) => isOverdue(i, asOf));
  const open = sorted.filter((i) => !isOverdue(i, asOf));

  const to = person.email ?? '';
  if (to === '') {
    warnings.push({
      code: WarningCode.MISSING_EMAIL,
      message: `no email address for ${person.fullName}; the draft has an empty To`,
    });
  }

  return {
    to,
    subject: TEMPLATE.subject(sorted.length, overdue.length),
    body: renderBody(
      person,
      overdue.map((i) => toLine(i, asOf, byId)),
      open.map((i) => toLine(i, asOf, byId)),
    ),
    itemIds: [...overdue, ...open].map((i) => i.id),
    warnings,
  };
}
