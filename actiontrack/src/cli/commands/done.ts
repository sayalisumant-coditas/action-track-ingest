import { existsSync } from 'node:fs';
import { UsageError } from '../../core/errors.js';
import { markDone } from '../../core/store/overrides.js';
import { resolveStorePath } from '../../core/store/paths.js';
import { loadStore, saveStore } from '../../core/store/store.js';
import type { IO } from '../io.js';

export interface DoneArgs {
  id: string;
  store?: string;
}

/** Mark an item done (id or unique prefix). Marking twice is fine and exits 0. */
export async function runDone(a: DoneArgs, io: IO): Promise<number> {
  const storePath = resolveStorePath({ flag: a.store, env: io.env, cwd: io.cwd });
  if (!existsSync(storePath)) {
    throw new UsageError(`no store at ${storePath}; run "actiontrack ingest <folder>" first`);
  }
  const store = loadStore(storePath);
  const r = markDone(store, a.id, io.clock);
  if (r.changed) {
    saveStore(storePath, r.store);
    io.out(`marked done: ${r.item.id} ${r.item.task}`);
  } else {
    io.out(`already done: ${r.item.id} ${r.item.task}`);
  }
  return 0;
}
