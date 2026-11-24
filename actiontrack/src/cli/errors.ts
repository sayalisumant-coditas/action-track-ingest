import {
  AmbiguousIdError,
  AmbiguousOwnerError,
  ConfigError,
  DrafterError,
  FolderError,
  InvalidIdError,
  StoreError,
  UnknownIdError,
  UsageError,
} from '../core/errors.js';

/** Message (what happened and what to do) for the errors the tool expects, else null. */
export function describeError(e: unknown): string | null {
  if (e instanceof FolderError) {
    return `${e.message}. Check the folder path and try again.`;
  }
  if (e instanceof StoreError) {
    return `${e.message}. The store file was not changed; fix or move it, or pick another with --store.`;
  }
  if (e instanceof ConfigError) {
    return `${e.message}. Fix the config file or pass another with --config.`;
  }
  if (e instanceof AmbiguousOwnerError) {
    return e.message;
  }
  if (e instanceof AmbiguousIdError) {
    return `${e.message}. Give a longer prefix.`;
  }
  if (e instanceof InvalidIdError) {
    return `${e.message}. Run "actiontrack list" to see ids.`;
  }
  if (e instanceof UnknownIdError) {
    return `${e.message}. Run "actiontrack list --status open" to see ids.`;
  }
  if (e instanceof DrafterError) {
    return `${e.message}. No draft was created.`;
  }
  if (e instanceof UsageError) {
    return `${e.message}. Run with --help for usage.`;
  }
  return null;
}

/**
 * Print an error to stderr and return the exit code (always 1). Expected errors get a message
 * with a hint; anything else gets one short line, plus the stack with `--verbose`.
 */
export function handleError(e: unknown, err: (t: string) => void, verbose = false): number {
  const known = describeError(e);
  if (known !== null) {
    err(`error: ${known}`);
  } else {
    const msg = e instanceof Error ? e.message : String(e);
    err(`error: unexpected problem: ${msg}`);
    if (verbose && e instanceof Error && e.stack) err(e.stack);
    else err('Run again with --verbose for details.');
  }
  return 1;
}
