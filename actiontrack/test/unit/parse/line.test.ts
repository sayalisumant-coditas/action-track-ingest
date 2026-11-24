import { describe, expect, it } from 'vitest';
import type { Candidate } from '../../../src/core/parse/candidates.js';
import {
  displayOwner,
  parseCandidate,
  splitOwnerTask,
  splitTaskDue,
} from '../../../src/core/parse/line.js';

const cand = (text: string, extra: Partial<Candidate> = {}): Candidate => ({
  line: 10,
  rawLine: `- [ ] ${text}`,
  checked: false,
  text,
  indent: 0,
  kind: 'checkbox',
  ...extra,
});
const parse = (text: string) => parseCandidate(cand(text));

describe('A. the 14 required sample rows', () => {
  it.each([
    [
      'M4-01',
      'Priya to send the revised quote to Acme by Friday',
      'Priya',
      'send the revised quote to Acme',
      'Friday',
    ],
    [
      'M4-02',
      'Priya N. to send revised quote to Acme — by Friday',
      'Priya N.',
      'send revised quote to Acme',
      'Friday',
    ],
    [
      'M4-03',
      'Rahul to set up the staging environment by 2026-09-08',
      'Rahul',
      'set up the staging environment',
      '2026-09-08',
    ],
    [
      'M4-04',
      '@anita: audit colour contrast on the dashboard by Mon',
      'anita',
      'audit colour contrast on the dashboard',
      'Mon',
    ],
    [
      'M4-05',
      'Anita & Rahul to agree on the component API by Wednesday',
      'Anita & Rahul',
      'agree on the component API',
      'Wednesday',
    ],
    ['M4-07', 'Someone to update the CRM notes', 'Someone', 'update the CRM notes', null],
    [
      'M4-08',
      'TBD to write the design-system changelog',
      'TBD',
      'write the design-system changelog',
      null,
    ],
    [
      'M4-09',
      'Lena to run the customer survey, results due 15 October',
      'Lena',
      'run the customer survey',
      '15 October',
    ],
    [
      'M4-10',
      'Sam to cut cloud costs by 10% — proposal by 2026-10-09',
      'Sam',
      'cut cloud costs by 10%',
      '2026-10-09',
    ],
    [
      'M4-11',
      'Karan to approve the Q4 cloud spend by 2026-10-02',
      'Karan',
      'approve the Q4 cloud spend',
      '2026-10-02',
    ],
    [
      'M4-12',
      'Priya to review the welcome email for accessibility',
      'Priya',
      'review the welcome email for accessibility',
      null,
    ],
    ['M4-13', 'Team to decide on the launch date', 'Team', 'decide on the launch date', null],
    [
      'M4-14',
      'Everyone to review the prototype before the next review',
      'Everyone',
      'review the prototype before the next review',
      null,
    ],
  ])('%s %s', (_id, input, owner, task, due) => {
    const r = parse(input);
    expect(r.ownerRaw).toBe(owner);
    expect(r.task).toBe(task);
    expect(r.dueRaw).toBe(due);
    expect(r.helperRaw).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('M4-06 owner with helper', () => {
    const r = parse('Lena (with Priya) to collect user feedback on the prototype by 2026-09-25');
    expect(r).toMatchObject({
      ownerRaw: 'Lena',
      helperRaw: 'Priya',
      task: 'collect user feedback on the prototype',
      dueRaw: '2026-09-25',
    });
  });
});

describe('B. splitOwnerTask', () => {
  it('M4-20 ACTION-stripped text', () =>
    expect(splitOwnerTask('Karan to circulate the offsite summary')).toEqual({
      ownerRaw: 'Karan',
      task: 'circulate the offsite summary',
    }));
  it('M4-21 will', () =>
    expect(splitOwnerTask('Priya will send the deck')).toEqual({
      ownerRaw: 'Priya',
      task: 'send the deck',
    }));
  it('M4-22 should', () =>
    expect(splitOwnerTask('Sam should confirm the budget')).toEqual({
      ownerRaw: 'Sam',
      task: 'confirm the budget',
    }));
  it('M4-23 "and" kept raw', () =>
    expect(splitOwnerTask('Anita and Rahul to agree').ownerRaw).toBe('Anita and Rahul'));
  it('M4-24 initial [NAME]', () =>
    expect(splitOwnerTask('Priya S. to sign off').ownerRaw).toBe('Priya S.'));
  it('M4-25 @name: raw lowercase, display capitalised', () => {
    expect(splitOwnerTask('@priya: check logs')).toEqual({ ownerRaw: 'priya', task: 'check logs' });
    expect(displayOwner('priya')).toBe('Priya');
    expect(displayOwner('Priya N.')).toBe('Priya N.');
  });
  it('M4-26 Name: task', () =>
    expect(splitOwnerTask('Karan: send invoice')).toEqual({
      ownerRaw: 'Karan',
      task: 'send invoice',
    }));
  it('M4-27 no owner [GAP]', () =>
    expect(splitOwnerTask('Send the invoice')).toEqual({ ownerRaw: '', task: 'Send the invoice' }));
  it('M4-28 "To do:" is not a name [GAP]', () => {
    expect(splitOwnerTask('To do: send invoice').ownerRaw).toBe('');
    expect(splitOwnerTask('Todo: send invoice').ownerRaw).toBe('');
    expect(splitOwnerTask('Note: send invoice').ownerRaw).toBe('');
  });
  it('M4-29 full name', () =>
    expect(splitOwnerTask('Meera Rao to book the call').ownerRaw).toBe('Meera Rao'));
  it('M4-30 full name with shared first name [NAME]', () =>
    expect(splitOwnerTask('Priya Nair to prepare the one-pager').ownerRaw).toBe('Priya Nair'));
  it('M4-31 helper list kept raw', () =>
    expect(splitOwnerTask('Lena (with Priya and Sam) to run it')).toEqual({
      ownerRaw: 'Lena',
      helperRaw: 'Priya and Sam',
      task: 'run it',
    }));
  it('M4-32 Someone / TBD [GAP]', () => {
    expect(splitOwnerTask('Someone to chase Acme').ownerRaw).toBe('Someone');
    expect(splitOwnerTask('TBD: chase Acme')).toEqual({ ownerRaw: 'TBD', task: 'chase Acme' });
  });
  it('M4-33 Everybody', () =>
    expect(splitOwnerTask('Everybody to read the doc').ownerRaw).toBe('Everybody'));
  it('M4-34 no task after "to" drops with a warning [GAP]', () => {
    expect(splitOwnerTask('Karan to')).toEqual({ ownerRaw: 'Karan', task: '' });
    const r = parse('Karan to');
    expect(r.task).toBe('');
    expect(r.warnings.map((w) => w.code)).toEqual(['EMPTY_ITEM']);
  });
  it('M4-35 first "to" only', () =>
    expect(splitOwnerTask('Priya to send the quote to Karan to confirm')).toEqual({
      ownerRaw: 'Priya',
      task: 'send the quote to Karan to confirm',
    }));
  it('M4-36 apostrophe survives', () => {
    const r = parse("Rahul to review Anita's PR by tomorrow");
    expect(r).toMatchObject({ ownerRaw: 'Rahul', task: "review Anita's PR", dueRaw: 'tomorrow' });
  });
  it('M4-37 whitespace cleaned, wording kept', () =>
    expect(splitOwnerTask('  Priya   to   send  the   deck  ')).toEqual({
      ownerRaw: 'Priya',
      task: 'send the deck',
    }));
  it('M4-38 lowercase sentence', () =>
    expect(splitOwnerTask('priya to send it')).toEqual({ ownerRaw: 'priya', task: 'send it' }));
  it('M4-39 "Priya, please …" has no owner pattern (pinned gap) [GAP]', () =>
    expect(splitOwnerTask('Priya, please send the quote').ownerRaw).toBe(''));
  it('verbs that look like names are not owners', () => {
    expect(splitOwnerTask('Call Karan to confirm').ownerRaw).toBe('');
    expect(splitOwnerTask('Reply to Acme').ownerRaw).toBe('');
    expect(splitOwnerTask('reply to Acme').ownerRaw).toBe('');
  });
});

describe('C. splitTaskDue', () => {
  it.each([
    ['M4-50', 'send quote by Friday', 'send quote', 'Friday'],
    ['M4-51', 'send quote — by Friday', 'send quote', 'Friday'],
    ['M4-52', 'send quote - by Friday', 'send quote', 'Friday'],
    ['M4-52', 'send quote, by Friday', 'send quote', 'Friday'],
    ['M4-53', 'send quote before 12 Oct', 'send quote', '12 Oct'],
    ['M4-54', 'send quote due Oct 3rd', 'send quote', 'Oct 3rd'],
    ['M4-55', 'send quote until Monday', 'send quote', 'Monday'],
    ['M4-56', 'fix bug EOD', 'fix bug', 'EOD'],
    ['M4-57', 'fix bug by EOD tomorrow', 'fix bug', 'EOD tomorrow'],
    ['M4-58', 'fix bug by tomorrow', 'fix bug', 'tomorrow'],
    ['M4-59', 'run survey, results due 15 October', 'run survey', '15 October'],
    ['M4-60', 'write proposal by 2026-10-09', 'write proposal', '2026-10-09'],
    ['M4-61', 'book hall by Wed 16 Sep', 'book hall', 'Wed 16 Sep'],
    ['M4-62', 'review report by end of next week', 'review report', 'end of next week'],
    ['M4-63', 'plan sprint by mid-October', 'plan sprint', 'mid-October'],
    ['M4-64', 'wrap up by end of month', 'wrap up', 'end of month'],
    ['M4-65', 'sign off by the end of the cutover', 'sign off', 'by the end of the cutover'],
    ['M4-66', 'review before the next review', 'review before the next review', null],
    ['M4-67', 'schedule cutover for Saturday 10 Oct', 'schedule cutover', 'Saturday 10 Oct'],
    ['M4-68', 'schedule cutover for Saturday', 'schedule cutover for Saturday', null],
    ['M4-69', 'prepare the renewal one-pager by Friday', 'prepare the renewal one-pager', 'Friday'],
    ['M4-70', 'check standby power', 'check standby power', null],
    ['M4-70', 'bypass the proxy', 'bypass the proxy', null],
    ['M4-71', 'cut cloud costs by 10%', 'cut cloud costs by 10%', null],
    ['M4-72', 'send quote by Friday please', 'send quote by Friday please', null],
    ['M4-73', 'send quote by Friday.', 'send quote', 'Friday'],
    ['M4-74', 'send by Friday by Monday', 'send by Friday', 'Monday'],
    ['M4-76', 'meet at 5 by the lake', 'meet at 5 by the lake', null],
    ['M4-77', 'review March sales figures', 'review March sales figures', null],
    [
      'on a full date',
      'demo the portal to Acme on 2026-10-14',
      'demo the portal to Acme',
      '2026-10-14',
    ],
    [
      'bare tomorrow',
      'circulate the offsite summary tomorrow',
      'circulate the offsite summary',
      'tomorrow',
    ],
    [
      'approved by legal',
      'get the contract approved by legal',
      'get the contract approved by legal',
      null,
    ],
    [
      'by <date> — comment',
      'write proposal by 2026-10-09 — see the template',
      'write proposal — see the template',
      '2026-10-09',
    ],
  ])('%s "%s"', (_id, input, task, due) => {
    expect(splitTaskDue(input)).toEqual({ task, dueRaw: due });
  });

  it('M4-75 a task that is only a date is dropped with a warning [GAP]', () => {
    expect(splitTaskDue('by Friday')).toEqual({ task: '', dueRaw: 'Friday' });
    const r = parse('by Friday');
    expect(r.task).toBe('');
    expect(r.warnings.map((w) => w.code)).toEqual(['EMPTY_ITEM']);
  });
});

describe('D. table candidates', () => {
  const table = (owner: string, action: string, due: string) =>
    parseCandidate(cand(action, { kind: 'table', table: { owner, action, due } }));

  it('M4-80 cells used directly', () =>
    expect(table('Anita', 'Publish brand kit', '2026-10-09')).toMatchObject({
      ownerRaw: 'Anita',
      task: 'Publish brand kit',
      dueRaw: '2026-10-09',
    }));
  it('M4-81 empty owner [GAP]', () =>
    expect(table('', 'Publish brand kit', '2026-10-09').ownerRaw).toBe(''));
  it('M4-82 empty due [GAP]', () =>
    expect(table('Anita', 'Publish brand kit', '').dueRaw).toBeNull());
  it('M4-83 due cell wins, task untouched', () =>
    expect(table('Anita', 'Publish brand kit by Friday', '2026-10-09')).toMatchObject({
      task: 'Publish brand kit by Friday',
      dueRaw: '2026-10-09',
    }));
  it('M4-84 bare first name [NAME]', () => expect(table('Priya', 'x', '').ownerRaw).toBe('Priya'));
  it('M4-85 prose due passed as is', () =>
    expect(table('Karan', 'Cutover', 'after the cutover').dueRaw).toBe('after the cutover'));
  it('empty due cell falls back to a trailing clause in the action', () =>
    expect(table('Anita', 'Publish brand kit by Friday', '')).toMatchObject({
      task: 'Publish brand kit',
      dueRaw: 'Friday',
    }));
});

describe('E. properties', () => {
  it('M4-94 wording is never lower-cased or re-ordered', () => {
    const r = parse('Priya to Send The Deck By Friday');
    expect(r.task).toBe('Send The Deck');
  });
  it('M4-95 random strings never throw; output words come from the input', () => {
    let s = 4242;
    const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const vocab = [
      'Priya',
      'to',
      'by',
      'Friday',
      '—',
      '-',
      ',',
      'EOD',
      'tomorrow',
      '10%',
      'N.',
      '&',
      'and',
      '(with',
      'Sam)',
      '@anita:',
      'before',
      'due',
      'the',
      'end',
      'of',
      'month',
      '2026-10-09',
      'Oct',
      '3rd',
      'for',
      '.',
      ':',
    ];
    for (let i = 0; i < 500; i++) {
      const words = Array.from(
        { length: 1 + Math.floor(next() * 12) },
        () => vocab[Math.floor(next() * vocab.length)] as string,
      );
      const input = words.join(next() < 0.2 ? '  ' : ' ');
      const r = parse(input);
      const inputTokens = new Set(input.split(/\s+/));
      const check = (txt: string | null) => {
        for (const t of (txt ?? '').split(/\s+/).filter(Boolean)) {
          // tokens may lose trailing punctuation or a leading @, never gain characters
          const ok = [...inputTokens].some((w) => w.includes(t.replace(/^@/, '')) || t.includes(w));
          expect(ok, `${t} from "${input}"`).toBe(true);
        }
      };
      check(r.task);
      check(r.dueRaw);
      check(r.ownerRaw);
    }
  });
});
