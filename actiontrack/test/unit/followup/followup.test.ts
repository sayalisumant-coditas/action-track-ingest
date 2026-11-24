import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AmbiguousOwnerError, DrafterError, UsageError } from '../../../src/core/errors.js';
import { buildFollowup } from '../../../src/core/followup/build.js';
import { FileGmailDrafter } from '../../../src/core/followup/fileGmail.js';
import { followup } from '../../../src/core/followup/followup.js';
import type { Draft, GmailDrafter } from '../../../src/core/followup/gmail.js';
import { McpGmailDrafter } from '../../../src/core/followup/mcpGmail.js';
import { redactForConfidential } from '../../../src/core/followup/redact.js';
import { selectItemsFor } from '../../../src/core/followup/select.js';
import { ingest } from '../../../src/core/ingest.js';
import { emptyStore, loadStore, saveStore, type Store } from '../../../src/core/store/store.js';
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
const noMail = person('sam-okafor', 'Sam Okafor');
const mtg = meeting({ id: 'm1', attendees: ['Priya Nair', 'Karan Joshi'] });
const conf = meeting({
  id: 'sec',
  sourceFile: '2026-10-09-security-review.md',
  title: 'Security review',
  attendees: ['Karan Joshi', 'Sam Okafor'],
  confidential: true,
});

const mk = (id: string, over = {}) =>
  item({
    id,
    occurrences: [
      {
        meetingId: 'm1',
        sourceFile: mtg.sourceFile,
        line: 1,
        checked: false,
        due: due(null),
        rawLine: 'x',
      },
    ],
    ...over,
  });

describe('selectItemsFor', () => {
  const all = [
    mk('000001', { task: 'overdue one', due: due('2026-10-01') }),
    mk('000002', { task: 'open later', due: due('2026-10-20') }),
    mk('000003', { task: 'no date', due: due(null, null) }),
    mk('000004', { owner: owner('karan-joshi') }),
    mk('000005', { owner: owner('karan-joshi', 'priya-nair'), due: due('2026-10-02') }),
    mk('000006', { status: 'done' }),
    mk('000007', { owner: ambiguousOwner('priya-nair', 'priya-shah') }),
    mk('000008', { owner: unassignedOwner() }),
    mk('000009', { owner: groupOwner() }),
  ];
  it('takes open items they own, joint included; overdue first, no-date last', () => {
    const r = selectItemsFor(priya, all, ASOF).map((i) => i.id);
    expect(r).toEqual(['000001', '000005', '000002', '000003']);
  });
  it('never selects done, ambiguous or unassigned items', () => {
    const r = selectItemsFor(priya, all, ASOF).map((i) => i.id);
    for (const bad of ['000006', '000007', '000008']) expect(r).not.toContain(bad);
  });
  it('group items only with includeGroup, and only for attendees', () => {
    expect(selectItemsFor(priya, all, ASOF).map((i) => i.id)).not.toContain('000009');
    expect(
      selectItemsFor(priya, all, ASOF, { includeGroup: true, meetings: [mtg] }).map((i) => i.id),
    ).toContain('000009');
    expect(
      selectItemsFor(noMail, all, ASOF, { includeGroup: true, meetings: [mtg] }).map((i) => i.id),
    ).not.toContain('000009');
  });
  it('does not modify its input', () => {
    const snap = JSON.stringify(all);
    selectItemsFor(priya, all, ASOF);
    expect(JSON.stringify(all)).toBe(snap);
  });
});

describe('redactForConfidential', () => {
  const secret = mk('0000s1', {
    task: 'fix the auth bypass',
    owner: owner('sam-okafor'),
    occurrences: [
      {
        meetingId: 'sec',
        sourceFile: conf.sourceFile,
        line: 1,
        checked: false,
        due: due(null),
        rawLine: 'secret raw',
      },
    ],
  });
  const normal = mk('000010');
  it('drops confidential items for non-attendees and warns', () => {
    const r = redactForConfidential([secret, normal], priya, [mtg, conf]);
    expect(r.items).toEqual([normal]);
    expect(r.warnings[0]?.code).toBe(WarningCode.CONFIDENTIAL_OMITTED);
    expect(r.warnings[0]?.message).toContain(conf.sourceFile);
  });
  it('keeps them for attendees', () => {
    const r = redactForConfidential([secret], noMail, [mtg, conf]);
    expect(r.items).toEqual([secret]);
    expect(r.warnings).toEqual([]);
  });
  it('a merged item counts as confidential if any occurrence is', () => {
    const merged = { ...normal, occurrences: [...normal.occurrences, ...secret.occurrences] };
    expect(redactForConfidential([merged], priya, [mtg, conf]).items).toEqual([]);
  });
});

