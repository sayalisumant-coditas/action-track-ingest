import { existsSync, readFileSync } from 'node:fs';
import { ConfigError } from '../errors.js';
import { WarningCode, type WarningInfo } from '../warnings.js';

export interface ConfigPerson {
  fullName: string;
  email?: string;
}

export interface PeopleConfig {
  people: ConfigPerson[];
  /** Alias text (lower-cased) to full name, for every meeting. */
  globalAliases: Record<string, string>;
  /** Note file name to alias text (lower-cased) to full name. */
  fileAliases: Record<string, Record<string, string>>;
}

export const defaultPeopleConfig = (): PeopleConfig => ({
  people: [],
  globalAliases: {},
  fileAliases: {},
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate the parsed JSON of a config file. Only `people` and `aliases` are read; other keys are
 * ignored. `aliases` maps either `"Priya": "Priya Shah"` (global) or
 * `"<note file>": {"Priya": "Priya Nair"}` (that file only).
 * Throws ConfigError with a message naming the key. A bad email is a warning, not an error.
 */
export function parsePeopleConfig(
  raw: unknown,
  source = 'config',
): { config: PeopleConfig; warnings: WarningInfo[] } {
  const config = defaultPeopleConfig();
  const warnings: WarningInfo[] = [];
  if (raw === undefined || raw === null) return { config, warnings };
  if (!isObject(raw)) throw new ConfigError(source, 'top level must be an object');

  if (raw.people !== undefined) {
    if (!Array.isArray(raw.people)) throw new ConfigError(source, '"people" must be an array');
    raw.people.forEach((p: unknown, i: number) => {
      if (!isObject(p) || typeof p.fullName !== 'string' || p.fullName.trim() === '')
        throw new ConfigError(source, `people[${i}] needs a non-empty "fullName"`);
      const person: ConfigPerson = { fullName: p.fullName.replace(/\s+/g, ' ').trim() };
      if (p.email !== undefined) {
        if (typeof p.email === 'string' && EMAIL.test(p.email)) person.email = p.email;
        else {
          warnings.push({
            code: WarningCode.MISSING_EMAIL,
            message: `people[${i}] (${person.fullName}): invalid email ${JSON.stringify(p.email)}; ignored`,
          });
        }
      }
      config.people.push(person);
    });
  }

  if (raw.aliases !== undefined) {
    if (!isObject(raw.aliases)) throw new ConfigError(source, '"aliases" must be an object');
    for (const [key, value] of Object.entries(raw.aliases)) {
      if (typeof value === 'string') {
        config.globalAliases[key.trim().toLowerCase()] = value.replace(/\s+/g, ' ').trim();
      } else if (isObject(value)) {
        const scoped: Record<string, string> = {};
        for (const [alias, full] of Object.entries(value)) {
          if (typeof full !== 'string')
            throw new ConfigError(
              source,
              `aliases["${key}"]["${alias}"] must be a full name string`,
            );
          scoped[alias.trim().toLowerCase()] = full.replace(/\s+/g, ' ').trim();
        }
        config.fileAliases[key] = scoped;
      } else {
        throw new ConfigError(source, `aliases["${key}"] must be a string or an object`);
      }
    }
  }
  return { config, warnings };
}

/** Read a config file. No path, or a missing file, gives the defaults. */
export function loadPeopleConfig(path?: string): { config: PeopleConfig; warnings: WarningInfo[] } {
  if (!path || !existsSync(path)) return { config: defaultPeopleConfig(), warnings: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new ConfigError(path, `cannot read or parse JSON (${(e as Error).message})`);
  }
  return parsePeopleConfig(parsed, path);
}
