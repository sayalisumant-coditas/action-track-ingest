import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FolderError } from '../../src/core/errors.js';
import { readNote } from '../../src/core/scan/readNote.js';
import { scanFolder } from '../../src/core/scan/scanFolder.js';
import { NOTES_DIR } from '../helpers/fixtures.js';

const paths = scanFolder(NOTES_DIR);
const results = new Map(paths.map((p) => [basename(p), readNote(p)]));

describe('D. scan + read on the sample folder', () => {
  it('M1-60 35 paths', () => expect(paths).toHaveLength(35));

  it('M1-61 .txt excluded', () =>
    expect(paths.map((p) => basename(p))).not.toContain('2026-09-19-offsite-draft.txt'));

  it('M1-62 33 ok, 2 fail', () => {
    const all = [...results.values()];
    expect(all.filter((r) => r.ok)).toHaveLength(33);
    expect(all.filter((r) => !r.ok)).toHaveLength(2);
  });

  it('M1-63 failing files [BAD]', () => {
    expect(results.get('2026-09-09-notes-final-v2.md')).toEqual({ ok: false, reason: 'empty' });
    expect(results.get('scratch.md')).toEqual({ ok: false, reason: 'binary' });
  });

  it('M1-64 untitled.md is readable [GAP]', () =>
    expect(results.get('untitled.md')?.ok).toBe(true));

  it('M1-65 same-name files all ok [NAME]', () => {
    for (const f of [
      '2026-09-17-billing-migration-sync.md',
      '2026-09-30-q4-offsite.md',
      '2026-10-07-standup.md',
      '2026-09-23-standup.md',
    ])
      expect(results.get(f)?.ok, f).toBe(true);
  });

  it('M1-66 quote-portal files ok and in date order [DUP]', () => {
    const qp = paths.map((p) => basename(p)).filter((n) => n.includes('quote-portal'));
    expect(qp).toHaveLength(7);
    expect([...qp].sort()).toEqual(qp);
    for (const f of qp) expect(results.get(f)?.ok, f).toBe(true);
  });

  it('M1-67 YAML files still start with ---', () => {
    for (const f of ['2026-09-16-standup.md', '2026-09-30-standup.md']) {
      const r = results.get(f);
      expect(r?.ok && r.text.startsWith('---'), f).toBe(true);
    }
  });

  it('M1-68 order matches snapshot', async () => {
    await expect(paths.map((p) => basename(p)).join('\n') + '\n').toMatchFileSnapshot(
      '../snapshots/m1-scan-order.txt',
    );
  });

  it('M1-69 missing folder gives FolderError naming the path', () => {
    const missing = join(NOTES_DIR, 'does-not-exist');
    expect(() => scanFolder(missing)).toThrow(FolderError);
    expect(() => scanFolder(missing)).toThrow(missing);
  });
});
