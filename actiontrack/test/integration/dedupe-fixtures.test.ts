import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeOccurrences, type ParsedItem } from '../../src/core/dedupe/merge.js';
import { NOTES_DIR } from '../helpers/fixtures.js';
import { parseFolder } from '../helpers/parsedItems.js';

const { items: parsed, candidates } = parseFolder(NOTES_DIR);
const result = mergeOccurrences(parsed);
const { items, uncertain } = result;

const find = (re: RegExp, owner?: string) =>
  items.filter((i) => re.test(i.task) && (owner === undefined || i.owner.people.includes(owner)));

describe('K. fixture integration [DUP]', () => {
  it('M7-140 and M7-127 running the folder twice gives identical items; all ids unique', () => {
    const again = mergeOccurrences(parseFolder(NOTES_DIR).items);
    expect(again).toEqual(result);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length); // M7-127
  });

  it('M7-141 shuffled input gives identical items', () => {
    let seed = 5;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const shuffled: ParsedItem[] = parsed
      .map((x) => ({ x, k: rnd() }))
      .sort((a, b) => a.k - b.k)
      .map((o) => o.x);
    expect(mergeOccurrences(shuffled)).toEqual(result);
  });

  it('M7-141b a copy of the folder elsewhere gives the same ids', () => {
    // ids depend on file names, not on where the folder lives
    const dir = mkdtempSync(join(tmpdir(), 'actiontrack-m7-'));
    cpSync(NOTES_DIR, dir, { recursive: true });
    expect(mergeOccurrences(parseFolder(dir).items).items.map((i) => i.id)).toEqual(
      items.map((i) => i.id),
    );
  });

  it('M7-142 acceptance 3: the quote-to-Acme item appears once, done, 3 occurrences', () => {
    const found = find(/revised quote to Acme/, 'priya-nair');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ status: 'done', doneBy: 'notes' });
    expect(found[0]?.occurrences.map((o) => o.sourceFile.slice(0, 10))).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
    ]);
  });

  it('M7-143 acceptance 4: the cloud-budget item appears once, done', () => {
    const found = find(/confirm cloud budget with finance/);
    expect(found).toHaveLength(1);
    expect(found[0]?.status).toBe('done');
    expect(found[0]?.occurrences).toHaveLength(3);
  });

  it('M7-144 acceptance 5: wireframes item, due 2026-09-24, with slip history', () => {
    const found = find(/updated wireframes/);
    expect(found).toHaveLength(1);
    expect(found[0]?.due.date).toBe('2026-09-24');
    expect(found[0]?.dueHistory).toEqual(['2026-09-17']);
    // M7-53: the 09-01 "share first wireframes" line is not merged and is reported
    expect(find(/first wireframes/)).toHaveLength(1);
    expect(
      uncertain.some((u) => u.a === find(/first wireframes/)[0]?.id && u.b === found[0]?.id),
    ).toBe(true);
  });

  it('M7-145 counts: items and the lines folded into them', () => {
    expect(candidates).toBe(119);
    expect(parsed).toHaveLength(119); // every candidate has a task
    expect(items).toHaveLength(96);
    expect(items.reduce((n, i) => n + i.occurrences.length - 1, 0)).toBe(
      parsed.length - items.length,
    );
  });

  it('M7-146 no occurrence is lost (property)', () => {
    expect(items.reduce((n, i) => n + i.occurrences.length, 0)).toBe(parsed.length);
    const seen = new Set(
      items.flatMap((i) => i.occurrences.map((o) => `${o.sourceFile}:${o.line}`)),
    );
    expect(seen.size).toBe(parsed.length);
  });

  it('M7-147 the blockquoted refund line (09-21) makes no item', () => {
    const refunds = items.filter((i) => /refund affected customers/.test(i.task));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.occurrences).toHaveLength(1);
  });

  it('M7-148 uncertain list matches the reviewed snapshot', async () => {
    const view = uncertain.map((u) => ({
      a: items.find((i) => i.id === u.a)?.task,
      b: items.find((i) => i.id === u.b)?.task,
      score: u.score,
    }));
    await expect(JSON.stringify(view, null, 2) + '\n').toMatchFileSnapshot(
      '../snapshots/m7-uncertain.json',
    );
  });

  it('M7-70..72 golden separations on the real sample', () => {
    expect(find(/estimate (the )?SSO work/)).toHaveLength(1);
    expect(find(/start SSO spike/)).toHaveLength(1);
    expect(find(/collect 5 customer quotes/)).toHaveLength(1);
    expect(find(/publish the customer quotes/)).toHaveLength(1);
    expect(find(/book the renewal call/)[0]?.owner.people).toEqual(['meera-iyer']);
    expect(find(/schedule the quarterly business review/)[0]?.owner.people).toEqual([
      'lena-fischer',
    ]);
  });

  it('M7-50..61 the other golden merges on the real sample', () => {
    const occ = (re: RegExp, who?: string) => find(re, who)[0]?.occurrences.length;
    const status = (re: RegExp, who?: string) => find(re, who)[0]?.status;
    expect(find(/set up the staging/)).toHaveLength(1);
    expect(status(/set up the staging/)).toBe('done');
    expect(status(/export last quarter invoices/)).toBe('done');
    expect(occ(/freeze invoice edits/)).toBe(2);
    expect(status(/freeze invoice edits/)).toBe('open');
    expect(status(/approve the Q4 cloud spend/)).toBe('done');
    expect(occ(/book the renewal call/)).toBe(3);
    expect(status(/book the renewal call/)).toBe('done');
    expect(status(/prepare the renewal one-pager/)).toBe('open');
    expect(occ(/prepare the renewal one-pager/)).toBe(2);
    expect(occ(/review the schema mapping doc/)).toBe(2);
    expect(status(/review the schema mapping doc/)).toBe('open');
    expect(status(/finalise the welcome-email copy/)).toBe('done');
    expect(occ(/finalise the welcome-email copy/)).toBe(3);
  });

  it('M7-146b [NAME] ambiguous owners keep their own keys; no cross-merge with named people', () => {
    const amb = items.filter((i) => i.owner.kind === 'ambiguous');
    expect(amb.length).toBeGreaterThan(0);
    for (const i of amb) expect(i.owner.people).toEqual([]);
  });

  it('M7-112 [GAP] untitled.md items come last and are not merged into dated items', () => {
    const idx = items.findIndex((i) => i.occurrences.some((o) => o.sourceFile === 'untitled.md'));
    expect(idx).toBeGreaterThanOrEqual(0);
    for (const i of items.slice(idx))
      expect(i.occurrences.every((o) => o.sourceFile === 'untitled.md')).toBe(true);
  });

  it('M7-115 nested offsite item: Karan under Meera', () => {
    const child = find(/validate targets against the budget/)[0];
    const parent = find(/finalise the Q4 sales targets/)[0];
    expect(child?.parentId).toBe(parent?.id);
  });

  it('M7-96 snapshot of all items', async () => {
    const view = items.map((i) => ({
      id: i.id,
      task: i.task,
      owner: `${i.owner.kind}:${i.owner.people.join('+') || i.owner.raw}`,
      status: i.status,
      due: i.due.date,
      dueHistory: i.dueHistory,
      flags: i.flags,
      parentId: i.parentId ?? null,
      occurrences: i.occurrences.map((o) => `${o.sourceFile}:${o.line}${o.checked ? ' [x]' : ''}`),
    }));
    await expect(JSON.stringify(view, null, 2) + '\n').toMatchFileSnapshot(
      '../snapshots/m7-items.json',
    );
  });

  it('M7-149 warnings on the sample: none beyond expected codes', () => {
    for (const w of result.warnings)
      expect(['ITEM_REOPENED', 'DUPLICATE_IN_FILE']).toContain(w.code);
  });
});
