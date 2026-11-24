import { describe, expect, it } from 'vitest';
import {
  extractCandidates,
  linkParents,
  matchActionLine,
  matchCheckbox,
  parseTable,
  type Candidate,
} from '../../../src/core/parse/candidates.js';
import { WarningCode } from '../../../src/core/warnings.js';

const ex = (s: string, off = 0) => extractCandidates(s, off);
const texts = (s: string) => ex(s).candidates.map((c) => c.text);
const codes = (s: string) => ex(s).warnings.map((w) => w.code);
const whys = (s: string) => ex(s).ignored.map((i) => i.why);

describe('A. matchCheckbox', () => {
  it('M3-01 unchecked', () =>
    expect(matchCheckbox('- [ ] Priya to send quote')).toEqual({
      indent: 0,
      checked: false,
      text: 'Priya to send quote',
    }));
  it('M3-02 checked', () => expect(matchCheckbox('- [x] a')?.checked).toBe(true));
  it('M3-03 uppercase X', () =>
    expect(matchCheckbox('- [X] Karan to approve')?.checked).toBe(true));
  it('M3-04 star', () => expect(matchCheckbox('* [ ] Lena')?.checked).toBe(false));
  it('M3-05 plus', () => expect(matchCheckbox('+ [ ] Sam')?.text).toBe('Sam'));
  it('M3-06 extra spaces', () => expect(matchCheckbox('-   [ ]  text')?.text).toBe('text'));
  it('M3-07 numbered', () =>
    expect(matchCheckbox('1. [ ] numbered item')?.text).toBe('numbered item'));
  it('M3-08 indent', () => expect(matchCheckbox('  - [ ] nested')?.indent).toBe(2));
  it('M3-09 bad marks', () => {
    for (const l of ['- [] no space', '- [  ] two spaces', '- [y] wrong mark'])
      expect(matchCheckbox(l)).toBeNull();
  });
  it('M3-10 no space after dash', () => expect(matchCheckbox('-[ ] x')).toBeNull());
  it('M3-11 empty text [GAP]', () => {
    expect(ex('- [ ]').candidates).toEqual([]);
    expect(codes('- [ ]')).toEqual([WarningCode.EMPTY_ITEM]);
  });
  it('M3-12 spaces only [GAP]', () => {
    expect(ex('- [ ]    ').candidates).toEqual([]);
    expect(codes('- [ ]    ')).toEqual([WarningCode.EMPTY_ITEM]);
  });
  it('M3-13 plain bullet', () => {
    expect(matchCheckbox('- plain bullet without box')).toBeNull();
    expect(texts('- plain bullet without box')).toEqual([]);
  });
  it('M3-14 brackets in text', () =>
    expect(matchCheckbox('- [ ] Fix [urgent] bug')?.text).toBe('Fix [urgent] bug'));
  it('tab indent counts as 4', () => expect(matchCheckbox('\t- [ ] x')?.indent).toBe(4));
});

describe('B. matchActionLine', () => {
  it('M3-20', () =>
    expect(matchActionLine('ACTION: Karan to circulate summary by 2026-10-01')?.text).toBe(
      'Karan to circulate summary by 2026-10-01',
    ));
  it('M3-21 lowercase', () => expect(matchActionLine('action: karan')?.text).toBe('karan'));
  it('M3-22 spaced', () => expect(matchActionLine('  ACTION:   spaced')?.text).toBe('spaced'));
  it('M3-23 empty [GAP]', () => {
    expect(texts('ACTION:')).toEqual([]);
    expect(codes('ACTION:')).toEqual([WarningCode.EMPTY_ITEM]);
  });
  it('M3-24 near misses', () => {
    for (const l of ['ACTIONS: x', 'Action item: x', 'INACTION: x'])
      expect(matchActionLine(l)).toBeNull();
  });
  it('M3-25 inside a fence', () => {
    const r = ex('```\nACTION: x\n```');
    expect(r.candidates).toEqual([]);
    expect(r.ignored).toEqual([{ line: 2, why: 'code' }]);
  });
});

