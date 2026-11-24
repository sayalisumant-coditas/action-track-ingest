import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ActionItem,
  DueRef,
  IngestReport,
  OwnerRef,
  ISODate,
} from '../../../src/core/types.js';
import {
  AmbiguousOwnerError,
  FolderError,
  StoreError,
  UnknownIdError,
} from '../../../src/core/errors.js';
import { WarningCode, type Clock } from '../../../src/core/warnings.js';
import { isISODate } from '../../../src/core/dates/iso.js';

describe('B. Types, errors, warnings, clock', () => {
  it('S0-10 types module imports', () => {
    const d: ISODate = '2026-09-08';
    expect(d).toBe('2026-09-08');
  });

  it('S0-11 type shapes', () => {
    expectTypeOf<ActionItem>().toHaveProperty('occurrences');
    expectTypeOf<ActionItem>().toHaveProperty('dueHistory');
    expectTypeOf<ActionItem['parentId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ActionItem>().toHaveProperty('flags');
    expectTypeOf<OwnerRef['kind']>().toEqualTypeOf<
      'person' | 'group' | 'unassigned' | 'ambiguous'
    >();
    expectTypeOf<DueRef['reason']>().toEqualTypeOf<
      'unresolvable' | 'no-meeting-date' | 'weekday-mismatch' | undefined
    >();
  });

  it('S0-12 IngestReport skipped reasons [BAD]', () => {
    expectTypeOf<IngestReport['skipped'][number]['reason']>().toEqualTypeOf<
      'empty' | 'binary' | 'unreadable' | 'no-actions'
    >();
  });

  it('S0-13 errors are distinguishable Errors', () => {
    const errs = [
      new FolderError('/x'),
      new StoreError('s'),
      new AmbiguousOwnerError(['a']),
      new UnknownIdError('id'),
    ];
    const names = ['FolderError', 'StoreError', 'AmbiguousOwnerError', 'UnknownIdError'];
    errs.forEach((e, i) => {
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe(names[i]);
    });
    expect(errs[0]).toBeInstanceOf(FolderError);
    expect(errs[0]).not.toBeInstanceOf(StoreError);
    expect(errs[3]).not.toBeInstanceOf(AmbiguousOwnerError);
  });

  it('S0-14 AmbiguousOwnerError carries candidates [NAME]', () => {
    expect(new AmbiguousOwnerError(['Priya Shah', 'Priya Nair']).candidates).toEqual([
      'Priya Shah',
      'Priya Nair',
    ]);
  });

  it('S0-15 FolderError message contains the path', () => {
    expect(new FolderError('/no/such/dir').message).toContain('/no/such/dir');
  });

  it('S0-16 warning codes', () => {
    // later modules may add codes (e.g. FRONTMATTER_INVALID from M2); these 12 must always exist
    expect(Object.keys(WarningCode)).toEqual(
      expect.arrayContaining([
        'DATE_INFERRED',
        'DATE_MISMATCH_FILENAME',
        'DATE_WEEKDAY_MISMATCH',
        'DUE_UNRESOLVABLE',
        'DUE_WEEKDAY_MISMATCH',
        'OWNER_AMBIGUOUS',
        'OWNER_UNKNOWN',
        'OWNER_NOT_ATTENDEE',
        'ITEM_REOPENED',
        'FENCE_UNCLOSED',
        'EMPTY_ITEM',
        'MISSING_EMAIL',
      ]),
    );
    for (const [k, v] of Object.entries(WarningCode)) expect(v).toBe(k);
  });

  it('S0-17 warning codes unique', () => {
    const vals = Object.values(WarningCode);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it('S0-18 Clock', () => {
    const c: Clock = () => new Date(0);
    expect(c().toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('C. isISODate', () => {
  it('S0-20 valid date', () => expect(isISODate('2026-09-08')).toBe(true));
  it('S0-21 leap day', () => expect(isISODate('2024-02-29')).toBe(true));
  it('S0-22 non-leap Feb 29', () => expect(isISODate('2026-02-29')).toBe(false));
  it('S0-23 out-of-range parts', () => {
    for (const s of ['2026-13-01', '2026-00-10', '2026-09-31']) {
      expect(isISODate(s), s).toBe(false);
    }
  });
  it('S0-24 other formats [GAP]', () => {
    for (const s of ['2026-9-8', '08/09/2026', '9 September 2026']) {
      expect(isISODate(s), s).toBe(false);
    }
  });
  it('S0-25 junk never throws [GAP]', () => {
    const junk: unknown[] = ['', null, undefined, 'sometime last week', 42, {}];
    for (const s of junk) expect(isISODate(s)).toBe(false);
  });
});
