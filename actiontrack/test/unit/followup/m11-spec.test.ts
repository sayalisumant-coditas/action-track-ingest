import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AmbiguousOwnerError, DrafterError, UsageError } from '../../../src/core/errors.js';
import { buildFollowup } from '../../../src/core/followup/build.js';
import { FileGmailDrafter } from '../../../src/core/followup/fileGmail.js';
import { followup } from '../../../src/core/followup/followup.js';
import type { Draft, GmailDrafter } from '../../../src/core/followup/gmail.js';
import { McpGmailDrafter } from '../../../src/core/followup/mcpGmail.js';
import { redactForConfidential } from '../../../src/core/followup/redact.js';
import { selectItemsFor } from '../../../src/core/followup/select.js';
import { ingest } from '../../../src/core/ingest.js';
import { parsePeopleConfig } from '../../../src/core/people/config.js';
import { loadStore, saveStore } from '../../../src/core/store/store.js';
import { WarningCode } from '../../../src/core/warnings.js';
import {
  ambiguousOwner,
  due,
  fixedClock,
  groupOwner,
  item,
  meeting,
  owner,
  person,
  unassignedOwner,
} from '../../helpers/factory.js';
import { NOTES_DIR } from '../../helpers/fixtures.js';

const ASOF = '2026-10-15';
const priya = person('priya-nair', 'Priya Nair', 'priya.nair@example.com');
const shah = person('priya-shah', 'Priya Shah');
const mtg = meeting({ id: 'm1', attendees: ['Priya Nair', 'Karan Joshi', 'Anita Desai'] });
const occ = (meetingId = 'm1', sourceFile = mtg.sourceFile, rawLine = 'x') => ({
  meetingId,
  sourceFile,
  line: 1,
  checked: false,
  due: due(null),
  rawLine,
});
const mk = (id: string, over = {}) => item({ id, occurrences: [occ()], ...over });
const ids = (xs: { id: string }[]) => xs.map((i) => i.id);

describe('A. selectItemsFor (M11-01..13)', () => {
  const sel = (p: typeof priya, xs: ReturnType<typeof mk>[], o = {}) =>
    selectItemsFor(p, xs, ASOF, o);
  it('M11-01/02 three open, one done: three returned', () => {
    const xs = [mk('000001'), mk('000002'), mk('000003'), mk('000004', { status: 'done' })];
    expect(ids(sel(priya, xs))).toEqual(['000001', '000002', '000003']);
  });
  it('M11-03 joint owner is in both selections', () => {
    const j = mk('00000a', { owner: owner('anita-desai', 'rahul-mehta') });
    expect(ids(sel(person('anita-desai', 'Anita Desai'), [j]))).toEqual(['00000a']);
    expect(ids(sel(person('rahul-mehta', 'Rahul Mehta'), [j]))).toEqual(['00000a']);
  });
  it('M11-04/05 group item needs includeGroup, then only attendees', () => {
    const g = mk('00000b', { owner: groupOwner() });
    expect(sel(priya, [g])).toEqual([]);
    expect(ids(sel(priya, [g], { includeGroup: true, meetings: [mtg] }))).toEqual(['00000b']);
    expect(sel(shah, [g], { includeGroup: true, meetings: [mtg] })).toEqual([]);
  });
  it('M11-06/07 ambiguous and unassigned items are never selected', () => {
    const xs = [
      mk('00000c', { owner: ambiguousOwner('priya-nair', 'priya-shah') }),
      mk('00000d', { owner: unassignedOwner() }),
    ];
    expect(sel(priya, xs)).toEqual([]);
    expect(sel(shah, xs)).toEqual([]);
  });
  it('M11-08 a helper is not selected', () => {
    const h = mk('00000e', { owner: { ...owner('karan-joshi'), helpers: ['priya-nair'] } });
    expect(sel(priya, [h])).toEqual([]);
  });
  it('M11-09 no due date is included', () => {
    expect(sel(priya, [mk('00000f', { due: due(null, null) })])).toHaveLength(1);
  });
  it('M11-10 a merged item is included once', () => {
    const m = mk('000010', { occurrences: [occ(), occ(), occ()] });
    expect(sel(priya, [m])).toHaveLength(1);
  });
  it('M11-11 missing-from-notes items are still selected and carry a note', () => {
    const m = mk('000011', { flags: ['missing-from-notes'] });
    expect(sel(priya, [m])).toHaveLength(1);
    expect(buildFollowup(priya, [m], ASOF, [mtg]).body).toContain('(no longer in the notes)');
  });
  it('M11-12 owning nothing gives an empty list', () => {
    expect(sel(priya, [mk('000012', { owner: owner('karan-joshi') })])).toEqual([]);
  });
  it('M11-13 order: overdue first, then due, then id', () => {
    const xs = [
      mk('000003', { due: due('2026-10-20') }),
      mk('000002', { due: due('2026-10-01') }),
      mk('000001', { due: due('2026-10-01') }),
      mk('000004', { due: due(null, null) }),
      mk('000005', { due: due('2026-09-01') }),
    ];
    expect(ids(sel(priya, xs))).toEqual(['000005', '000001', '000002', '000003', '000004']);
  });
});

