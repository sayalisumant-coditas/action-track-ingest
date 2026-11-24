import { attendeeMatchName } from '../parse/meeting.js';
import type { Meeting, Person } from '../types.js';
import { WarningCode, type WarningInfo } from '../warnings.js';
import { AmbiguousOwnerError } from '../errors.js';
import type { PeopleConfig } from './config.js';

export interface Directory {
  /** Sorted by full name. */
  people: Person[];
  warnings: WarningInfo[];
}

/** `Priya Nair (PM)` to `{first: 'Priya', last: 'Nair'}`. One-word names have an empty last name. */
export function splitName(full: string): { first: string; last: string } {
  const clean = attendeeMatchName(full ?? '');
  if (clean === '') return { first: '', last: '' };
  const [first = '', ...rest] = clean.split(' ');
  return { first, last: rest.join(' ') };
}

export const personId = (fullName: string): string =>
  fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function makePerson(rawName: string): Person | null {
  const fullName = attendeeMatchName(rawName);
  if (fullName === '') return null;
  const { first, last } = splitName(fullName);
  const id = personId(fullName);
  if (id === '') return null;
  return { id, fullName, first, last };
}

/** Build the people list from every attendee list, then merge config people (emails, extras). */
export function buildDirectory(
  meetings: Pick<Meeting, 'attendees'>[],
  config?: Pick<PeopleConfig, 'people'>,
): Directory {
  const byId = new Map<string, Person>();
  const warnings: WarningInfo[] = [];

  for (const m of meetings) {
    for (const name of m.attendees ?? []) {
      const p = makePerson(name);
      if (p && !byId.has(p.id)) byId.set(p.id, p);
    }
  }

  const configured = new Map<string, string | undefined>();
  for (const cp of config?.people ?? []) {
    const p = makePerson(cp.fullName);
    if (!p) continue;
    if (configured.has(p.id)) {
      if (configured.get(p.id) !== cp.email) {
        warnings.push({
          code: WarningCode.OWNER_AMBIGUOUS,
          message: `Two people in the config share the full name "${p.fullName}"; kept the first`,
        });
      }
      continue;
    }
    configured.set(p.id, cp.email);
    const existing = byId.get(p.id) ?? p;
    if (cp.email) existing.email = cp.email;
    byId.set(p.id, existing);
  }

  const people = [...byId.values()].sort(
    (a, b) => a.fullName.localeCompare(b.fullName, 'en') || (a.id < b.id ? -1 : 1),
  );
  return { people, warnings };
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export const isGroup = (raw: string): boolean => /^(everyone|everybody|all|team)$/.test(norm(raw));

export const isUnassigned = (raw: string): boolean => /^(|someone|tbd|\?|n\/a)$/.test(norm(raw));

/** `Priya N.` to `{first: 'priya', initial: 'n'}`; null for anything else. */
export function parseInitial(s: string): { first: string; initial: string } | null {
  const m = /^(\S+)\s+([A-Za-z])\.?$/.exec(s.replace(/\s+/g, ' ').trim());
  return m
    ? { first: (m[1] as string).toLowerCase(), initial: (m[2] as string).toLowerCase() }
    : null;
}

export function byFullName(dir: Directory, name: string): Person | undefined {
  const key = norm(name);
  return dir.people.find((p) => norm(p.fullName) === key);
}

export function byInitial(dir: Directory, first: string, initial: string): Person[] {
  return dir.people.filter((p) => norm(p.first) === first && norm(p.last).startsWith(initial));
}

export function byFirstName(dir: Directory, first: string): Person[] {
  const key = norm(first);
  return dir.people.filter((p) => norm(p.first) === key);
}

/**
 * For `list --owner` and `followup`. A full name gives one person, `First I.` the people whose last
 * name starts with I, a bare first name everyone with that first name (exact match, no prefixes).
 * `none` and the group words are special markers, not people.
 */
export function findPeople(query: string, dir: Directory): Person[] | 'none' | 'group' {
  const q = norm(query);
  if (q === 'none') return 'none';
  if (isGroup(q)) return 'group';
  if (q === '') return [];
  const full = byFullName(dir, q);
  if (full) return [full];
  const init = parseInitial(q);
  if (init) return byInitial(dir, init.first, init.initial);
  return byFirstName(dir, q);
}

/**
 * Like `findPeople` but for callers that need exactly one person. More than one match throws
 * AmbiguousOwnerError listing every full name; no match returns null.
 */
export function findOnePerson(query: string, dir: Directory): Person | 'none' | 'group' | null {
  const found = findPeople(query, dir);
  if (found === 'none' || found === 'group') return found;
  if (found.length === 0) return null;
  if (found.length > 1) {
    const names = found.map((p) => p.fullName);
    throw new AmbiguousOwnerError(
      names,
      `"${query.trim()}" matches more than one person: ${names.join(', ')}. Use the full name.`,
    );
  }
  return found[0] as Person;
}