describe('buildFollowup / renderBody', () => {
  const items = [
    mk('000001', { task: 'send the quote', due: due('2026-10-01') }),
    mk('000002', { task: 'plan Q4', due: due('2026-10-20') }),
    mk('000003', { task: 'tidy backlog', due: due(null, null) }),
  ];
  it('subject counts open and overdue; overdue listed before open', () => {
    const d = buildFollowup(priya, items, ASOF, [mtg]);
    expect(d.subject).toBe('Follow-up: 3 open action items (1 overdue)');
    expect(d.to).toBe('priya.nair@example.com');
    expect(d.itemIds).toEqual(['000001', '000002', '000003']);
    const body = d.body;
    expect(body.indexOf('Overdue:')).toBeLessThan(body.indexOf('Open:'));
    expect(body).toContain('send the quote (due 2026-10-01, 14 days overdue)');
    expect(body).toContain('tidy backlog (no due date)');
    expect(body.startsWith('Hi Priya,')).toBe(true);
  });
  it('singular wording and no Overdue heading when nothing is overdue', () => {
    const d = buildFollowup(priya, [items[1] as (typeof items)[0]], ASOF, [mtg]);
    expect(d.subject).toBe('Follow-up: 1 open action item (0 overdue)');
    expect(d.body).not.toContain('Overdue:');
  });
  it('shows an unreadable due phrase as written', () => {
    const d = buildFollowup(
      priya,
      [mk('000004', { due: due(null, 'by the end of the cutover') })],
      ASOF,
      [mtg],
    );
    expect(d.body).toContain('due "by the end of the cutover"');
  });
  it('missing email: empty To and a MISSING_EMAIL warning', () => {
    const d = buildFollowup(noMail, items, ASOF, [mtg]);
    expect(d.to).toBe('');
    expect(d.warnings.map((w) => w.code)).toContain(WarningCode.MISSING_EMAIL);
  });
  it('is deterministic and uses only task text, title and date (no raw lines)', () => {
    const a = buildFollowup(priya, items, ASOF, [mtg]);
    expect(buildFollowup(priya, [...items].reverse(), ASOF, [mtg])).toEqual(a);
    expect(a.body).not.toContain('Priya: ');
  });
  it('an empty selection gives no item ids', () => {
    expect(buildFollowup(priya, [], ASOF, [mtg]).itemIds).toEqual([]);
  });
  it('flags items that vanished from the notes', () => {
    const d = buildFollowup(priya, [mk('000005', { flags: ['missing-from-notes'] })], ASOF, [mtg]);
    expect(d.body).toContain('(no longer in the notes)');
  });
});