const TBL = '| Owner | Action | Due |\n|---|---|---|\n';
describe('C. tables', () => {
  it('M3-30 one row', () => {
    const c = ex(TBL + '| Anita | Refresh kit | 2026-10-09 |').candidates;
    expect(c).toHaveLength(1);
    expect(c[0]?.table).toEqual({ owner: 'Anita', action: 'Refresh kit', due: '2026-10-09' });
    expect(c[0]?.text).toBe('Refresh kit');
  });
  it('M3-31 mixed case header', () =>
    expect(texts('| OWNER | action |\n|--|--|\n| A | do it |')).toEqual(['do it']));
  it('M3-32 no Due [GAP]', () =>
    expect(ex('| Owner | Action |\n|-|-|\n| A | x |').candidates[0]?.table?.due).toBe(''));
  it('M3-33 Status column', () => {
    const c = ex('| Status | Action | Owner | Due |\n|-|-|-|-|\n| open | x | A | d |')
      .candidates[0];
    expect(c?.table).toEqual({ owner: 'A', action: 'x', due: 'd', status: 'open' });
  });
  it('M3-34 empty owner [GAP]', () =>
    expect(ex(TBL + '|  | x | d |').candidates[0]?.table?.owner).toBe(''));
  it('M3-35 empty due [GAP]', () =>
    expect(ex(TBL + '| A | x |  |').candidates[0]?.table?.due).toBe(''));
  it('M3-36 empty action dropped [GAP]', () => {
    expect(texts(TBL + '| A |  | d |')).toEqual([]);
    expect(codes(TBL + '| A |  | d |')).toEqual([WarningCode.EMPTY_ITEM]);
  });
  it('M3-37 three rows with true line numbers', () => {
    const c = ex('intro\n' + TBL + '| A | a | 1 |\n| B | b | 2 |\n| C | c | 3 |').candidates;
    expect(c.map((x) => x.line)).toEqual([4, 5, 6]);
  });
  it('M3-38 table ends at first non-pipe line', () =>
    expect(texts(TBL + '| A | a | 1 |\nplain | with | pipes')).toEqual(['a']));
  it('M3-39 separator variants', () =>
    expect(texts('| Owner | Action |\n| :--- | ---: |\n| A | x |')).toEqual(['x']));
  it('M3-40 other headers', () => expect(texts('| Item | Cost |\n|-|-|\n| a | 3 |')).toEqual([]));
  it('M3-41 escaped pipe', () =>
    expect(ex(TBL + '| A | a \\| b | d |').candidates[0]?.text).toBe('a | b'));
  it('M3-42 header only', () => expect(ex(TBL).candidates).toEqual([]));
  it('M3-43 table in blockquote / fence', () => {
    const q = ex('> | Owner | Action |\n> |-|-|\n> | A | x |');
    expect(q.candidates).toEqual([]);
    expect(q.ignored).toEqual([{ line: 3, why: 'blockquote' }]);
    const f = ex('```\n' + TBL + '| A | x | d |\n```');
    expect(f.candidates).toEqual([]);
    expect(f.ignored.map((i) => i.why)).toEqual(['code']);
  });
  it('M3-44 short row [BAD]', () =>
    expect(ex(TBL + '| A | x |').candidates[0]?.table).toEqual({
      owner: 'A',
      action: 'x',
      due: '',
    }));
  it('parseTable returns null for a non-header', () =>
    expect(parseTable(['| a | b |'], 0)).toBeNull());
});

