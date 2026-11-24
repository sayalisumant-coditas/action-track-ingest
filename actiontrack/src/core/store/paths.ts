import path from 'node:path';

export const STORE_ENV = 'ACTIONTRACK_STORE';
export const DEFAULT_STORE_PATH = path.join('.actiontrack', 'store.json');

export interface StorePathOptions {
  /** Value of `--store`. */
  flag?: string | undefined;
  env?: Record<string, string | undefined>;
  cwd?: string;
}

/** `--store` wins over `ACTIONTRACK_STORE`, which wins over `./.actiontrack/store.json`. Always absolute. */
export function resolveStorePath(opts: StorePathOptions = {}): string {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const chosen = [opts.flag, env[STORE_ENV]].find((v) => v !== undefined && v.trim() !== '');
  return path.resolve(cwd, chosen ?? DEFAULT_STORE_PATH);
}
