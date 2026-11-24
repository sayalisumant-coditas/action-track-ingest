import { AmbiguousIdError, InvalidIdError, UnknownIdError } from '../errors.js';
import type { ActionItem } from '../types.js';
import type { Clock } from '../warnings.js';
import type { Overrides, Store } from './store.js';

/**
 * A `done` override beats the notes. Pure: returns new items, never mutates the input.
 * Overrides for ids that no longer exist are ignored. An item the notes already show as done keeps
 * `doneBy: 'notes'`.
 */
export function applyOverrides(items: ActionItem[], overrides: Overrides): ActionItem[] {
  return items.map((item) => {
    const o = Object.hasOwn(overrides, item.id) ? overrides[item.id] : undefined;
    if (!o || o.status !== 'done' || item.status === 'done') return item;
    return { ...item, status: 'done', doneAt: o.doneAt, doneBy: 'cli' };
  });
}

/** Resolve a full id or a unique prefix (at least 2 characters, case-insensitive) to a full id. */
export function resolveId(items: ActionItem[], idOrPrefix: string): string {
  const q = (idOrPrefix ?? '').trim().toLowerCase();
  if (q === '') throw new UnknownIdError(idOrPrefix ?? '');
  if (items.some((i) => i.id === q)) return q;
  if (q.length < 2) throw new InvalidIdError(idOrPrefix);
  const matches = items.map((i) => i.id).filter((id) => id.startsWith(q));
  if (matches.length === 0) throw new UnknownIdError(idOrPrefix);
  if (matches.length > 1) throw new AmbiguousIdError(q, matches.sort());
  return matches[0] as string;
}

export interface MarkDoneResult {
  store: Store;
  item: ActionItem;
  changed: boolean;
}

/**
 * Mark an item done by id or unique prefix. Idempotent: an item that is already done (override or
 * notes) gives `changed = false` and the store is returned as is. Does not mutate the input store.
 */
export function markDone(store: Store, idOrPrefix: string, clock: Clock): MarkDoneResult {
  const id = resolveId(store.items, idOrPrefix);
  const item = applyOverrides(store.items, store.overrides).find((i) => i.id === id) as ActionItem;
  if (item.status === 'done') return { store, item, changed: false };

  const doneAt = clock().toISOString();
  const next: Store = {
    ...store,
    overrides: { ...store.overrides, [id]: { status: 'done', doneAt } },
  };
  return {
    store: next,
    item: { ...item, status: 'done', doneAt, doneBy: 'cli' },
    changed: true,
  };
}
