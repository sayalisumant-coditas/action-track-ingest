import { isISODate } from '../dates/iso.js';
import type { ActionItem, ISODate } from '../types.js';

export type EffectiveStatus = 'open' | 'done' | 'overdue';

const DAY_MS = 86_400_000;

const dayNumber = (d: ISODate): number => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day) / DAY_MS;
};

/** Open, past due (strictly before `asOf`) and with a real due date. Items with no date never are. */
export function isOverdue(item: ActionItem, asOf: ISODate): boolean {
  const due = item.due.date;
  return item.status !== 'done' && due !== null && isISODate(due) && due < asOf;
}

/** `done` beats everything; then `overdue`; else `open`. */
export function effectiveStatus(item: ActionItem, asOf: ISODate): EffectiveStatus {
  if (item.status === 'done') return 'done';
  return isOverdue(item, asOf) ? 'overdue' : 'open';
}

/** Whole days past due (UTC maths, so DST does not matter), or 0. */
export function daysOverdue(item: ActionItem, asOf: ISODate): number {
  const due = item.due.date;
  if (!isOverdue(item, asOf) || due === null) return 0;
  return dayNumber(asOf) - dayNumber(due);
}
