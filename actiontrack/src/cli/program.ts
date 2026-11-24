import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { DATE_RULES_HELP } from '../core/dates/resolveDue.js';
import { runDone } from './commands/done.js';
import { runFollowup } from './commands/followup.js';
import { runIngest } from './commands/ingest.js';
import { runList } from './commands/list.js';
import { handleError } from './errors.js';
import { defaultIO, type IO } from './io.js';

function version(): string {
  try {
    const url = new URL('../../package.json', import.meta.url);
    return (JSON.parse(readFileSync(url, 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

/** The `commander` program. Commands only parse options and call the core; no logic lives here. */
export function buildProgram(io: IO = defaultIO()): Command {
  const program = new Command('actiontrack')
    .description('Extract and track action items from meeting notes')
    .version(version())
    .option(
      '--store <path>',
      'store file (default ./.actiontrack/store.json, or ACTIONTRACK_STORE)',
    )
    .option('--config <path>', 'config file (default ./actiontrack.config.json if present)')
    .option('--no-color', 'never use colour')
    .addHelpText('after', `\n${DATE_RULES_HELP}`)
    .showHelpAfterError('(run with --help for usage)');

  /** Run a command body; turn any error into a message and exit code 1. */
  const run =
    <A extends unknown[]>(fn: (...args: A) => Promise<number>) =>
    async (...args: A): Promise<void> => {
      const cmd = args[args.length - 1] as Command;
      const verbose = (cmd.optsWithGlobals() as { verbose?: boolean }).verbose === true;
      try {
        process.exitCode = await fn(...args);
      } catch (e) {
        process.exitCode = handleError(e, io.err, verbose);
      }
    };
  const opts = (cmd: Command) => cmd.optsWithGlobals() as Record<string, unknown>;

  program
    .command('ingest')
    .description('read a folder of meeting notes and update the store')
    .argument('<folder>', 'folder with .md notes')
    .option('--recursive', 'include sub-folders')
    .option('--verbose', 'show every warning and ignored line')
    .option('--json', 'print the report as JSON')
    .action(
      run((folder: string, _o: unknown, cmd: Command) => runIngest({ ...opts(cmd), folder }, io)),
    );

  program
    .command('list')
    .description('list action items (not done by default)')
    .option('--owner <name>', 'a person, a first name, "none" (unassigned) or "everyone"')
    .option('--status <status>', 'open | done | overdue')
    .option('--due-before <date>', 'due strictly before this date (YYYY-MM-DD)')
    .option('--as-of <date>', 'treat this date as today (YYYY-MM-DD)')
    .option('--json', 'print JSON rows')
    .action(run((_o: unknown, cmd: Command) => runList(opts(cmd), io)));

  program
    .command('done')
    .description('mark an item done (id or unique id prefix)')
    .argument('<id>', 'item id or prefix')
    .action(run((id: string, _o: unknown, cmd: Command) => runDone({ ...opts(cmd), id }, io)));

  program
    .command('followup')
    .description("create a Gmail draft listing one person's open items (never mails it)")
    .argument('<owner>', 'full name, or a first name if it is unique')
    .option('--dry-run', 'show the draft; create nothing')
    .option('--include-group', 'also include "everyone" items from meetings they attended')
    .option('--replace', 'make a new draft even if one was already made')
    .option('--gmail <mode>', 'mock | mcp (default mock)')
    .option('--as-of <date>', 'treat this date as today (YYYY-MM-DD)')
    .action(
      run((owner: string, _o: unknown, cmd: Command) => runFollowup({ ...opts(cmd), owner }, io)),
    );

  return program;
}
