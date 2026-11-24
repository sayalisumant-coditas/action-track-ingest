import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AmbiguousOwnerError, ConfigError } from '../../../src/core/errors.js';
import {
  defaultPeopleConfig,
  loadPeopleConfig,
  parsePeopleConfig,
  type PeopleConfig,
} from '../../../src/core/people/config.js';
import {
  buildDirectory,
  findOnePerson,
  findPeople,
  isGroup,
  isUnassigned,
  splitName,
  type Directory,
} from '../../../src/core/people/directory.js';
import { resolveOwner } from '../../../src/core/people/resolveOwner.js';
import { WarningCode } from '../../../src/core/warnings.js';

const NAMES = [
  'Priya Nair',
  'Priya Shah',
  'Rahul Mehta',
  'Rahul Verma',
  'Anita Desai',
  'Lena Fischer',
  'Sam Okafor',
  'Karan Joshi',
  'Meera Rao',
];
const dir: Directory = buildDirectory([{ attendees: NAMES }]);

const mtg = (sourceFile: string, attendees: string[]) => ({ sourceFile, attendees });
const M = {
  standup0902: mtg('2026-09-02-standup.md', ['Rahul Mehta', 'Sam Okafor', 'Anita Desai']),
  billing0903: mtg('2026-09-03-billing-migration-sync.md', [
    'Karan Joshi',
    'Sam Okafor',
    'Rahul Verma',
    'Priya Shah',
  ]),
  billing0917: mtg('2026-09-17-billing-migration-sync.md', [
    'Karan Joshi',
    'Sam Okafor',
    'Rahul Verma',
    'Priya Shah',
    'Priya Nair',
  ]),
  design0918: mtg('2026-09-18-design-review.md', [
    'Priya Nair',
    'Rahul Mehta',
    'Anita Desai',
    'Lena Fischer',
  ]),
  onboarding0914: mtg('2026-09-14-onboarding-flow-design.md', [
    'Rahul Verma',
    'Priya Shah',
    'Anita Desai',
  ]),
  cutover0929: mtg('2026-09-29-billing-cutover-planning.md', [
    'Priya Nair',
    'Priya Shah',
    'Sam Okafor',
  ]),
  portal0908: mtg('2026-09-08-quote-portal-weekly.md', ['Priya Nair', 'Rahul Mehta']),
  standup1007: mtg('2026-10-07-standup.md', ['Rahul Mehta', 'Rahul Verma', 'Anita Desai']),
  offsite0930: mtg('2026-09-30-q4-offsite.md', NAMES),
  noList: mtg('2026-09-23-standup.md', []),
};

const ids = (names: string[]) => names.map((n) => n.toLowerCase().replace(/ /g, '-'));
const res = (raw: string, m = M.offsite0930, helper?: string, cfg?: PeopleConfig) =>
  resolveOwner(raw, helper, m, dir, cfg);