describe('D. ignore rules', () => {
  it('M3-50 blockquote', () => {
    const r = ex('> - [ ] Karan to refund by Friday');
    expect(r.candidates).toEqual([]);
    expect(r.ignored).toEqual([{ line: 1, why: 'blockquote' }]);
  });
  it('M3-51 indented quote', () => expect(whys('  > - [ ] x')).toEqual(['blockquote']));
  it('M3-52 nested quote', () => expect(whys('> > - [ ] x')).toEqual(['blockquote']));
  it('M3-53 only the second is a candidate', () =>
    expect(texts('> - [ ] x\n- [ ] y')).toEqual(['y']));
  it('M3-54 fence', () => {
    const r = ex('```\n- [ ] Owner to remediate\n```');
    expect(r.candidates).toEqual([]);
    expect(r.ignored).toEqual([{ line: 2, why: 'code' }]);
  });
  it('M3-55 tilde fence', () => expect(whys('~~~\n- [ ] x\n~~~')).toEqual(['code']));
  it('M3-56 language tag', () => expect(whys('```md\n- [ ] x\n```')).toEqual(['code']));
  it('M3-57 after the fence closes', () =>
    expect(texts('```\n- [ ] a\n```\n- [ ] b')).toEqual(['b']));
  it('M3-58 other fence char does not close', () => {
    const r = ex('```\n~~~\n- [ ] x\n```\n- [ ] y');
    expect(r.candidates.map((c) => c.text)).toEqual(['y']);
    expect(r.ignored).toHaveLength(1);
  });
  it('M3-59 one-line comment', () => {
    const r = ex('<!-- - [ ] Sam to buy tokens -->');
    expect(r.candidates).toEqual([]);
    expect(r.ignored).toEqual([{ line: 1, why: 'comment' }]);
  });
  it('M3-60 multi-line comment', () => {
    const r = ex('<!--\n- [ ] x\n-->\n- [ ] y');
    expect(r.candidates.map((c) => c.text)).toEqual(['y']);
    expect(r.ignored).toEqual([{ line: 2, why: 'comment' }]);
  });
  it('M3-61 checkbox after --> on the same line', () =>
    expect(texts('<!--\nnote -->- [ ] real')).toEqual(['real']));
  it('M3-62 comment inside a fence stays code, no leak', () => {
    const r = ex('```\n<!--\n- [ ] x\n```\n- [ ] y');
    expect(r.candidates.map((c) => c.text)).toEqual(['y']);
    expect(r.ignored.map((i) => i.why)).toEqual(['code']);
  });
  it('M3-63 fence inside a comment stays comment', () => {
    const r = ex('<!--\n```\n- [ ] x\n-->\n- [ ] y');
    expect(r.candidates.map((c) => c.text)).toEqual(['y']);
    expect(r.ignored.map((i) => i.why)).toEqual(['comment']);
  });
  it('M3-64 unclosed fence [BAD]', () => {
    const r = ex('- [ ] a\n```\n- [ ] b');
    expect(r.candidates.map((c) => c.text)).toEqual(['a']);
    expect(r.warnings).toMatchObject([{ code: WarningCode.FENCE_UNCLOSED, line: 2 }]);
    expect(r.ignored.map((i) => i.why)).toEqual(['code']);
  });
  it('M3-65 unclosed comment [BAD]', () => {
    const r = ex('- [ ] a\n<!-- start\n- [ ] b\n- [ ] c');
    expect(r.candidates.map((c) => c.text)).toEqual(['a']);
    expect(r.ignored.map((i) => i.why)).toEqual(['comment', 'comment']);
    expect(r.warnings).toHaveLength(1);
  });
  it('M3-66 list inside a blockquote', () =>
    expect(whys('> text\n>   - [ ] x')).toEqual(['blockquote']));
  it('M3-67 fence and quote: one reason, code wins', () =>
    expect(whys('```\n> - [ ] x\n```')).toEqual(['code']));
  it('M3-68 each ignored line recorded once', () => {
    const r = ex('> - [ ] a\n> - [ ] b');
    expect(r.ignored).toEqual([
      { line: 1, why: 'blockquote' },
      { line: 2, why: 'blockquote' },
    ]);
  });
});

