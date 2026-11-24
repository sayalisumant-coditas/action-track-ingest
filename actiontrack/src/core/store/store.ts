import fs from 'node:fs';
import path from 'node:path';
import { StoreError } from '../errors.js';
import type { ActionItem, IngestReport, Meeting, Occurrence } from '../types.js';
import type { Clock } from '../warnings.js';
import { idText } from './ids.js';
import { applyOverrides } from './overrides.js';

export const STORE_VERSION = 1;
export const MISSING_FLAG = 'missing-from-notes';

export interface DoneOverride {
  status: 'done';
  doneAt: string;
}
export type Overrides = Record<string, DoneOverride>;

export interface DraftRecord {
  draftId: string;
  createdAt: string;
}
export type Drafts = Record<string, DraftRecord>;

export interface Store {
  version: 1;
  meetings: Meeting[];
  items: ActionItem[];
  overrides: Overrides;
  drafts: Drafts;
  lastIngest?: { at: string; report: IngestReport };
}

export function emptyStore(): Store {
  return { version: STORE_VERSION, meetings: [], items: [], overrides: {}, drafts: {} };
}

/** Upgrade an older store to the current version. Only v1 exists, so this just checks it. */
export function migrate(raw: unknown): Store {
  const version = (raw as { version?: unknown } | null)?.version;
  if (version !== STORE_VERSION) {
    throw new StoreError(`unsupported store version ${JSON.stringify(version)} (expected 1)`);
  }
  return raw as Store;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// ---- load ------------------------------------------------------------------------------------

/**
 * Missing file gives an empty store (and creates nothing). A bad file (empty, invalid JSON,
 * unknown version, wrong shape, a directory) throws StoreError and is never modified.
 */
export function loadStore(file: string): Store {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
    throw new StoreError(`cannot read store ${file}: ${(e as Error).message}`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.trim() === '') throw new StoreError(`store file is empty: ${file}`);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new StoreError(`store file is not valid JSON: ${file} (${(e as Error).message})`);
  }
  if (!isRecord(raw)) throw new StoreError(`store file has the wrong shape: ${file}`);
  let store: Store;
  try {
    store = migrate(raw);
  } catch (e) {
    throw new StoreError(`${(e as Error).message}: ${file}`);
  }
  const s = store as unknown as Record<string, unknown>;
  const ok =
    Array.isArray(s.meetings) &&
    Array.isArray(s.items) &&
    isRecord(s.overrides) &&
    isRecord(s.drafts) &&
    (s.lastIngest === undefined || isRecord(s.lastIngest));
  if (!ok) throw new StoreError(`store file has the wrong shape: ${file}`);
  return store;
}

// ---- save ------------------------------------------------------------------------------------

/** The file operations `saveStore` uses; injectable so tests can simulate a crash or EPERM. */
export interface StoreIO {
  mkdir(dir: string): void;
  writeFile(file: string, data: string): void;
  rename(from: string, to: string): void;
  copyFile(from: string, to: string): void;
  unlink(file: string): void;
}

export const nodeIO: StoreIO = {
  mkdir: (dir) => void fs.mkdirSync(dir, { recursive: true }),
  writeFile: (file, data) => fs.writeFileSync(file, data, 'utf8'),
  rename: (a, b) => fs.renameSync(a, b),
  copyFile: (a, b) => fs.copyFileSync(a, b),
  unlink: (file) => fs.unlinkSync(file),
};

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Recursively sort object keys; arrays keep their order. */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isRecord(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort(cmp)) {
      if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    }
    return out;
  }
  return v;
}

/** Items in (meeting date, file, line) order; undated meetings last. */
export function sortItems(items: ActionItem[], meetings: Meeting[]): ActionItem[] {
  const dateOf = new Map(meetings.map((m) => [m.id, m.date]));
  const key = (i: ActionItem) => {
    const o = i.occurrences[0];
    const d = o ? (dateOf.get(o.meetingId) ?? null) : null;
    return { d, f: o?.sourceFile ?? '', l: o?.line ?? 0 };
  };
  return [...items].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x.d !== y.d) return x.d === null ? 1 : y.d === null ? -1 : cmp(x.d, y.d);
    return cmp(x.f, y.f) || x.l - y.l || cmp(a.id, b.id);
  });
}

/** Stable text form: fixed top-level order, sorted nested keys, 2-space indent, final newline. */
export function serialiseStore(store: Store): string {
  const top: Record<string, unknown> = {
    version: store.version,
    meetings: [...store.meetings].sort((a, b) => cmp(a.sourceFile, b.sourceFile)),
    items: sortItems(store.items, store.meetings),
    overrides: store.overrides,
    drafts: store.drafts,
  };
  if (store.lastIngest) top.lastIngest = store.lastIngest;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(top)) out[k] = sortKeys(top[k]);
  return JSON.stringify(out, null, 2) + '\n';
}

/**
 * The only function that writes the store file. Writes a temp file in the same folder, then
 * renames it over the target, so the old store stays intact until the new one is complete. If the
 * rename is refused (Windows), falls back to copy + unlink. Throws StoreError on failure and
 * removes the temp file.
 */
