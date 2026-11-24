import type { Meeting, OwnerRef, Person } from '../types.js';
import { WarningCode, type WarningInfo } from '../warnings.js';
import { attendeeMatchName } from '../parse/meeting.js';
import {
  byFirstName,
  byFullName,
  byInitial,
  isGroup,
  isUnassigned,
  parseInitial,
  personId,
  type Directory,
} from './directory.js';
import { defaultPeopleConfig, type PeopleConfig } from './config.js';

export type OwnerReason =
  | 'unassigned'
  | 'group'
  | 'alias'
  | 'full'
  | 'initial'
  | 'attendee'
  | 'only-one'
  | 'ambiguous'
  | 'unknown'
  | 'joint';

export interface OwnerResolution {
  owner: OwnerRef;
  reason: OwnerReason;
  /** Reason for each part of a joint owner (one entry for a simple owner). */
  partReasons: OwnerReason[];
  warnings: WarningInfo[];
}

type MeetingLike = Pick<Meeting, 'sourceFile' | 'attendees'>;

interface PartResult {
  kind: 'person' | 'ambiguous' | 'unassigned' | 'group';
  people: Person[];
  candidates: Person[];
  reason: OwnerReason;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Split `A & B`, `A and B`, `A, B` (not inside parentheses). */
export function splitJoint(raw: string): string[] {
  return raw
    .split(/\s*(?:&|,|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function resolvePart(
  part: string,
  meeting: MeetingLike,
  dir: Directory,
  config: PeopleConfig,
  warnings: WarningInfo[],
  label: string,
): PartResult {
  const result = (
    kind: PartResult['kind'],
    reason: OwnerReason,
    people: Person[] = [],
    candidates: Person[] = [],
  ): PartResult => ({ kind, reason, people, candidates });

  if (isUnassigned(part)) return result('unassigned', 'unassigned');
  if (isGroup(part)) return result('group', 'group');

  // aliases: this file first, then global
  const key = norm(part);
  const aliasName = config.fileAliases[meeting.sourceFile]?.[key] ?? config.globalAliases[key];
  if (aliasName !== undefined) {
    const target = byFullName(dir, aliasName);
    if (target) return result('person', 'alias', [target]);
    warnings.push({
      code: WarningCode.OWNER_UNKNOWN,
      message: `${label}"${part}": alias points to "${aliasName}", who is not in the people directory`,
    });
  }

  const full = byFullName(dir, part);
  if (full) return result('person', 'full', [full]);

  const init = parseInitial(part);
  if (init) {
    const matches = byInitial(dir, init.first, init.initial);
    if (matches.length === 1) return result('person', 'initial', matches);
    if (matches.length > 1) {
      warnings.push({
        code: WarningCode.OWNER_AMBIGUOUS,
        message: `${label}"${part}" matches ${matches.map((p) => p.fullName).join(', ')}`,
      });
      return result('ambiguous', 'ambiguous', [], matches);
    }
    warnings.push({
      code: WarningCode.OWNER_UNKNOWN,
      message: `${label}"${part}" matches nobody in the people directory`,
    });
    return result('unassigned', 'unknown');
  }

  const all = byFirstName(dir, part);
  if (all.length === 0) {
    warnings.push({
      code: WarningCode.OWNER_UNKNOWN,
      message: `${label}"${part}" is not in the people directory`,
    });
    return result('unassigned', 'unknown');
  }

  const hasList = (meeting.attendees ?? []).length > 0;
  const attended = new Set((meeting.attendees ?? []).map((a) => personId(attendeeMatchName(a))));
  const here = all.filter((p) => attended.has(p.id));
  if (here.length === 1) return result('person', 'attendee', here);
  if (here.length > 1) return ambiguous(here);
  if (all.length === 1) {
    if (hasList) {
      warnings.push({
        code: WarningCode.OWNER_NOT_ATTENDEE,
        message: `${label}${all[0]?.fullName} is not on this meeting's attendee list`,
      });
    }
    return result('person', 'only-one', all);
  }
  return ambiguous(all);

  function ambiguous(cands: Person[]): PartResult {
    warnings.push({
      code: WarningCode.OWNER_AMBIGUOUS,
      message: `${label}"${part}" could be ${cands.map((p) => p.fullName).join(' or ')}`,
    });
    return result('ambiguous', 'ambiguous', [], cands);
  }
}

function resolveParts(
  raw: string,
  meeting: MeetingLike,
  dir: Directory,
  config: PeopleConfig,
  warnings: WarningInfo[],
  label: string,
): PartResult[] {
  const whole = raw.replace(/\s+/g, ' ').trim();
  // unassigned / group / alias / full name are tried on the whole text before splitting
  if (isUnassigned(whole) || isGroup(whole))
    return [resolvePart(whole, meeting, dir, config, warnings, label)];
  const parts = splitJoint(whole);
  if (parts.length <= 1) return [resolvePart(whole, meeting, dir, config, warnings, label)];
  return parts.map((p) => resolvePart(p, meeting, dir, config, warnings, label));
}

const uniq = (ids: string[]) => [...new Set(ids)];

/**
 * Turn owner text (and an optional `(with X)` helper) into an OwnerRef following the decision list:
 * unassigned, group, joint split, alias, full name, `First I.`, bare first name.
 * Never throws and never picks between two people silently.
 */
export function resolveOwner(
  ownerRaw: string,
  helperRaw: string | undefined,
  meeting: MeetingLike,
  dir: Directory,
  config: PeopleConfig = defaultPeopleConfig(),
): OwnerResolution {
  const warnings: WarningInfo[] = [];
  const parts = resolveParts(ownerRaw ?? '', meeting, dir, config, warnings, '');
  const partReasons = parts.map((p) => p.reason);

  const people = uniq(parts.flatMap((p) => p.people.map((x) => x.id)));
  const candidates = uniq(parts.flatMap((p) => p.candidates.map((x) => x.id)));

  let kind: OwnerRef['kind'];
  let reason: OwnerReason;
  if (candidates.length > 0) {
    kind = 'ambiguous';
    reason = 'ambiguous';
  } else if (people.length > 0) {
    kind = 'person';
    reason = parts.length > 1 ? 'joint' : (parts[0] as PartResult).reason;
  } else if (parts.some((p) => p.kind === 'group')) {
    kind = 'group';
    reason = 'group';
  } else {
    kind = 'unassigned';
    reason = parts.length === 1 ? (parts[0] as PartResult).reason : 'unassigned';
  }

  const helpers: string[] = [];
  if (helperRaw && helperRaw.trim() !== '') {
    for (const h of resolveParts(helperRaw, meeting, dir, config, warnings, 'Helper ')) {
      helpers.push(...h.people.map((p) => p.id));
    }
  }

  const owner: OwnerRef = {
    kind,
    raw: ownerRaw,
    people: kind === 'person' ? people : [],
    helpers: uniq(helpers),
    candidates: kind === 'ambiguous' ? candidates : [],
  };
  return { owner, reason, partReasons, warnings };
}