describe('followup() flow', () => {
  let tmp: string;
  let storeFile: string;
  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'at-fu-'));
    storeFile = join(tmp, 'store.json');
    await ingest(NOTES_DIR, {
      store: storeFile,
      clock: fixedClock,
      config: {
        people: [
          { fullName: 'Karan Joshi', email: 'karan@example.com' },
          { fullName: 'Priya Nair', email: 'priya.nair@example.com' },
        ],
        globalAliases: {},
        fileAliases: {},
      },
    });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  class Spy implements GmailDrafter {
    calls: Draft[] = [];
    createDraft(d: Draft) {
      this.calls.push(d);
      return Promise.resolve({ draftId: `spy-${this.calls.length}` });
    }
  }
  const opts = (drafter: GmailDrafter, extra = {}) => ({
    storePath: storeFile,
    drafter,
    asOf: ASOF,
    clock: fixedClock,
    config: {
      people: [
        { fullName: 'Karan Joshi', email: 'karan@example.com' },
        { fullName: 'Priya Nair', email: 'priya.nair@example.com' },
      ],
    },
    ...extra,
  });

  it('creates one draft: overdue first, recorded in the store', async () => {
    const spy = new Spy();
    const r = await followup('Karan Joshi', opts(spy));
    expect(r.kind).toBe('created');
    expect(spy.calls).toHaveLength(1);
    const d = spy.calls[0] as Draft;
    expect(d.to).toBe('karan@example.com');
    expect(d.subject).toMatch(/^Follow-up: \d+ open action items? \(\d+ overdue\)$/);
    if (d.body.includes('Overdue:'))
      expect(d.body.indexOf('Overdue:')).toBeLessThan(d.body.indexOf('Open:'));
    expect(loadStore(storeFile).drafts['karan-joshi']?.draftId).toBe('spy-1');
  });

  it('--dry-run makes zero drafter calls and leaves the store unchanged', async () => {
    const before = readFileSync(storeFile, 'utf8');
    const spy = new Spy();
    const r = await followup('Karan Joshi', opts(spy, { dryRun: true }));
    expect(r.kind).toBe('dry-run');
    expect(spy.calls).toHaveLength(0);
    expect(readFileSync(storeFile, 'utf8')).toBe(before);
  });

  it('a second run without --replace creates nothing; with --replace it does', async () => {
    const spy = new Spy();
    await followup('Karan Joshi', opts(spy));
    const again = await followup('Karan Joshi', opts(spy));
    expect(again.kind).toBe('exists');
    expect(spy.calls).toHaveLength(1);
    const replaced = await followup('Karan Joshi', opts(spy, { replace: true }));
    expect(replaced.kind).toBe('created');
    expect(spy.calls).toHaveLength(2);
    expect(loadStore(storeFile).drafts['karan-joshi']?.draftId).toBe('spy-2');
  });

  it('a person with no open items: message result, no draft', async () => {
    const store = loadStore(storeFile);
    const done: Store = {
      ...store,
      items: store.items.map((i) => ({ ...i, status: 'done' as const })),
    };
    saveStore(storeFile, done);
    const spy = new Spy();
    const r = await followup('Karan Joshi', opts(spy));
    expect(r.kind).toBe('no-items');
    expect(spy.calls).toHaveLength(0);
  });

  it('a first name shared by two people is refused, naming both', async () => {
    const spy = new Spy();
    await expect(followup('Priya', opts(spy))).rejects.toThrow(AmbiguousOwnerError);
    await expect(followup('Priya', opts(spy))).rejects.toThrow(
      /Priya Nair.*Priya Shah|Priya Shah.*Priya Nair/,
    );
    expect((await followup('Priya Nair', opts(spy, { dryRun: true }))).kind).toBe('dry-run');
    expect(spy.calls).toHaveLength(0);
  });

  it('none, everyone, unknown and blank names are usage errors', async () => {
    const spy = new Spy();
    for (const q of ['none', 'everyone', 'Zed Nobody', '  ']) {
      await expect(followup(q, opts(spy))).rejects.toThrow(UsageError);
    }
  });

  it('security-review items go only to attendees; the email has the task text only', async () => {
    await ingest(NOTES_DIR, {
      store: storeFile,
      clock: fixedClock,
      confidentialPatterns: ['*security-review*'],
    });
    const spy = new Spy();
    // an attendee (Sam) sees the MFA item
    const sam = await followup('Sam Okafor', opts(spy, { dryRun: true }));
    expect(sam.kind).toBe('dry-run');
    if (sam.kind !== 'dry-run') return;
    expect(sam.draft.body).toContain('enable MFA on all admin accounts');
    expect(sam.draft.body).not.toContain('pen-test');
    expect(sam.draft.body).not.toContain('auditor');

    // hand the item to Priya Nair, who was not in that meeting: it must be left out
    const store = loadStore(storeFile);
    const mfa = store.items.find((i) => /enable MFA/.test(i.task));
    expect(mfa).toBeDefined();
    saveStore(storeFile, {
      ...store,
      items: store.items.map((i) =>
        i.id === mfa?.id ? { ...i, owner: { ...i.owner, people: ['priya-nair'] } } : i,
      ),
    });
    const nair = await followup('Priya Nair', opts(spy, { dryRun: true }));
    expect(nair.kind).toBe('dry-run');
    if (nair.kind !== 'dry-run') return;
    expect(nair.draft.itemIds).not.toContain(mfa?.id);
    expect(nair.draft.body).not.toContain('enable MFA');
    expect(nair.draft.warnings.map((w) => w.code)).toContain(WarningCode.CONFIDENTIAL_OMITTED);
  });

  it('a drafter that fails leaves the store unchanged', async () => {
    const before = readFileSync(storeFile, 'utf8');
    const bad: GmailDrafter = { createDraft: () => Promise.reject(new DrafterError('nope')) };
    await expect(followup('Karan Joshi', opts(bad))).rejects.toThrow(DrafterError);
    expect(readFileSync(storeFile, 'utf8')).toBe(before);
  });

  it('a person with no email: draft with empty To and a warning', async () => {
    const spy = new Spy();
    const r = await followup('Sam Okafor', opts(spy, { dryRun: true }));
    if (r.kind === 'dry-run') {
      expect(r.draft.to).toBe('');
      expect(r.draft.warnings.map((w) => w.code)).toContain(WarningCode.MISSING_EMAIL);
    } else expect(r.kind).toBe('no-items');
  });

  it('a joint-owner item appears in both people’s emails', async () => {
    const store = emptyStore();
    const joint = mk('0000aa', { owner: owner('karan-joshi', 'priya-nair'), task: 'joint task' });
    saveStore(storeFile, { ...store, meetings: [mtg], items: [joint] });
    const spy = new Spy();
    await followup('Karan Joshi', opts(spy));
    await followup('Priya Nair', opts(spy));
    expect(spy.calls.map((c) => c.body.includes('joint task'))).toEqual([true, true]);
  });
});