describe('E. nesting', () => {
  const parent = (s: string) => ex(s).candidates.map((c) => c.parentLine);
  it('M3-70', () => expect(parent('- [ ] a\n  - [ ] b')).toEqual([undefined, 1]));
  it('M3-71 two children', () =>
    expect(parent('- [ ] a\n  - [ ] b\n  - [ ] c')).toEqual([undefined, 1, 1]));
  it('M3-72 grandchild points at the child', () =>
    expect(parent('- [ ] a\n  - [ ] b\n    - [ ] c')).toEqual([undefined, 1, 2]));
  it('M3-73 sibling has no parent', () =>
    expect(parent('- [ ] a\n  - [ ] b\n- [ ] c')).toEqual([undefined, 1, undefined]));
  it('M3-74 tab counts as 4 columns', () =>
    expect(parent('- [ ] a\n\t- [ ] b\n        - [ ] c')).toEqual([undefined, 1, 2]));
  it('M3-75 under a non-checkbox bullet [GAP]', () =>
    expect(parent('- [ ] a\n- plain\n  - [ ] b')).toEqual([undefined, undefined]));
  it('M3-76 jump back to a level with no parent', () =>
    expect(parent('    - [ ] a\n  - [ ] b')).toEqual([undefined, undefined]));
  it('M3-77 indented with no parent before it [GAP]', () =>
    expect(parent('  - [ ] a')).toEqual([undefined]));
  it('M3-78 a heading between breaks the link (pinned)', () =>
    expect(parent('- [ ] a\n## H\n  - [ ] b')).toEqual([undefined, undefined]));
  it('blank lines between do not break the link', () =>
    expect(parent('- [ ] a\n\n  - [ ] b')).toEqual([undefined, 1]));
  it('without body lines the in-between check is skipped', () => {
    const cs = [
      { line: 1, indent: 0, kind: 'checkbox' },
      { line: 5, indent: 2, kind: 'checkbox' },
    ] as Candidate[];
    linkParents(cs);
    expect(cs[1]?.parentLine).toBe(1);
  });
});

describe('F. whole file', () => {
  it('M3-80 line offset', () => {
    const r = ex('- [ ] a\n> - [ ] b', 5);
    expect(r.candidates[0]?.line).toBe(6);
    expect(r.ignored[0]?.line).toBe(7);
  });
  it('M3-81 empty body [BAD]', () =>
    expect(ex('')).toEqual({ candidates: [], ignored: [], warnings: [] }));
  it('M3-82 prose only', () =>
    expect(texts('Everybody should look at the prototype.\n- a bullet')).toEqual([]));
  it('M3-83 sections do not matter', () =>
    expect(texts('## Morning\n- [ ] a\n## Afternoon\n- [ ] b\n## Action items\n- [ ] c')).toEqual([
      'a',
      'b',
      'c',
    ]));
  it('M3-84 same text twice [DUP]', () => expect(texts('- [ ] a\n- [ ] a')).toEqual(['a', 'a']));
  it('M3-85 carriage returns', () => expect(texts('- [ ] a\r\n- [ ] b\r\n')).toEqual(['a', 'b']));
  it('M3-86 5,000 lines under 200 ms', () => {
    const body = Array.from({ length: 5000 }, (_, i) =>
      i % 3 ? `text ${i}` : `- [ ] item ${i}`,
    ).join('\n');
    const t = performance.now();
    ex(body);
    expect(performance.now() - t).toBeLessThan(200);
  });
  it('M3-87 property: never throws, lines in range [BAD]', () => {
    const pieces = [
      '- [ ] ',
      '- [x] ',
      '> ',
      '```',
      '~~~',
      '<!--',
      '-->',
      '| Owner | Action |',
      '|---|',
      'ACTION: ',
      '  ',
      '\t',
      'text',
      '\n',
      '\n',
      '|',
      '\\',
    ];
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let n = 0; n < 200; n++) {
      let s = '';
      const len = Math.floor(rnd() * 40);
      for (let k = 0; k < len; k++) s += pieces[Math.floor(rnd() * pieces.length)];
      const total = s.split('\n').length;
      const r = ex(s);
      for (const c of r.candidates) expect(c.line >= 1 && c.line <= total).toBe(true);
      for (const i of r.ignored) expect(i.line >= 1 && i.line <= total).toBe(true);
    }
  });
});