describe('A. splitName / buildDirectory', () => {
  it('M5-01', () => expect(splitName('Priya Nair')).toEqual({ first: 'Priya', last: 'Nair' }));
  it('M5-02 role suffix', () =>
    expect(splitName('Priya Nair (PM)')).toEqual({ first: 'Priya', last: 'Nair' }));
  it('M5-03 one word', () => expect(splitName('Madonna')).toEqual({ first: 'Madonna', last: '' }));
  it('M5-04 long name', () =>
    expect(splitName('Anne Marie van der Berg')).toEqual({
      first: 'Anne',
      last: 'Marie van der Berg',
    }));
  it('M5-05 double space', () => expect(splitName('Priya  Nair')).toEqual(splitName('Priya Nair')));
  it('M5-06 empty is skipped [BAD]', () => {
    expect(splitName('')).toEqual({ first: '', last: '' });
    expect(buildDirectory([{ attendees: ['', '  ', 'Sam Okafor'] }]).people).toHaveLength(1);
  });
  it('M5-07 same person in two meetings [DUP]', () =>
    expect(
      buildDirectory([{ attendees: ['Priya Nair'] }, { attendees: ['Priya Nair'] }]).people,
    ).toHaveLength(1));
  it('M5-08 id is a slug', () =>
    expect(dir.people.find((p) => p.fullName === 'Priya Nair')?.id).toBe('priya-nair'));
  it('M5-09 case differences are one person', () =>
    expect(buildDirectory([{ attendees: ['priya nair', 'Priya Nair'] }]).people).toHaveLength(1));
  it('M5-10 both Priyas and both Rahuls [NAME]', () => {
    expect(dir.people.filter((p) => p.first === 'Priya')).toHaveLength(2);
    expect(dir.people.filter((p) => p.first === 'Rahul')).toHaveLength(2);
  });
  it('M5-11 identical full name in config [DUP]', () => {
    const d = buildDirectory([], {
      people: [
        { fullName: 'Jo Lee', email: 'a@x.com' },
        { fullName: 'Jo Lee', email: 'b@x.com' },
      ],
    });
    expect(d.people).toHaveLength(1);
    expect(d.people[0]?.email).toBe('a@x.com');
    expect(d.warnings).toHaveLength(1);
  });
  it('M5-12 config email merged', () => {
    const d = buildDirectory([{ attendees: ['Priya Nair'] }], {
      people: [{ fullName: 'priya  nair', email: 'p@x.com' }],
    });
    expect(d.people[0]).toMatchObject({ fullName: 'Priya Nair', email: 'p@x.com' });
  });
  it('M5-13 config-only person added', () =>
    expect(buildDirectory([], { people: [{ fullName: 'Zed Zee' }] }).people).toHaveLength(1));
  it('M5-14 empty [GAP]', () => expect(buildDirectory([]).people).toEqual([]));
  it('M5-15 sorted by full name', () =>
    expect(dir.people.map((p) => p.fullName)).toEqual([...NAMES].sort()));
});

describe('B. isGroup / isUnassigned', () => {
  it('M5-20', () => {
    for (const s of ['Everyone', 'everybody', 'ALL', 'Team']) {
      expect(isGroup(s)).toBe(true);
      expect(isUnassigned(s)).toBe(false);
    }
  });
  it('M5-21 [GAP]', () => {
    for (const s of ['Someone', 'TBD', 'tbd', '?', 'n/a', 'N/A']) {
      expect(isUnassigned(s)).toBe(true);
      expect(isGroup(s)).toBe(false);
    }
  });
  it('M5-22 [GAP]', () => {
    expect(isUnassigned('')).toBe(true);
    expect(isUnassigned('  ')).toBe(true);
    expect(isGroup('')).toBe(false);
  });
  it('M5-23/24/25 near misses', () => {
    for (const s of ['Allan', 'Teamwork', 'Priya']) {
      expect(isGroup(s)).toBe(false);
      expect(isUnassigned(s)).toBe(false);
    }
  });
});

describe('C. resolveOwner core', () => {
  it('M5-30 empty [GAP]', () => expect(res('').owner.kind).toBe('unassigned'));
  it('M5-31 Someone / TBD [GAP]', () => {
    expect(res('Someone').owner.kind).toBe('unassigned');
    expect(res('TBD').owner.kind).toBe('unassigned');
  });
  it('M5-32 group', () => {
    expect(res('Everyone').owner.kind).toBe('group');
    expect(res('Team').owner.kind).toBe('group');
  });
  it('M5-33 full name', () => expect(res('Priya Nair').owner.people).toEqual(['priya-nair']));
  it('M5-34 lowercase', () => expect(res('priya nair').owner.people).toEqual(['priya-nair']));
  it('M5-35 initial N [NAME]', () =>
    expect(res('Priya N.', M.billing0917).owner.people).toEqual(['priya-nair']));
  it('M5-36 initial S [NAME]', () =>
    expect(res('Priya S.', M.billing0917).owner.people).toEqual(['priya-shah']));
  it('M5-37 initial is directory-wide', () => {
    const m = mtg('x.md', ['Priya Shah']);
    expect(res('Priya N.', m).owner.people).toEqual(['priya-nair']);
  });
  it('M5-38 unknown initial', () => {
    const r = res('Priya X.');
    expect(r.owner.kind).toBe('unassigned');
    expect(r.warnings.map((w) => w.code)).toEqual([WarningCode.OWNER_UNKNOWN]);
  });
  it('M5-39 Sam', () => expect(res('Sam', M.standup0902).owner.people).toEqual(['sam-okafor']));
  it('M5-40 Zed [GAP]', () => {
    const r = res('Zed');
    expect(r.owner.kind).toBe('unassigned');
    expect(r.warnings.map((w) => w.code)).toEqual([WarningCode.OWNER_UNKNOWN]);
  });
  it('M5-41 not an attendee', () => {
    const r = res('Sam', mtg('x.md', ['Anita Desai']));
    expect(r.owner.people).toEqual(['sam-okafor']);
    expect(r.warnings.map((w) => w.code)).toEqual([WarningCode.OWNER_NOT_ATTENDEE]);
  });
  it('M5-42 raw kept', () => expect(res('  priya  N. ').owner.raw).toBe('  priya  N. '));
  it('M5-43 reason', () => {
    expect(res('Priya Nair').reason).toBe('full');
    expect(res('Priya N.').reason).toBe('initial');
    expect(res('Sam', M.standup0902).reason).toBe('attendee');
  });
});

