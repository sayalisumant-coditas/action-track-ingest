import { ingest } from '../../core/ingest.js';
import { exitCodeFor } from '../../core/report.js';
import { resolveStorePath } from '../../core/store/paths.js';
import { loadAppConfig } from '../config.js';
import { renderReport } from '../format.js';
import type { IO } from '../io.js';

export interface IngestArgs {
  folder: string;
  recursive?: boolean;
  verbose?: boolean;
  json?: boolean;
  store?: string;
  config?: string;
}

/** Run `ingest`; returns the exit code. Per-file problems never make it non-zero. */
export async function runIngest(a: IngestArgs, io: IO): Promise<number> {
  const cfg = loadAppConfig(a.config, io.cwd);
  const report = await ingest(a.folder, {
    store: resolveStorePath({ flag: a.store, env: io.env, cwd: io.cwd }),
    config: cfg.people,
    confidentialPatterns: cfg.confidentialMeetings,
    ...(cfg.mergeThreshold === undefined ? {} : { mergeThreshold: cfg.mergeThreshold }),
    recursive: a.recursive ?? false,
    clock: io.clock,
  });
  if (a.json) io.out(JSON.stringify(report, null, 2));
  else {
    for (const w of cfg.warnings) io.err(`warning: ${w.code}: ${w.message}`);
    io.out(renderReport(report, a.verbose ?? false));
  }
  return exitCodeFor(report);
}
