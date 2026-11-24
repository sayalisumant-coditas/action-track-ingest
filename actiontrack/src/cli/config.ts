import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigError } from '../core/errors.js';
import { loadPeopleConfig, type PeopleConfig } from '../core/people/config.js';
import type { WarningInfo } from '../core/warnings.js';

export const DEFAULT_CONFIG_FILE = 'actiontrack.config.json';

export interface AppConfig {
  people: PeopleConfig;
  /** File names or globs treated as confidential. */
  confidentialMeetings: string[];
  mergeThreshold?: number;
  warnings: WarningInfo[];
}

/**
 * Read `--config <path>`, or `./actiontrack.config.json` when it exists. A missing default file
 * gives the defaults; an explicit path that does not exist is an error. Throws ConfigError.
 */
export function loadAppConfig(explicit: string | undefined, cwd: string): AppConfig {
  const file =
    explicit !== undefined ? path.resolve(cwd, explicit) : path.resolve(cwd, DEFAULT_CONFIG_FILE);
  if (explicit !== undefined && !existsSync(file)) {
    throw new ConfigError(file, 'config file not found');
  }
  const { config, warnings } = loadPeopleConfig(file); // throws ConfigError on bad JSON or shape
  const out: AppConfig = { people: config, confidentialMeetings: [], warnings };
  if (!existsSync(file)) return out;

  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> | null;
  if (raw && typeof raw === 'object') {
    const cm = raw.confidentialMeetings;
    if (cm !== undefined) {
      if (!Array.isArray(cm) || cm.some((x) => typeof x !== 'string')) {
        throw new ConfigError(file, '"confidentialMeetings" must be a list of file names or globs');
      }
      out.confidentialMeetings = cm as string[];
    }
    const mt = raw.mergeThreshold;
    if (mt !== undefined) {
      if (typeof mt !== 'number' || !Number.isFinite(mt) || mt < 0 || mt > 1) {
        throw new ConfigError(file, '"mergeThreshold" must be a number from 0 to 1');
      }
      out.mergeThreshold = mt;
    }
  }
  return out;
}