describe('D. same first name [NAME]', () => {
  const people = (raw: string, m: ReturnType<typeof mtg>) => res(raw, m).owner;
  it('M5-50', () => expect(people('Rahul', M.standup0902).people).toEqual(['rahul-mehta']));
  it('M5-51', () => expect(people('Rahul', M.billing0903).people).toEqual(['rahul-verma']));
  it('M5-52', () => expect(people('Priya', M.billing0903).people).toEqual(['priya-shah']));
  it('M5-53', () => {
    const r = res('Priya', M.billing0917);
    expect(r.owner.kind).toBe('ambiguous');
    expect(r.owner.candidates.sort()).toEqual(ids(['Priya Nair', 'Priya Shah']));
    expect(r.warnings.map((w) => w.code)).toEqual([WarningCode.OWNER_AMBIGUOUS]);
  });
  it('M5-54', () => {
    const o = people('Rahul', M.standup1007);
    expect(o.kind).toBe('ambiguous');
    expect(o.candidates.sort()).toEqual(ids(['Rahul Mehta', 'Rahul Verma']));
  });
  it('M5-55/56 offsite', () => {
    expect(people('Priya', M.offsite0930).kind).toBe('ambiguous');
    expect(people('Rahul', M.offsite0930).kind).toBe('ambiguous');
  });
  it('M5-57/58 design review', () => {
    expect(people('Priya', M.design0918).people).toEqual(['priya-nair']);
    expect(people('Rahul', M.design0918).people).toEqual(['rahul-mehta']);
  });
  it('M5-59 onboarding', () => {
    expect(people('Rahul', M.onboarding0914).people).toEqual(['rahul-verma']);
    expect(people('Priya', M.onboarding0914).people).toEqual(['priya-shah']);
  });
  it('M5-60 cutover initials', () => {
    expect(people('Priya S.', M.cutover0929).people).toEqual(['priya-shah']);
    expect(people('Priya N.', M.cutover0929).people).toEqual(['priya-nair']);
  });
  it('M5-61', () => expect(people('Priya N.', M.portal0908).people).toEqual(['priya-nair']));
  it('M5-62 no list, one Sam [GAP]', () =>
    expect(people('Sam', M.noList).people).toEqual(['sam-okafor']));
  it('M5-63 no list, two Rahuls [GAP]', () =>
    expect(people('Rahul', M.noList).kind).toBe('ambiguous'));
  it('M5-64 no list, Priya [GAP]', () => expect(people('Priya', M.noList).kind).toBe('ambiguous'));
  it('M5-65 ambiguous never picks one', () => {
    const o = people('Priya', M.billing0917);
    expect(o.people).toEqual([]);
    expect(o.candidates).toHaveLength(2);
  });
  it('M5-66 ambiguous differs from unassigned', () =>
    expect(people('Priya', M.billing0917).kind).not.toBe(people('Zed', M.billing0917).kind));
  it('M5-67 three with one first name', () => {
    const d = buildDirectory([{ attendees: ['Al One', 'Al Two', 'Al Three'] }]);
    const r = resolveOwner('Al', undefined, mtg('x.md', []), d);
    expect(r.owner.kind).toBe('ambiguous');
    expect(r.owner.candidates).toHaveLength(3);
  });
  it('M5-68 attendee wins over non-attendee', () =>
    expect(people('Priya', mtg('x.md', ['Priya Shah', 'Sam Okafor'])).people).toEqual([
      'priya-shah',
    ]));
});

