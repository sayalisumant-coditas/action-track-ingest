import { isISODate } from '../dates/iso.js';
import { UsageError } from '../errors.js';
import type { PeopleConfig } from '../people/config.js';
import { buildDirectory, findOnePerson, type Directory } from '../people/directory.js';
import { applyOverrides } from '../store/overrides.js';
import type { Store } from '../store/store.js';
import type { ActionItem, ISODate } from '../types.js';
import type { Clock } from '../warnings.js';
import { effectiveStatus, isOverdue } from './status.js';

export const STATUS_VALUES = ['open', 'done', 'overdue'] as const;
export type StatusFilter = (typeof STATUS_VALUES)[number];

export interface QueryFilters {
  /** Name, first name, `First I.`, `none` (unassigned) or `everyone` (group). */
  owner?: string;
  /** Default: every item that is not done. */
  status?: StatusFilter;
  /** Strictly before this date; items with no due date are excluded. */
  dueBefore?: ISODate;
}

export interface QueryResult {
  items: ActionItem[];
  /** Remarks for the user, e.g. an owner name nobody has. */
  notices: string[];
}

export interface RawFilterArgs {
  owner?: string | undefined;
  status?: string | undefined;
  dueBefore?: string | undefined;
  asOf?: string | undefined;
}

/**
 * Validate command-line values. `asOf` comes from `--as-of`, else from the injected clock.
 * Throws UsageError naming the flag and the valid values.
 */
export function parseFilters(
  args: RawFilterArgs,
  clock: Clock,
): { filters: QueryFilters; asOf: ISODate } {
  const filters: QueryFilters = {};

  if (args.owner !== undefined) {
    if (args.owner.trim() === '') throw new UsageError('--owner needs a name (or "none")');
    filters.owner = args.owner.trim();
  }
  if (args.status !== undefined) {
    const s = args.status.trim().toLowerCase();
    if (!(STATUS_VALUES as readonly string[]).includes(s)) {
      throw new UsageError(
        `--status must be one of ${STATUS_VALUES.join(', ')} (got "${args.status}")`,
      );
    }
    filters.status = s as StatusFilter;
  }
  if (args.dueBefore !== undefined) {
    if (!isISODate(args.dueBefore.trim())) {
      throw new UsageError(`--due-before must be a date like 2026-10-01 (got "${args.dueBefore}")`);
    }
    filters.dueBefore = args.dueBefore.trim();
  }
  let asOf: ISODate;
  if (args.asOf !== undefined) {
    if (!isISODate(args.asOf.trim())) {
      throw new UsageError(`--as-of must be a date like 2026-10-15 (got "${args.asOf}")`);
    }
    asOf = args.asOf.trim();
  } else {
    asOf = clock().toISOString().slice(0, 10);
  }
  return { filters, asOf };
}

/** Items as every read path should see them: `done` overrides applied. */
export const itemsOf = (store: Store): ActionItem[] => applyOverrides(store.items, store.overrides);

/** The people directory for a store (from every meeting's attendees, plus config people). */
export const directoryOf = (
  store: Pick<Store, 'meetings'>,
  config?: Pick<PeopleConfig, 'people'>,
): Directory => buildDirectory(store.meetings, config);

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Name used to order items: people by full name, then group/ambiguous text; unassigned last. */
function ownerSortName(item: ActionItem, dir: Directory): string {
  const o = item.owner;
  if (o.kind === 'person') {
    const names = o.people.map((id) => dir.people.find((p) => p.id === id)?.fullName ?? id);
    return names.join(' & ').toLowerCase();
  }
  if (o.kind === 'unassigned') return '￿';
  return `${o.kind === 'ambiguous' ? '?' : ''}${o.raw}`.toLowerCase();
}

/**
 * Filter and sort items. Filters are AND-ed. Pure: no I/O, no clock (the caller passes `asOf`),
 * and the input is not modified. Throws AmbiguousOwnerError when a first name matches several
 * people. Items must already have overrides applied (see `itemsOf`).
 */
export function queryWithNotices(
  items: ActionItem[],
  filters: QueryFilters,
  dir: Directory,
  asOf: ISODate,
): QueryResult {
  const notices: string[] = [];
  let ownerTest: ((i: ActionItem) => boolean) | null = null;

  if (filters.owner !== undefined) {
    const found = findOnePerson(filters.owner, dir); // throws AmbiguousOwnerError
    if (found === 'none') ownerTest = (i) => i.owner.kind === 'unassigned';
    else if (found === 'group') ownerTest = (i) => i.owner.kind === 'group';
    else if (found === null) {
      notices.push(`no such person: "${filters.owner}"`);
      return { items: [], notices };
    } else {
      const id = found.id;
      ownerTest = (i) =>
        (i.owner.kind === 'person' && i.owner.people.includes(id)) ||
        (i.owner.kind === 'ambiguous' && i.owner.candidates.includes(id));
    }
  }

  const statusTest = (i: ActionItem): boolean => {
    const s = effectiveStatus(i, asOf);
    switch (filters.status) {
      case 'done':
        return s === 'done';
      case 'overdue':
        return s === 'overdue';
      default:
        return s !== 'done'; // "open" includes overdue (Q4)
    }
  };

  const before = filters.dueBefore;
  const kept = items.filter(
    (i) =>
      statusTest(i) &&
      (ownerTest === null || ownerTest(i)) &&
      (before === undefined || (i.due.date !== null && i.due.date < before)),
  );

  const sorted = kept
    .map((item) => ({
      item,
      overdue: isOverdue(item, asOf) ? 0 : 1,
      due: item.due.date,
      owner: ownerSortName(item, dir),
    }))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue - b.overdue;
      if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : cmp(a.due, b.due);
      return cmp(a.owner, b.owner) || cmp(a.item.id, b.item.id);
    })
    .map((x) => x.item);

  return { items: sorted, notices };
}

/** `queryWithNotices` without the notices. */
export function queryItems(
  items: ActionItem[],
  filters: QueryFilters,
  dir: Directory,
  asOf: ISODate,
): ActionItem[] {
  return queryWithNotices(items, filters, dir, asOf).items;
}
