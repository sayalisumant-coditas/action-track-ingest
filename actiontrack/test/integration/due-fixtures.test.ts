import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDatePhrase, resolveDueWithWarnings } from '../../src/core/dates/resolveDue.js';
import { parseMeetingHeader } from '../../src/core/parse/meeting.js';
import { readNote } from '../../src/core/scan/readNote.js';
import { scanFolder } from '../../src/core/scan/scanFolder.js';
import { NOTES_DIR } from '../helpers/fixtures.js';

/**
 * Stand-in for M4's due-clause finder: the last `by|due|from|on|before|until|for` tail that is a date
 * phrase, else the last `by|due|before|until` tail, else a trailing `tomorrow`.
 */
function dueRaw(line: string): string | null {
  const tails = [...line.matchAll(/\b(by|due|from|on|before|until|for)\s+/gi)].map((m) => ({
    kw: (m[1] as string).toLowerCase(),
    tail: line.slice((m.index ?? 0) + m[0].length).trim(),
  }));
  const dated = tails.filter((t) => isDatePhrase(t.tail));
  if (dated.length) return (dated[dated.length - 1] as { tail: string }).tail;
  const strong = tails.filter((t) => ['by', 'due', 'before', 'until'].includes(t.kw));
  if (strong.length) return (strong[strong.length - 1] as { tail: string }).tail;
  return /\btomorrow\s*$/i.test(line) ? 'tomorrow' : null;
}

const rows: {
  file: string;
  raw: string;
  date: string | null;
  reason: string | null;
  codes: string[];
}[] = [];
for (const path of scanFolder(NOTES_DIR)) {
  const note = readNote(path);
  if (!note.ok) continue;
  const file = basename(path);
  const { meeting } = parseMeetingHeader(note.text, file);
  for (const line of note.text.split('\n')) {
    if (!/^\s*(?:[-*+]\s*\[.\]|ACTION:)/.test(line)) continue;
    const raw = dueRaw(line);
    if (raw === null) continue;
    const { due, warnings } = resolveDueWithWarnings(raw, meeting.date, meeting.dateInferred);
    rows.push({
      file,
      raw,
      date: due.date,
      reason: due.reason ?? null,
      codes: warnings.map((w) => w.code),
    });
  }
}

describe('J. fixture integration', () => {
  it('M6-150 resolves every due text without throwing', () =>
    expect(rows.length).toBeGreaterThan(60));

  it('M6-151 every unresolved due carries a DUE_UNRESOLVABLE warning [GAP]', () => {
    const unresolved = rows.filter((r) => r.date === null);
    expect(unresolved.length).toBeGreaterThan(0);
    for (const r of unresolved)
      expect(r.codes, `${r.file}: ${r.raw}`).toContain('DUE_UNRESOLVABLE');
    const raws = unresolved.map((r) => r.raw);
    expect(raws).toContain('the next review');
    expect(raws).toContain('<date>');
  });

  it('M6-152 "Wed 16 Sep" in the 09-14 design meeting has no weekday warning', () => {
    const r = rows.find(
      (x) => x.file === '2026-09-14-onboarding-flow-design.md' && x.raw === 'Wed 16 Sep',
    );
    expect(r).toMatchObject({ date: '2026-09-16', reason: null, codes: [] });
  });

  it('M6-153 snapshot of {file, raw, date, reason}', async () => {
    const out = rows.map(({ file, raw, date, reason }) => ({ file, raw, date, reason }));
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(
      '../snapshots/m6-dues.json',
    );
  });
});