describe('E. aliases', () => {
  const cfg = (aliases: unknown) => parsePeopleConfig({ aliases }).config;
  const file = cfg({ '2026-09-17-billing-migration-sync.md': { Priya: 'Priya Nair' } });
  it('M5-70', () => {
    const r = res('Priya', M.billing0917, undefined, file);
    expect(r.owner.people).toEqual(['priya-nair']);
    expect(r.reason).toBe('alias');
  });
  it('M5-71 file-scoped', () =>
    expect(res('Priya', M.offsite0930, undefined, file).owner.kind).toBe('ambiguous'));
  it('M5-72 global', () =>
    expect(
      res('Priya', M.billing0917, undefined, cfg({ Priya: 'Priya Shah' })).owner.people,
    ).toEqual(['priya-shah']));
  it('M5-73 file beats global', () => {
    const both = cfg({
      Priya: 'Priya Shah',
      '2026-09-17-billing-migration-sync.md': { Priya: 'Priya Nair' },
    });
    expect(res('Priya', M.billing0917, undefined, both).owner.people).toEqual(['priya-nair']);
  });
  it('M5-74 alias case-insensitive', () =>
    expect(
      res('Priya', M.billing0917, undefined, cfg({ priya: 'Priya Shah' })).owner.people,
    ).toEqual(['priya-shah']));
  it('M5-75 alias to unknown person [BAD]', () => {
    const r = res('Priya', M.billing0917, undefined, cfg({ Priya: 'Nobody Here' }));
    expect(r.owner.kind).toBe('ambiguous');
    expect(r.warnings.map((w) => w.code)).toContain(WarningCode.OWNER_UNKNOWN);
  });
  it('M5-76 alias does not override a full name', () =>
    expect(
      res('Priya Shah', M.billing0917, undefined, cfg({ Priya: 'Priya Nair' })).owner.people,
    ).toEqual(['priya-shah']));
  it('M5-77 deterministic', () =>
    expect(res('Priya', M.billing0917, undefined, file)).toEqual(
      res('Priya', M.billing0917, undefined, file),
    ));
});

describe('F. joint owners and helpers', () => {
  it('M5-80/81/82 joint forms', () => {
    for (const raw of ['Anita & Rahul', 'Anita and Rahul', 'Anita, Rahul']) {
      const o = res(raw, M.design0918).owner;
      expect(o.kind).toBe('person');
      expect(o.people).toEqual(['anita-desai', 'rahul-mehta']);
    }
  });
  it('M5-83 both ambiguous [NAME]', () => {
    const r = res('Priya & Rahul', M.offsite0930);
    expect(r.owner.kind).toBe('ambiguous');
    expect(r.owner.candidates).toHaveLength(4);
    expect(r.warnings.filter((w) => w.code === WarningCode.OWNER_AMBIGUOUS)).toHaveLength(2);
  });
  it('M5-84 two resolved', () =>
    expect(res('Anita & Priya', M.design0918).owner.people).toEqual(['anita-desai', 'priya-nair']));
  it('M5-85 unknown part does not drop the item', () => {
    const r = res('Anita & Zed', M.design0918);
    expect(r.owner.people).toEqual(['anita-desai']);
    expect(r.warnings.map((w) => w.code)).toEqual([WarningCode.OWNER_UNKNOWN]);
  });
  it('M5-86 same person twice [DUP]', () =>
    expect(res('Anita & Anita', M.design0918).owner.people).toEqual(['anita-desai']));
  it('M5-87 helper', () => {
    const o = res('Lena', M.design0918, 'Priya').owner;
    expect(o.people).toEqual(['lena-fischer']);
    expect(o.helpers).toEqual(['priya-nair']);
  });
  it('M5-88 ambiguous helper is a warning only', () => {
    const r = res('Lena', M.offsite0930, 'Priya');
    expect(r.owner.people).toEqual(['lena-fischer']);
    expect(r.owner.helpers).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual([WarningCode.OWNER_AMBIGUOUS]);
  });
  it('M5-89 unknown helper', () => {
    const r = res('Lena', M.design0918, 'Zed');
    expect(r.owner.people).toEqual(['lena-fischer']);
    expect(r.warnings.map((w) => w.code)).toEqual([WarningCode.OWNER_UNKNOWN]);
  });
  it('helper list "Priya and Sam"', () =>
    expect(res('Lena', M.design0918, 'Priya and Sam').owner.helpers).toEqual([
      'priya-nair',
      'sam-okafor',
    ]));
});

