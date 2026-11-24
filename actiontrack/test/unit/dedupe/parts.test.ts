import { describe, expect, it } from 'vitest';
import { ownerKey } from '../../../src/core/dedupe/merge.js';
import { normaliseTask } from '../../../src/core/dedupe/normalise.js';
import { DEFAULT_MERGE_THRESHOLD, similarity } from '../../../src/core/dedupe/similarity.js';
import { STAGE_VERBS, stageGuard } from '../../../src/core/dedupe/stageGuard.js';
import { makeId, sha1Hex } from '../../../src/core/store/ids.js';
import type { OwnerRef } from '../../../src/core/types.js';

const owner = (kind: OwnerRef['kind'], raw: string, people: string[] = []): OwnerRef => ({
  kind,
  raw,
  people,
  helpers: [],
  candidates: [],
});

/** Small deterministic generator for the property tests. */
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

describe('A. normaliseTask', () => {
  it('M7-01 articles and filler removed', () =>
    expect(normaliseTask('Send the revised quote to Acme')).toBe('send revised quote acme'));
  it('M7-02 punctuation and case', () =>
    expect(normaliseTask('send revised quote to Acme!')).toBe('send revised quote acme'));
  it('M7-03 an extra "updated" stays comparable', () => {
    const s = similarity(
      normaliseTask('Share updated wireframes'),
      normaliseTask('Share wireframes'),
    );
    expect(s).toBeGreaterThanOrEqual(0.6);
  });
  it('M7-04 finalise / finalize', () =>
    expect(normaliseTask('finalise welcome-email copy')).toBe(
      normaliseTask('finalize welcome-email copy'),
    ));
  it('M7-05 update / updated / updating share a stem', () => {
    const a = normaliseTask('update');
    expect(normaliseTask('updated')).toBe(a);
    expect(normaliseTask('updating')).toBe(a);
    expect(normaliseTask('update the CRM notes')).toBe(normaliseTask('updated CRM notes'));
  });
  it('M7-06 leftover due clause dropped', () =>
    expect(normaliseTask('confirm budget by Friday')).toBe(normaliseTask('confirm budget')));
  it('M7-07 hyphenated words handled consistently', () =>
    expect(normaliseTask('write design-system changelog')).toBe(
      normaliseTask('write design system changelog'),
    ));
  it('M7-08 numbers and symbols kept', () => {
    const n = normaliseTask('cut cloud costs by 10%');
    expect(n).toContain('10%');
    expect(n).toContain('costs');
  });
  it('M7-09 empty and filler-only [BAD]', () => {
    expect(normaliseTask('')).toBe('');
    expect(normaliseTask('the a to our')).toBe('');
    expect(normaliseTask(undefined as unknown as string)).toBe('');
  });
  it('M7-10 unicode quotes and dashes', () =>
    expect(normaliseTask('Send the “revised” quote – Acme')).toBe(
      normaliseTask('Send the "revised" quote - Acme'),
    ));
  it('M7-11 idempotent (property)', () => {
    const samples = [
      'Updating the CRM notes — by Friday',
      'finalize welcome-email copy',
      'Review Anita’s PR',
      'cut cloud costs by 10%',
      'Freeze invoice edits from 9 Oct',
      'bypass the proxy, standby power',
      '   ',
      `${'a'.repeat(40)}ing`,
    ];
    const rnd = rng(7);
    const alphabet = 'abcdeiouts -—,.%1 ing ed ';
    for (let i = 0; i < 200; i++) {
      let s = '';
      for (let j = 0; j < 25; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      samples.push(s);
    }
    for (const x of samples) expect(normaliseTask(normaliseTask(x))).toBe(normaliseTask(x));
  });
});

describe('B. ownerKey', () => {
  it('M7-20 person', () =>
    expect(ownerKey(owner('person', 'Priya Nair', ['priya-nair']))).toBe('priya-nair'));
  it('M7-21 joint owners sorted', () =>
    expect(ownerKey(owner('person', 'x', ['rahul-mehta', 'anita-desai']))).toBe(
      ownerKey(owner('person', 'x', ['anita-desai', 'rahul-mehta'])),
    ));
  it('M7-22 group', () => expect(ownerKey(owner('group', 'Everyone'))).toBe('group'));
  it('M7-23 unassigned [GAP]', () =>
    expect(ownerKey(owner('unassigned', 'Someone'))).toBe('unassigned'));
  it('M7-24 ambiguous Priya [NAME]', () =>
    expect(ownerKey(owner('ambiguous', 'Priya'))).toBe('?priya'));
  it('M7-25 ambiguous Rahul differs', () => {
    expect(ownerKey(owner('ambiguous', 'Rahul'))).toBe('?rahul');
    expect(ownerKey(owner('ambiguous', 'Rahul'))).not.toBe(ownerKey(owner('ambiguous', 'Priya')));
  });
  it('M7-26 Priya Nair vs ambiguous Priya [NAME]', () =>
    expect(ownerKey(owner('person', 'Priya Nair', ['priya-nair']))).not.toBe(
      ownerKey(owner('ambiguous', 'Priya')),
    ));
});

describe('C. similarity', () => {
  it('M7-30 identical', () => expect(similarity('send quote acme', 'send quote acme')).toBe(1));
  it('M7-31 nothing shared', () => expect(similarity('send quote', 'book hall')).toBe(0));
  it('M7-32 the-less variant is at least 0.85', () =>
    expect(similarity('send revised quote acme', 'send quote acme')).toBeGreaterThanOrEqual(0.85));
  it('M7-33 prefix is boosted', () => {
    const boosted = similarity('send quote', 'send quote acme today');
    expect(boosted).toBeGreaterThan((2 * 2) / (2 + 4));
    expect(boosted).toBeLessThanOrEqual(1);
  });
  it('M7-34/35 symmetric and in range (property)', () => {
    const w = ['send', 'quote', 'acme', 'book', 'call', 'sso', 'spike', '5', 'review', ''];
    const rnd = rng(3);
    const phrase = () =>
      Array.from({ length: Math.floor(rnd() * 5) }, () => w[Math.floor(rnd() * w.length)]).join(
        ' ',
      );
    for (let i = 0; i < 300; i++) {
      const a = phrase();
      const b = phrase();
      const s = similarity(a, b);
      expect(s).toBe(similarity(b, a));
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
  it('M7-36 word order ignored', () =>
    expect(similarity('quote send acme', 'send acme quote')).toBe(1));
  it('M7-37 empty vs non-empty [BAD]', () => {
    expect(similarity('', 'send')).toBe(0);
    expect(similarity('', '')).toBe(0);
  });
  it('M7-38 estimate vs start', () =>
    expect(
      similarity(normaliseTask('estimate SSO work'), normaliseTask('start SSO spike')),
    ).toBeLessThan(DEFAULT_MERGE_THRESHOLD));
  it('M7-39 collect vs publish quotes', () =>
    expect(
      similarity(
        normaliseTask('collect 5 customer quotes'),
        normaliseTask('publish the customer quotes'),
      ),
    ).toBeLessThan(DEFAULT_MERGE_THRESHOLD));
});

describe('D. stageGuard', () => {
  it('M7-40 estimate vs start', () =>
    expect(stageGuard('estimate SSO work', 'start SSO spike')).toBe(false));
  it('M7-41 collect vs publish', () =>
    expect(stageGuard('collect customer quotes', 'publish customer quotes')).toBe(false));
  it('M7-42 book vs schedule', () =>
    expect(stageGuard('book renewal call', 'schedule QBR')).toBe(false));
  it('M7-43 same verb', () => expect(stageGuard('send revised quote', 'send quote')).toBe(true));
  it('M7-44 no stage verb', () =>
    expect(stageGuard('confirm cloud budget', 'chase the vendor')).toBe(true));
  it('M7-45 only one has a stage verb', () =>
    expect(stageGuard('send quote', 'chase the vendor')).toBe(true));
  it.each([...STAGE_VERBS])('M7-46 detects %s', (verb) => {
    expect(stageGuard(`${verb} the thing`, 'zzz the thing')).toBe(true);
    const other = STAGE_VERBS.find((v) => v !== verb) as string;
    expect(stageGuard(`${verb} the thing`, `${other} the thing`)).toBe(false);
  });
  it('M7-47 a stage word used as a noun counts (known limit)', () =>
    expect(stageGuard('review meeting notes', 'write review doc')).toBe(false));
  it('M7-48 case-insensitive', () => expect(stageGuard('Estimate SSO', 'estimate SSO')).toBe(true));
  it('inflected verbs are detected', () =>
    expect(stageGuard('scheduling the QBR', 'booked the call')).toBe(false));
});

describe('I. makeId', () => {
  const occ = (rawLine: string, sourceFile = '2026-09-01-notes.md') => ({ sourceFile, rawLine });
  const base = '- [ ] Priya to send the revised quote to Acme by Friday';
  it('M7-120 six hex characters', () => expect(makeId(occ(base))).toMatch(/^[0-9a-f]{6}$/));
  it('M7-121 deterministic', () => expect(makeId(occ(base))).toBe(makeId(occ(base))));
  it('M7-122 status change keeps the id', () =>
    expect(makeId(occ(base.replace('[ ]', '[x]')))).toBe(makeId(occ(base))));
  it('M7-123 due change keeps the id', () => {
    expect(makeId(occ(base.replace('Friday', 'Monday')))).toBe(makeId(occ(base)));
    expect(makeId(occ('- [ ] Priya to send the revised quote to Acme'))).toBe(makeId(occ(base)));
  });
  it('M7-124 owner resolution cannot change the id (only the raw line is read)', () => {
    // makeId takes no owner argument at all; the same raw line always gives the same id
    expect(makeId.length).toBeLessThanOrEqual(3);
    expect(makeId(occ(base))).toBe(makeId({ sourceFile: '2026-09-01-notes.md', rawLine: base }));
  });
  it('M7-125 different source file', () =>
    expect(makeId(occ(base, 'a.md'))).not.toBe(makeId(occ(base, 'b.md'))));
  it('M7-126 forced collision extends to 8 hex', () => {
    const h = () => 'abcdef0123456789';
    const first = makeId(occ(base), new Set(), h);
    const second = makeId(occ(base), new Set([first]), h);
    expect(first).toBe('abcdef');
    expect(second).toBe('abcdef01');
  });
  it('M7-126b running out of lengths still yields unique ids', () => {
    const h = () => 'abcdef01';
    const a = makeId(occ(base), new Set(), h);
    const b = makeId(occ(base), new Set([a]), h);
    const c = makeId(occ(base), new Set([a, b]), h);
    expect(new Set([a, b, c]).size).toBe(3);
  });
  it('M7-129 whitespace-only differences', () =>
    expect(makeId(occ('-   [ ]  Priya  to send   the revised quote to Acme  by Friday'))).toBe(
      makeId(occ(base)),
    ));
  it('table rows ignore the date cell', () =>
    expect(makeId(occ('| Anita | Refresh the brand kit | 2026-10-09 |'))).toBe(
      makeId(occ('| Anita | Refresh the brand kit | 2026-10-16 |')),
    ));
  it('sha1Hex is a real SHA-1', () =>
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d'));
});