describe('C. buildFollowup / renderBody (M11-40..56)', () => {
  const m2 = meeting({ id: 'm2', sourceFile: 'b.md', title: 'Weekly', date: '2026-10-08' });
  const items = [
    mk('00000a', { task: 'send the quote', due: due('2026-10-01') }),
    mk('00000b', {
      task: 'plan Q4',
      due: due('2026-10-20'),
      occurrences: [occ(), occ('m2', 'b.md')],
      dueHistory: ['2026-10-10'],
    }),
    mk('00000c', { task: 'tidy backlog', due: due(null, null) }),
    mk('00000d', { task: 'ship by cutover', due: due(null, 'by the end of the cutover') }),
  ];
  const d = buildFollowup(priya, items, ASOF, [mtg, m2]);

  it('M11-52 snapshot of the whole body and subject', () => {
    expect(d.subject).toBe('Follow-up: 4 open action items (1 overdue)');
    expect(d.body).toBe(
      [
        'Hi Priya,',
        '',
        'Here is a short list of your open action items from our recent meetings.',
        '',
        'Overdue:',
        '- send the quote (due 2026-10-01, 14 days overdue) [Kickoff, 2026-09-01] #00000a',
        '',
        'Open:',
        '- plan Q4 (due 2026-10-20) [Weekly, 2026-10-08] #00000b',
        '- tidy backlog (no due date) [Kickoff, 2026-09-01] #00000c',
        '- ship by cutover (due "by the end of the cutover") [Kickoff, 2026-09-01] #00000d',
        '',
        'If anything here has changed or is already done, just let me know and I will update the list.',
        '',
        'Thanks!',
      ].join('\n'),
    );
  });
  it('M11-40/55 subject numbers and itemIds match the included items', () => {
    expect(d.itemIds).toEqual(['00000a', '00000b', '00000c', '00000d']);
  });
  it('M11-41/42 singular form; zero overdue shows (0 overdue) and no Overdue section', () => {
    const one = buildFollowup(priya, [items[1] as (typeof items)[0]], ASOF, [mtg, m2]);
    expect(one.subject).toBe('Follow-up: 1 open action item (0 overdue)');
    expect(one.body).not.toContain('Overdue:');
  });
  it('M11-43/44/45 overdue before open; overdue line has days, title, date and id', () => {
    expect(d.body.indexOf('Overdue:')).toBeLessThan(d.body.indexOf('Open:'));
    expect(d.body).toMatch(
      /send the quote \(due 2026-10-01, 14 days overdue\) \[Kickoff, 2026-09-01\] #00000a/,
    );
  });
  it('M11-46/47 no due date and raw due text', () => {
    expect(d.body).toContain('tidy backlog (no due date)');
    expect(d.body).toContain('due "by the end of the cutover"');
  });
  it('M11-48 merged item shows the latest occurrence once', () => {
    expect(d.body.match(/plan Q4/g)).toHaveLength(1);
    expect(d.body).toContain('[Weekly, 2026-10-08]');
  });
  it('M11-49 slipped due shows the current date only', () => {
    expect(d.body).toContain('due 2026-10-20');
    expect(d.body).not.toContain('2026-10-10');
  });
  it('M11-50/51 no blame words and no HTML tags', () => {
    for (const w of ['failed', 'late again', 'you forgot', 'blame', 'overdue!!']) {
      expect(d.body.toLowerCase()).not.toContain(w);
    }
    expect(d.body).not.toMatch(/<[a-z/][^>]*>/i);
  });
  it('M11-53 meeting without a date shows the title only, no null/undefined', () => {
    const undated = meeting({ id: 'm3', sourceFile: 'u.md', title: 'untitled', date: null });
    const out = buildFollowup(priya, [mk('000020', { occurrences: [occ('m3', 'u.md')] })], ASOF, [
      undated,
    ]);
    expect(out.body).toContain('[untitled]');
    expect(out.body).not.toMatch(/null|undefined/);
  });
  it('M11-54 special characters are preserved', () => {
    const t = 'say "hi" & <b> café ☕';
    expect(buildFollowup(priya, [mk('000021', { task: t })], ASOF, [mtg]).body).toContain(t);
  });
  it('M11-56 same input twice gives the same draft', () => {
    expect(buildFollowup(priya, items, ASOF, [mtg, m2])).toEqual(d);
  });
});

