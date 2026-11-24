import { existsSync } from 'node:fs';
import { UsageError } from '../../core/errors.js';
import { directoryOf, itemsOf, parseFilters, queryWithNotices } from '../../core/query/list.js';
import { resolveStorePath } from '../../core/store/paths.js';
import { loadStore } from '../../core/store/store.js';
import { loadAppConfig } from '../config.js';
import { colour, jsonRow, plain, renderTable, useColour } from '../format.js';
import type { IO } from '../io.js';

export interface ListArgs {
  owner?: string;
  status?: string;
  dueBefore?: string;
  asOf?: string;
  json?: boolean;
  store?: string;
  config?: string;
  color?: boolean;
}

export async function runList(a: ListArgs, io: IO): Promise<number> {
  const storePath = resolveStorePath({ flag: a.store, env: io.env, cwd: io.cwd });
  const { filters, asOf } = parseFilters(a, io.clock); // validate before touching the store
  if (!existsSync(storePath)) {
    throw new UsageError(`no store at ${storePath}; run "actiontrack ingest <folder>" first`);
  }
  const store = loadStore(storePath);
  const cfg = loadAppConfig(a.config, io.cwd);
  const dir = directoryOf(store, cfg.people);
  const { items, notices } = queryWithNotices(itemsOf(store), filters, dir, asOf);

  if (a.json) {
    io.out(
      JSON.stringify(
        items.map((i) => jsonRow(i, dir, asOf)),
        null,
        2,
      ),
    );
    for (const n of notices) io.err(`note: ${n}`);
    return 0;
  }
  for (const n of notices) io.err(`note: ${n}`);
  if (items.length === 0) {
    io.out('no matching items');
    return 0;
  }
  const style = useColour({ isTTY: io.isTTY, noColor: a.color === false, env: io.env })
    ? colour
    : plain;
  io.out(renderTable(items, dir, asOf, { columns: io.columns, style }));
  return 0;
}
