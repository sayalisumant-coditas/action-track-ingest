import { existsSync } from 'node:fs';
import path from 'node:path';
import { UsageError } from '../../core/errors.js';
import { FileGmailDrafter } from '../../core/followup/fileGmail.js';
import { followup } from '../../core/followup/followup.js';
import type { GmailDrafter } from '../../core/followup/gmail.js';
import { McpGmailDrafter } from '../../core/followup/mcpGmail.js';
import { parseFilters } from '../../core/query/list.js';
import { resolveStorePath } from '../../core/store/paths.js';
import { loadAppConfig } from '../config.js';
import { renderDraft } from '../format.js';
import type { IO } from '../io.js';

export interface FollowupArgs {
  owner: string;
  dryRun?: boolean;
  includeGroup?: boolean;
  replace?: boolean;
  gmail?: string;
  asOf?: string;
  store?: string;
  config?: string;
}

export const GMAIL_MODES = ['mock', 'mcp'] as const;

/** Build a follow-up draft for one owner. Drafts go to the mock folder next to the store by default. */
export async function runFollowup(a: FollowupArgs, io: IO): Promise<number> {
  const mode = (a.gmail ?? 'mock').toLowerCase();
  if (!(GMAIL_MODES as readonly string[]).includes(mode)) {
    throw new UsageError(`--gmail must be one of ${GMAIL_MODES.join(', ')} (got "${a.gmail}")`);
  }
  const { asOf } = parseFilters({ asOf: a.asOf }, io.clock);
  const storePath = resolveStorePath({ flag: a.store, env: io.env, cwd: io.cwd });
  if (!existsSync(storePath)) {
    throw new UsageError(`no store at ${storePath}; run "actiontrack ingest <folder>" first`);
  }
  const cfg = loadAppConfig(a.config, io.cwd);
  const drafter: GmailDrafter =
    mode === 'mcp'
      ? new McpGmailDrafter()
      : new FileGmailDrafter(path.join(path.dirname(storePath), 'drafts'), io.clock);

  const r = await followup(a.owner, {
    storePath,
    drafter,
    asOf,
    clock: io.clock,
    config: cfg.people,
    dryRun: a.dryRun ?? false,
    includeGroup: a.includeGroup ?? false,
    replace: a.replace ?? false,
  });
  for (const n of r.notices) io.err(`note: ${n}`);

  switch (r.kind) {
    case 'no-items':
      io.out(`no open items for ${r.person.fullName}`);
      break;
    case 'dry-run':
      io.out(renderDraft(r.draft));
      io.out('\n(dry run: nothing was created)');
      break;
    case 'exists':
      io.err(
        `warning: a draft for ${r.person.fullName} already exists (${r.existing.draftId}, ${r.existing.createdAt}); nothing created. Use --replace to make a new one.`,
      );
      break;
    case 'created':
      for (const w of r.draft.warnings) io.err(`warning: ${w.code}: ${w.message}`);
      io.out(`draft created for ${r.person.fullName}: ${r.draftId}`);
      break;
  }
  return 0;
}
