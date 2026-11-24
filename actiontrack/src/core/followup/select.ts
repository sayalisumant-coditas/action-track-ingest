import { attendeeMatchName } from '../parse/meeting.js';
import { personId } from '../people/directory.js';
import { isOverdue } from '../query/status.js';
import type { ActionItem, ISODate, Meeting, Person } from '../types.js';

export interface SelectOptions {
  /** Also include items owned by "everyone"/"team" (default false). */
  includeGroup?: boolean;
  /** Needed to check attendance for group items; without it every group item is included. */
  meetings?: Meeting[];
}

/** True when `person` is in the meeting's attendee list. */
export function attended(person: Person, meeting: Pick<Meeting, 'attendees'>): boolean {
  return meeting.attendees.some((a) => personId(attendeeMatchName(a)) === person.id);
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Overdue first, then due date ascending (no date last), then id. */
export function followupOrder(asOf: ISODate) {
  return (a: ActionItem, b: ActionItem): number => {
    const oa = isOverdue(a, asOf) ? 0 : 1;
    const ob = isOverdue(b, asOf) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const da = a.due.date;
    const db = b.due.date;
    if (da !== db) return da === null ? 1 : db === null ? -1 : cmp(da, db);
    return cmp(a.id, b.id);
  };
}

/**
 * Open items this person owns (joint owners included, helpers not). Ambiguous and unassigned items
 * are never selected. Group items only with `includeGroup`, and then only for people who attended
 * the meeting. Pure: the input is not modified.
 */
export function selectItemsFor(
  person: Person,
  items: ActionItem[],
  asOf: ISODate,
  opts: SelectOptions = {},
): ActionItem[] {
  const meetingById = new Map((opts.meetings ?? []).map((m) => [m.id, m]));
  const groupOk = (item: ActionItem): boolean => {
    if (!opts.includeGroup || !opts.meetings) return opts.includeGroup === true;
    return item.occurrences.some((o) => {
      const m = meetingById.get(o.meetingId);
      return m !== undefined && attended(person, m);
    });
  };

  return items
    .filter((i) => {
      if (i.status === 'done') return false;
      if (i.owner.kind === 'person') return i.owner.people.includes(person.id);
      if (i.owner.kind === 'group') return groupOk(i);
      return false;
    })
    .sort(followupOrder(asOf));
}