describe('drafters and safety', () => {
  it('FileGmailDrafter writes one JSON file with a stable id under a fixed clock', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'at-fg-'));
    const d: Draft = { to: 'a@b.co', subject: 's', body: 'b', itemIds: ['1'], warnings: [] };
    const drafter = new FileGmailDrafter(join(tmp, 'drafts'), fixedClock);
    const a = await drafter.createDraft(d);
    const b = await drafter.createDraft(d);
    expect(a.draftId).toBe(b.draftId);
    expect(readdirSync(join(tmp, 'drafts'))).toEqual([`${a.draftId}.json`]);
    const saved = JSON.parse(
      readFileSync(join(tmp, 'drafts', `${a.draftId}.json`), 'utf8'),
    ) as Draft;
    expect(saved).toMatchObject({ to: 'a@b.co', subject: 's' });
    rmSync(tmp, { recursive: true, force: true });
  });
  it('FileGmailDrafter reports an unwritable folder as DrafterError', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'at-fg-'));
    const blocker = join(tmp, 'file');
    (await import('node:fs')).writeFileSync(blocker, 'x');
    const drafter = new FileGmailDrafter(join(blocker, 'drafts'), fixedClock);
    await expect(
      drafter.createDraft({ to: '', subject: '', body: '', itemIds: [], warnings: [] }),
    ).rejects.toBeInstanceOf(DrafterError);
    expect(existsSync(join(blocker, 'drafts'))).toBe(false);
    rmSync(tmp, { recursive: true, force: true });
  });
  it('McpGmailDrafter fails clearly and never falls back', async () => {
    await expect(
      new McpGmailDrafter().createDraft({
        to: '',
        subject: '',
        body: '',
        itemIds: [],
        warnings: [],
      }),
    ).rejects.toThrow(/not set up/);
  });
  it('the GmailDrafter interface has exactly one method', () => {
    const src = readFileSync(join(__dirname, '../../../src/core/followup/gmail.ts'), 'utf8');
    const body = /interface GmailDrafter \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
    expect(body.match(/\w+\(/g)).toEqual(['createDraft(']);
  });
  it('nothing in src can send mail', () => {
    const src = join(__dirname, '../../../src');
    for (const rel of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
      if (!rel.endsWith('.ts')) continue;
      const text = readFileSync(join(src, rel), 'utf8');
      expect(text, rel).not.toMatch(
        /\b(sendMail|sendMessage|send_message|messages\.send|drafts\.send|sendDraft|nodemailer|smtp)/i,
      );
    }
  });
});
