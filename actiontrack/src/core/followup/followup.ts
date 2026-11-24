import { UsageError } from '../errors.js';
import type { PeopleConfig } from '../people/config.js';
import { findOnePerson } from '../people/directory.js';
import { directoryOf, itemsOf } from '../query/list.js';
import { getDraft, loadStore, recordDraft, saveStore, type DraftRecord } from '../store/store.js';
import type { ISODate, Person } from '../types.js';
import type { Clock } from '../warnings.js';
import { buildFollowup } from './build.js';
import type { Draft, GmailDrafter } from './gmail.js';
import { selectItemsFor } from './select.js';

export interface FollowupOptions {
  storePath: string;
  drafter: GmailDrafter;
  asOf: ISODate;
  clock: Clock;
  config?: Pick<PeopleConfig, 'people'>;
  dryRun?: boolean;
  includeGroup?: boolean;
  /** Make a new draft even if one was already recorded for this person. */
  replace?: boolean;
}

export type FollowupResult =
  /** Nothing open for this person (F-FUP-6). */
  | { kind: 'no-items'; person: Person; notices: string[] }
  /** `--dry-run`: the draft is shown only. */
  | { kind: 'dry-run'; person: Person; draft: Draft; notices: string[] }
  /** A draft already exists and `replace` was not given (F-FUP-7). */
  | { kind: 'exists'; person: Person; draft: Draft; existing: DraftRecord; notices: string[] }
  | { kind: 'created'; person: Person; draft: Draft; draftId: string; notices: string[] };

/**
 * Build and (unless dry-run) create a Gmail draft for one owner. Refuses an ambiguous first name
 * (AmbiguousOwnerError), an unknown person, and `none`/`everyone` (UsageError). The draft id is
 * recorded only after the drafter succeeded, so a failing drafter leaves the store unchanged.
 */
export async function followup(query: string, opts: FollowupOptions): Promise<FollowupResult> {
  if (query.trim() === '') throw new UsageError('followup needs a person name');
  const store = loadStore(opts.storePath);
  const dir = directoryOf(store, opts.config);

  const found = findOnePerson(query, dir); // throws AmbiguousOwnerError listing every match
  if (found === 'none' || found === 'group') {
    throw new UsageError(`"${query.trim()}" is not a person; follow-ups go to one named person`);
  }
  if (found === null) throw new UsageError(`no such person: "${query.trim()}"`);
  const person = found;

  const items = itemsOf(store);
  const notices: string[] = [];
  const leftOut = items.filter(
    (i) =>
      i.status !== 'done' && i.owner.kind === 'ambiguous' && i.owner.candidates.includes(person.id),
  ).length;
  if (leftOut > 0) {
    notices.push(
      `${leftOut} item${leftOut === 1 ? '' : 's'} with an unclear owner (could be ${person.fullName}) left out; resolve them in the config aliases`,
    );
  }

  const selected = selectItemsFor(person, items, opts.asOf, {
    includeGroup: opts.includeGroup ?? false,
    meetings: store.meetings,
  });
  const draft = buildFollowup(person, selected, opts.asOf, store.meetings);
  if (draft.itemIds.length === 0) return { kind: 'no-items', person, notices };

  if (opts.dryRun) return { kind: 'dry-run', person, draft, notices };

  const existing = getDraft(store, person.id);
  if (existing && !opts.replace) return { kind: 'exists', person, draft, existing, notices };

  const { draftId } = await opts.drafter.createDraft(draft);
  saveStore(opts.storePath, recordDraft(store, person.id, draftId, opts.clock));
  return { kind: 'created', person, draft, draftId, notices };
}