describe('G. findPeople', () => {
  const names = (q: string) => {
    const r = findPeople(q, dir);
    return Array.isArray(r) ? r.map((p) => p.fullName) : r;
  };
  it('M5-90/91', () => {
    expect(names('Priya Shah')).toEqual(['Priya Shah']);
    expect(names('priya shah')).toEqual(['Priya Shah']);
  });
  it('M5-92/93 [NAME]', () => {
    expect(names('Priya')).toEqual(['Priya Nair', 'Priya Shah']);
    expect(names('Rahul')).toEqual(['Rahul Mehta', 'Rahul Verma']);
  });
  it('M5-94/95', () => {
    expect(names('Karan')).toEqual(['Karan Joshi']);
    expect(names('Zed')).toEqual([]);
  });
  it('M5-96/97 markers [GAP]', () => {
    expect(names('none')).toBe('none');
    expect(names('everyone')).toBe('group');
  });
  it('M5-98 AmbiguousOwnerError lists full names', () => {
    try {
      findOnePerson('Priya', dir);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AmbiguousOwnerError);
      const err = e as AmbiguousOwnerError;
      expect(err.candidates).toEqual(['Priya Nair', 'Priya Shah']);
      expect(err.message).toContain('Priya Nair');
      expect(err.message).toContain('Priya Shah');
    }
  });
  it('findOnePerson single / none / markers', () => {
    expect(findOnePerson('Karan', dir)).toMatchObject({ fullName: 'Karan Joshi' });
    expect(findOnePerson('Zed', dir)).toBeNull();
    expect(findOnePerson('none', dir)).toBe('none');
  });
  it('M5-99 extra spaces', () => expect(names(' Priya   Nair ')).toEqual(['Priya Nair']));
  it('M5-100 initial', () => expect(names('Priya N.')).toEqual(['Priya Nair']));
  it('M5-101 no prefixes', () => {
    expect(names('P')).toEqual([]);
    expect(names('Pri')).toEqual([]);
  });
});

describe('H. config loader', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'at-cfg-'));
  const write = (name: string, text: string) => {
    const p = join(tmp, name);
    writeFileSync(p, text);
    return p;
  };
  it('M5-110 no file', () => {
    expect(loadPeopleConfig().config).toEqual(defaultPeopleConfig());
    expect(loadPeopleConfig(join(tmp, 'missing.json')).config).toEqual(defaultPeopleConfig());
  });
  it('M5-111 valid', () => {
    const p = write(
      'ok.json',
      JSON.stringify({
        people: [{ fullName: 'Priya Nair', email: 'p@x.com' }],
        aliases: { Priya: 'Priya Shah', 'a.md': { Rahul: 'Rahul Verma' } },
      }),
    );
    const { config } = loadPeopleConfig(p);
    expect(config.people).toEqual([{ fullName: 'Priya Nair', email: 'p@x.com' }]);
    expect(config.globalAliases).toEqual({ priya: 'Priya Shah' });
    expect(config.fileAliases).toEqual({ 'a.md': { rahul: 'Rahul Verma' } });
  });
  it('M5-112 people not an array [BAD]', () =>
    expect(() => parsePeopleConfig({ people: {} })).toThrow(/"people" must be an array/));
  it('M5-113 person without fullName', () =>
    expect(() => parsePeopleConfig({ people: [{ email: 'a@b.co' }] })).toThrow(/people\[0\]/));
  it('M5-114 invalid email is a warning', () => {
    const r = parsePeopleConfig({ people: [{ fullName: 'A B', email: 'nope' }] });
    expect(r.config.people).toEqual([{ fullName: 'A B' }]);
    expect(r.warnings).toHaveLength(1);
  });
  it('M5-115 unknown keys ignored', () =>
    expect(() =>
      parsePeopleConfig({ mergeThreshold: 0.8, confidentialMeetings: [] }),
    ).not.toThrow());
  it('M5-116 malformed JSON [BAD]', () => {
    const p = write('bad.json', '{ nope');
    expect(() => loadPeopleConfig(p)).toThrow(ConfigError);
    expect(() => loadPeopleConfig(p)).toThrow(p);
  });
  it('bad alias shape', () =>
    expect(() => parsePeopleConfig({ aliases: { a: 3 } })).toThrow(/aliases/));
});