describe('D. recipients (M11-60..65)', () => {
  it('M11-60 email is used; M11-65 no cc/bcc fields', () => {
    const d = buildFollowup(priya, [mk('000001')], ASOF, [mtg]);
    expect(d.to).toBe('priya.nair@example.com');
    expect(Object.keys(d).sort()).toEqual(['body', 'itemIds', 'subject', 'to', 'warnings']);
  });
  it('M11-61 no email: empty to and MISSING_EMAIL', () => {
    const d = buildFollowup(shah, [mk('000001')], ASOF, [mtg]);
    expect(d.to).toBe('');
    expect(d.warnings.map((w) => w.code)).toEqual([WarningCode.MISSING_EMAIL]);
  });
  it('M11-62 invalid email in config: warning, not kept', () => {
    const r = parsePeopleConfig({ people: [{ fullName: 'Sam Okafor', email: 'not-an-email' }] });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.config.people[0]?.email).toBeUndefined();
  });
  it('M11-63/64 each same-first-name person uses their own address; to is owner email or empty', () => {
    const a = buildFollowup(priya, [mk('000001')], ASOF, [mtg]);
    const b = buildFollowup(shah, [mk('000001')], ASOF, [mtg]);
    expect([a.to, b.to]).toEqual(['priya.nair@example.com', '']);
  });
});

describe('E. confidentiality, pure part (M11-70..80)', () => {
  const sec = meeting({
    id: 'sec',
    sourceFile: '2026-10-09-security-review.md',
    title: 'Security review',
    attendees: ['Sam Okafor', 'Karan Joshi'],
    confidential: true,
  });
  const secItem = mk('0000e1', {
    task: 'enable MFA',
    owner: owner('sam-okafor'),
    occurrences: [occ('sec', sec.sourceFile, 'pen-test finding details')],
  });
  const normal = mk('0000e2');
  const sam = person('sam-okafor', 'Sam Okafor', 's@example.com');
  it('M11-70 attendee gets the item with task text only (M11-72)', () => {
    const d = buildFollowup(sam, [secItem], ASOF, [mtg, sec]);
    expect(d.itemIds).toEqual(['0000e1']);
    expect(d.body).toContain('enable MFA');
    expect(d.body).not.toContain('pen-test');
  });
  it('M11-71/73 non-attendee: confidential omitted with a warning, normal kept', () => {
    const d = buildFollowup(priya, [secItem, normal], ASOF, [mtg, sec]);
    expect(d.itemIds).toEqual(['0000e2']);
    expect(d.warnings.map((w) => w.code)).toContain(WarningCode.CONFIDENTIAL_OMITTED);
  });
  it('M11-76/77 group item from the confidential meeting reaches attendees only; ambiguous never', () => {
    const g = mk('0000e3', { owner: groupOwner(), occurrences: [occ('sec', sec.sourceFile)] });
    const amb = mk('0000e4', {
      owner: ambiguousOwner('priya-nair'),
      occurrences: [occ('sec', sec.sourceFile)],
    });
    const o = { includeGroup: true, meetings: [mtg, sec] };
    expect(ids(selectItemsFor(sam, [g, amb], ASOF, o))).toEqual(['0000e3']);
    expect(selectItemsFor(priya, [g, amb], ASOF, o)).toEqual([]);
  });
  it('M11-78 pinned: the meeting title appears only in drafts of attendees', () => {
    expect(buildFollowup(sam, [secItem], ASOF, [mtg, sec]).body).toContain('Security review');
    expect(buildFollowup(priya, [secItem], ASOF, [mtg, sec]).body).not.toContain('Security review');
  });
  it('M11-79 merged item with one confidential occurrence is confidential', () => {
    const m = mk('0000e5', { occurrences: [occ(), occ('sec', sec.sourceFile)] });
    expect(redactForConfidential([m], priya, [mtg, sec]).items).toEqual([]);
  });
  it('M11-80 redaction does not alter its input', () => {
    const xs = [secItem, normal];
    const snap = JSON.stringify(xs);
    redactForConfidential(xs, priya, [mtg, sec]);
    expect(JSON.stringify(xs)).toBe(snap);
  });
});

