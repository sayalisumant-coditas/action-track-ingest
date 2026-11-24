import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_DIR, NOTES_DIR, copyFixturesToTemp } from '../../helpers/fixtures.js';

const files = readdirSync(NOTES_DIR);
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('E. Fixture folder', () => {
  it('S0-40 exactly 36 files', () => expect(files).toHaveLength(36));

  it('S0-41 35 .md + 1 .txt', () => {
    expect(files.filter((f) => f.endsWith('.md'))).toHaveLength(35);
    expect(files.filter((f) => f.endsWith('.txt'))).toEqual(['2026-09-19-offsite-draft.txt']);
  });

  it('S0-42 fixtures untouched (SHA-256 manifest)', () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, 'notes.manifest.json'), 'utf8'));
    expect(Object.keys(manifest).sort()).toEqual([...files].sort());
    for (const f of files) expect(sha(join(NOTES_DIR, f)), f).toBe(manifest[f]);
  });

  it('S0-43 malformed set [BAD]', () => {
    expect(statSync(join(NOTES_DIR, '2026-09-09-notes-final-v2.md')).size).toBe(0);
    // The real sample does not *start* with the PNG signature (it starts 00 01 02 FF FE); the
    // signature 89 50 4E 47 appears later. Assert what the file really is: binary with PNG bytes.
    const bin = readFileSync(join(NOTES_DIR, 'scratch.md'));
    expect(bin.includes(0x00)).toBe(true);
    expect(bin.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    const untitled = readFileSync(join(NOTES_DIR, 'untitled.md'), 'utf8');
    expect(untitled).not.toMatch(/Meeting:/);
  });

  it('S0-44 duplicate-heavy set [DUP]', () => {
    for (const d of ['09-01', '09-08', '09-15', '09-22', '10-01', '10-06', '10-13']) {
      expect(
        files.some((f) => f.startsWith(`2026-${d}-quote-portal`)),
        d,
      ).toBe(true);
    }
  });

  it('S0-45 same-name set [NAME]', () => {
    for (const f of [
      '2026-09-17-billing-migration-sync.md',
      '2026-09-30-q4-offsite.md',
      '2026-10-07-standup.md',
      '2026-09-23-standup.md',
    ]) {
      expect(files, f).toContain(f);
    }
  });

  it('S0-46 missing owner/date set [GAP]', () => {
    for (const f of [
      '2026-09-10-acme-renewal-prep.md',
      '2026-09-18-design-review.md',
      '2026-10-03-sales-pipeline.md',
    ]) {
      expect(files, f).toContain(f);
    }
  });

  it('S0-47 matches Appendix A of requirements.md', () => {
    const req = readFileSync(join(FIXTURES_DIR, '../../docs/requirements.md'), 'utf8');
    const section = req.slice(req.indexOf('Appendix A'));
    const names = [...section.matchAll(/^\| ([^|]+?) \|/gm)]
      .map((m) => (m[1] ?? '').trim())
      .filter((n) => n !== 'File' && !n.startsWith('---'));
    const expected = names.map((n) => (/\.\w+$/.test(n) ? n : `${n}.md`));
    expect([...expected].sort()).toEqual([...files].sort());
  });

  it('S0-48 synthetic folder holds only small .md files', () => {
    const dir = join(FIXTURES_DIR, 'synthetic');
    expect(existsSync(dir)).toBe(true);
    for (const f of readdirSync(dir).filter((f) => f !== '.gitkeep')) {
      expect(f.endsWith('.md'), f).toBe(true);
      expect(statSync(join(dir, f)).size).toBeLessThan(4096);
    }
  });

  it('S0-49 copyFixturesToTemp copies outside test/fixtures', () => {
    const tmp = copyFixturesToTemp();
    expect(tmp.startsWith(FIXTURES_DIR)).toBe(false);
    expect(readdirSync(tmp).sort()).toEqual([...files].sort());
  });
});