export function saveStore(file: string, store: Store, io: StoreIO = nodeIO): void {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const text = serialiseStore(store);
  try {
    io.mkdir(dir);
    io.writeFile(tmp, text);
  } catch (e) {
    cleanup(io, tmp);
    throw new StoreError(`cannot write store ${file}: ${(e as Error).message}`);
  }
  try {
    io.rename(tmp, file);
    return;
  } catch {
    // fall through to copy + unlink
  }
  try {
    io.copyFile(tmp, file);
    io.unlink(tmp);
  } catch (e) {
    cleanup(io, tmp);
    throw new StoreError(`cannot write store ${file}: ${(e as Error).message}`);
  }
}

function cleanup(io: StoreIO, tmp: string): void {
  try {
    io.unlink(tmp);
  } catch {
    // nothing to remove
  }
}

// ---- ingest ----------------------------------------------------------------------------------

export interface ApplyIngestOptions {
  /**
   * When true the ingested folder is merged into the store: files that are not part of this
   * ingest are left exactly as they are. Default false: the store is taken to belong to this
   * folder, so a stored line whose file is gone or whose line was removed is flagged.
   */
  mergeFolders?: boolean;
}

const occKey = (o: Occurrence) => `${o.sourceFile}\n${idText(o.rawLine)}`;

/**
 * Replace meetings and items with those from the ingested files; keep `overrides` and `drafts`.
 * Stored items whose line has gone from the notes are kept with flag `missing-from-notes` (and
 * their lost occurrences marked `missing`), never deleted. An ingest that found nothing leaves
 * meetings and items alone. Pure: the input store is not modified.
 */
export function applyIngest(
  store: Store,
  meetings: Meeting[],
  items: ActionItem[],
  report: IngestReport,
  clock: Clock,
  opts: ApplyIngestOptions = {},
): Store {
  const lastIngest = { at: clock().toISOString(), report };
  if (meetings.length === 0 && items.length === 0) {
    return { ...store, lastIngest };
  }

  const newFiles = new Set(meetings.map((m) => m.sourceFile));
  const inScope = (file: string) => newFiles.has(file) || !opts.mergeFolders;
  const newById = new Map(items.map((i) => [i.id, i]));
  const prevIds = new Set(store.items.map((i) => i.id));
  // positions of genuinely new ids: an old item sitting there was edited, not removed
  const newAt = new Set<string>();
  for (const i of items) {
    if (prevIds.has(i.id)) continue;
    for (const o of i.occurrences) newAt.add(`${o.sourceFile}\n${o.line}`);
  }

  const result: ActionItem[] = [];
  for (const old of store.items) {
    const fresh = newById.get(old.id);
    if (fresh) {
      result.push(carryMissing(old, fresh, inScope));
      continue;
    }
    if (old.occurrences.some((o) => newAt.has(`${o.sourceFile}\n${o.line}`))) continue;
    if (!old.occurrences.some((o) => inScope(o.sourceFile))) {
      result.push(old); // belongs to a folder that was not ingested
      continue;
    }
    result.push({
      ...old,
      flags: old.flags.includes(MISSING_FLAG) ? old.flags : [...old.flags, MISSING_FLAG],
      occurrences: old.occurrences.map((o) =>
        inScope(o.sourceFile) ? { ...o, missing: true } : o,
      ),
    });
  }
  const kept = new Set(result.map((i) => i.id));
  for (const i of items) if (!kept.has(i.id)) result.push(i);

  const mergedMeetings = [
    ...store.meetings.filter((m) => !newFiles.has(m.sourceFile)),
    ...meetings,
  ].sort((a, b) => cmp(a.sourceFile, b.sourceFile));

  return {
    ...store,
    meetings: mergedMeetings,
    items: sortItems(applyOverrides(result, store.overrides), mergedMeetings),
    lastIngest,
  };
}

/** A re-ingested item keeps stored occurrences whose line has gone, marked `missing`. */
function carryMissing(
  old: ActionItem,
  fresh: ActionItem,
  inScope: (f: string) => boolean,
): ActionItem {
  const present = new Set(fresh.occurrences.map(occKey));
  const lost = old.occurrences
    .filter((o) => !present.has(occKey(o)))
    .map((o) => (inScope(o.sourceFile) ? { ...o, missing: true } : o));
  return lost.length === 0 ? fresh : { ...fresh, occurrences: [...fresh.occurrences, ...lost] };
}

// ---- drafts ----------------------------------------------------------------------------------

/** Remember the Gmail draft made for a person; replaces an earlier record. */
export function recordDraft(store: Store, personId: string, draftId: string, clock: Clock): Store {
  if (personId.trim() === '' || personId.startsWith('?')) {
    throw new StoreError(`cannot record a draft for "${personId}": owner is not a single person`);
  }
  return {
    ...store,
    drafts: { ...store.drafts, [personId]: { draftId, createdAt: clock().toISOString() } },
  };
}

export function getDraft(store: Store, personId: string): DraftRecord | undefined {
  return Object.hasOwn(store.drafts, personId) ? store.drafts[personId] : undefined;
}