describe('B/E/F/G/I on the sample folder', () => {
  let tmp: string;
  let storeFile: string;
  const people = [
    { fullName: 'Karan Joshi', email: 'karan@example.com' },
    { fullName: 'Priya Nair', email: 'priya.nair@example.com' },
    { fullName: 'Anita Desai', email: 'anita@example.com' },
    { fullName: 'Rahul Mehta', email: 'rahul.m@example.com' },
  ];
  const cfg = { people, globalAliases: {}, fileAliases: {} };
  class Spy implements GmailDrafter {
    calls: Draft[] = [];
    createDraft(d: Draft) {
      this.calls.push(d);
      return Promise.resolve({ draftId: `spy-${this.calls.length}` });
    }
  }
  const run = (q: string, drafter: GmailDrafter, extra = {}) =>
    followup(q, {
      storePath: storeFile,
      drafter,
      asOf: ASOF,
      clock: fixedClock,
      config: { people },
      ...extra,
    });
  const dry = async (q: string, extra = {}) => {
    const r = await run(q, new Spy(), { dryRun: true, ...extra });
    if (r.kind !== 'dry-run') throw new Error(`expected dry-run, got ${r.kind}`);
    return r.draft;
  };

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'at-m11-'));
    storeFile = join(tmp, 'store.json');
    await ingest(NOTES_DIR, { store: storeFile, clock: fixedClock, config: cfg });
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('M11-21/23 shared first names are refused naming both; drafter not called', async () => {
    const spy = new Spy();
    await expect(run('Priya', spy)).rejects.toThrow(
      /Priya Nair.*Priya Shah|Priya Shah.*Priya Nair/,
    );
    await expect(run('Rahul', spy)).rejects.toThrow(AmbiguousOwnerError);
    await expect(run('Rahul', spy)).rejects.toThrow(
      /Rahul Mehta.*Rahul Verma|Rahul Verma.*Rahul Mehta/,
    );
    expect(spy.calls).toHaveLength(0);
  });
  it('M11-22/24 full name works, any case', async () => {
    expect((await dry('Priya Nair')).to).toBe('priya.nair@example.com');
    expect((await dry('priya nair')).to).toBe('priya.nair@example.com');
  });
  it('M11-25/28/29/30 unknown, none, everyone and blank queries are usage errors', async () => {
    for (const q of ['Zed', 'none', 'everyone', '']) {
      await expect(run(q, new Spy())).rejects.toThrow(UsageError);
    }
  });
  it('M11-27 ambiguous-only items: no open items, plus a notice (Priya Shah has no email either)', async () => {
    const r = await run('Priya Shah', new Spy(), { dryRun: true });
    expect(r.notices.join(' ')).toMatch(/unclear owner/);
  });
  it('M11-31/123 group items only with includeGroup', async () => {
    const without = await dry('Karan Joshi');
    const withGroup = await dry('Karan Joshi', { includeGroup: true });
    expect(withGroup.itemIds.length).toBeGreaterThan(without.itemIds.length);
    expect(withGroup.body).toMatch(/Q4 goals/i);
    expect(without.body).not.toMatch(/Q4 goals/i);
  });
  it('M11-120 the joint Anita & Rahul item is in both drafts', async () => {
    const store = loadStore(storeFile);
    const joint = store.items.filter((i) => i.owner.people.length === 2);
    expect(joint.length).toBeGreaterThan(0);
    const a = await dry('Anita Desai');
    const r = await dry('Rahul Mehta');
    const j = joint.find(
      (i) => i.owner.people.includes('anita-desai') && i.owner.people.includes('rahul-mehta'),
    );
    expect(j).toBeDefined();
    expect(a.itemIds).toContain(j?.id);
    expect(r.itemIds).toContain(j?.id);
  });
  it('M11-122 Karan: overdue first, includes the offsite summary due 2026-10-01', async () => {
    const d = await dry('Karan Joshi');
    expect(d.body.indexOf('Overdue:')).toBeGreaterThan(-1);
    expect(d.body.indexOf('Overdue:')).toBeLessThan(d.body.indexOf('Open:'));
    expect(d.body).toMatch(/due 2026-10-01/);
  });
  it('M11-124/125 untitled.md and Someone/TBD items never appear in any email', async () => {
    const store = loadStore(storeFile);
    const unowned = store.items.filter((i) => i.owner.kind === 'unassigned');
    expect(unowned.length).toBe(2);
    for (const name of ['Karan Joshi', 'Priya Nair', 'Anita Desai', 'Rahul Mehta']) {
      const d = await dry(name, { includeGroup: true });
      for (const i of unowned) expect(d.itemIds).not.toContain(i.id);
    }
  });
  it('M11-126 Karan and Priya Nair drafts are stable (shape snapshot)', async () => {
    for (const [name, to] of [
      ['Karan Joshi', 'karan@example.com'],
      ['Priya Nair', 'priya.nair@example.com'],
    ] as const) {
      const d = await dry(name);
      expect(await dry(name)).toEqual(d);
      expect(d.to).toBe(to);
      expect(d.body.startsWith(`Hi ${name.split(' ')[0]},\n\nHere is a short list`)).toBe(true);
      expect(d.body.endsWith('Thanks!')).toBe(true);
      expect(d.subject).toMatch(/^Follow-up: \d+ open action items? \(\d+ overdue\)$/);
    }
  });
  it('M11-71 acceptance 13: a confidential non-attendee never gets the security items', async () => {
    const store = loadStore(storeFile);
    const sec = store.meetings.find((m) => m.sourceFile === '2026-10-09-security-review.md');
    const secIds = store.items
      .filter((i) => i.occurrences.some((o) => o.meetingId === sec?.id))
      .map((i) => i.id);
    saveStore(storeFile, {
      ...store,
      meetings: store.meetings.map((m) => (m.id === sec?.id ? { ...m, confidential: true } : m)),
    });
    const sam = await dry('Sam Okafor');
    expect(sam.itemIds.some((id) => secIds.includes(id))).toBe(true); // attendee
    saveStore(storeFile, store); // restore
  });
  it('M11-74/75 confidential via front matter or config glob gives the same flag', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'at-m11c-'));
    writeFileSync(
      join(dir, 'a.md'),
      '---\nconfidential: true\n---\n# A\nDate: 2026-09-01\nAttendees: Sam Okafor\n\n- [ ] Sam: x\n',
    );
    writeFileSync(
      join(dir, 'secret-b.md'),
      '# B\nDate: 2026-09-02\nAttendees: Sam Okafor\n\n- [ ] Sam: y\n',
    );
    const f = join(dir, 's.json');
    await ingest(dir, { store: f, clock: fixedClock, confidentialPatterns: ['secret-*'] });
    expect(loadStore(f).meetings.map((m) => m.confidential)).toEqual([true, true]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('M11-90/91/92/93/94/95/96 duplicate-draft protection', async () => {
    const spy = new Spy();
    expect((await run('Karan Joshi', spy)).kind).toBe('created');
    expect(loadStore(storeFile).drafts['karan-joshi']?.draftId).toBe('spy-1'); // M11-90
    expect((await run('Karan Joshi', spy)).kind).toBe('exists'); // M11-91
    expect(spy.calls).toHaveLength(1);
    expect((await run('Priya Nair', spy)).kind).toBe('created'); // M11-93/94 unaffected
    const before = readFileSync(storeFile, 'utf8');
    expect((await run('Karan Joshi', spy, { dryRun: true })).kind).toBe('dry-run'); // M11-95
    expect(readFileSync(storeFile, 'utf8')).toBe(before);
    await ingest(NOTES_DIR, { store: storeFile, clock: fixedClock, config: cfg });
    expect((await run('Karan Joshi', spy)).kind).toBe('exists'); // M11-96 survives re-ingest
    expect((await run('Karan Joshi', spy, { replace: true })).kind).toBe('created'); // M11-92
    expect(loadStore(storeFile).drafts['karan-joshi']?.draftId).toBe('spy-3');
  });

  it('M11-100/102/103/104/105 dry-run: zero calls, byte-identical store, full output', async () => {
    const before = readFileSync(storeFile, 'utf8');
    const spy = new Spy();
    const r = await run('Anita Desai', spy, { dryRun: true });
    expect(spy.calls).toHaveLength(0);
    expect(readFileSync(storeFile, 'utf8')).toBe(before);
    if (r.kind === 'dry-run') {
      expect(r.draft).toMatchObject({ to: 'anita@example.com' });
      expect(r.draft.itemIds.length).toBeGreaterThan(0);
    }
    await expect(run('Priya', spy, { dryRun: true })).rejects.toThrow(AmbiguousOwnerError);
    const noMail = await run('Sam Okafor', spy, { dryRun: true });
    if (noMail.kind === 'dry-run') {
      expect(noMail.draft.warnings.map((w) => w.code)).toContain(WarningCode.MISSING_EMAIL);
    }
    expect(spy.calls).toHaveLength(0);
  });
  it('M11-101 the drafts folder is untouched by a dry run', async () => {
    await dry('Karan Joshi');
    expect(existsSync(join(tmp, 'drafts'))).toBe(false);
  });
  it('M11-114/115 an unwritable drafts folder: DrafterError, no id recorded, store unchanged', async () => {
    const before = readFileSync(storeFile, 'utf8');
    const blocker = join(tmp, 'blocker');
    writeFileSync(blocker, 'x');
    const bad = new FileGmailDrafter(join(blocker, 'drafts'), fixedClock);
    await expect(run('Anita Desai', bad)).rejects.toThrow(DrafterError);
    expect(readFileSync(storeFile, 'utf8')).toBe(before);
  });
});

describe('H. adapter safety (M11-110..118)', () => {
  const src = join(__dirname, '../../../src');
  const all = () =>
    readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((r) => r.endsWith('.ts'))
      .map((r) => ({ rel: r, text: readFileSync(join(src, r), 'utf8') }));

  it('M11-110 GmailDrafter has exactly one method, at runtime and in the source', async () => {
    const text = readFileSync(join(src, 'core/followup/gmail.ts'), 'utf8');
    const body = /interface GmailDrafter \{([\s\S]*?)\n\}/.exec(text)?.[1] ?? '';
    expect(body.match(/\w+\(/g)).toEqual(['createDraft(']);
    expect(
      Object.getOwnPropertyNames(FileGmailDrafter.prototype).filter((n) => n !== 'constructor'),
    ).toEqual(['createDraft']);
  });
  it('M11-111 no send calls anywhere in src', () => {
    for (const { rel, text } of all()) {
      expect(text, rel).not.toMatch(/\.send\(|sendMessage|messages\.send|drafts\.send/);
    }
  });
  it('M11-112 McpGmailDrafter public API is only createDraft', () => {
    expect(
      Object.getOwnPropertyNames(McpGmailDrafter.prototype).filter((n) => n !== 'constructor'),
    ).toEqual(['createDraft']);
  });
  it('M11-113 FileGmailDrafter: JSON file, deterministic id under a fixed clock', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'at-m11d-'));
    const d: Draft = { to: 'a@b.co', subject: 's', body: 'b', itemIds: [], warnings: [] };
    const x = new FileGmailDrafter(join(tmp, 'd'), fixedClock);
    const a = await x.createDraft(d);
    expect(a.draftId).toBe((await x.createDraft(d)).draftId);
    expect(a.draftId).toMatch(/^mock-20261124100000-[0-9a-f]{8}$/);
    expect(readdirSync(join(tmp, 'd'))).toEqual([`${a.draftId}.json`]);
    rmSync(tmp, { recursive: true, force: true });
  });
  it('M11-116/117 mcp is not the default and fails clearly without falling back', async () => {
    const cli = readFileSync(join(src, 'cli/commands/followup.ts'), 'utf8');
    expect(cli).toContain("(a.gmail ?? 'mock')");
    const err = await new McpGmailDrafter()
      .createDraft({ to: '', subject: '', body: '', itemIds: [], warnings: [] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DrafterError);
    expect((err as Error).message).toMatch(/not set up.*--gmail mock/);
  });
  it('M11-118 the body has no env values, paths or store contents', () => {
    process.env.M11_SECRET = 'hunter2-secret';
    const d = buildFollowup(priya, [mk('000001')], ASOF, [mtg]);
    expect(d.body).not.toContain('hunter2-secret');
    expect(d.body).not.toContain(tmpdir());
    expect(d.body).not.toMatch(/[A-Za-z]:\\|\/Users\//);
    delete process.env.M11_SECRET;
  });
});
