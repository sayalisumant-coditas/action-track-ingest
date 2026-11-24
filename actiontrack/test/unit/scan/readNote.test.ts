import { chmodSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { looksBinary, readNote } from '../../../src/core/scan/readNote.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'at-read-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const put = (name: string, content: string | Uint8Array) => {
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
};

/** Text of `len` bytes where `bad` bytes are 0xFF (invalid UTF-8 -> U+FFFD). */
const withBad = (len: number, bad: number) => {
  const b = Buffer.alloc(len, 0x61);
  for (let i = 0; i < bad; i++) b[i * 50] = 0xff;
  return b;
};

describe('B. looksBinary', () => {
  it('M1-20 plain ASCII', () => expect(looksBinary(Buffer.from('hello world\n'))).toBe(false));

  it('M1-21 UTF-8 accents and emoji', () =>
    expect(looksBinary(Buffer.from('café — naïve 🎉 résumé\n'.repeat(50)))).toBe(false));

  it('M1-22 PNG header', () =>
    expect(
      looksBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])),
    ).toBe(true));

  it('M1-23 one NUL at position 2000', () => {
    const b = Buffer.alloc(4000, 0x61);
    b[2000] = 0;
    expect(looksBinary(b)).toBe(true);
  });

  it('M1-24 exactly 1% bad (41 of 4096) is text', () =>
    expect(looksBinary(withBad(4096, 41))).toBe(false));

  it('M1-25 42 of 4096 is binary', () => expect(looksBinary(withBad(4096, 42))).toBe(true));

  it('M1-26 tabs, newlines, CRs are fine', () =>
    expect(looksBinary(Buffer.from('a\tb\r\nc\n\t\r'.repeat(300)))).toBe(false));

  it('M1-27 5% control chars', () => {
    const b = Buffer.alloc(2000, 0x61);
    for (let i = 0; i < 100; i++) b[i * 20] = 0x01;
    expect(looksBinary(b)).toBe(true);
  });

  it('M1-28 tiny buffers do not read out of range', () => {
    expect(looksBinary(Buffer.from('0123456789'))).toBe(false);
    expect(looksBinary(Buffer.alloc(0))).toBe(false);
    expect(
      looksBinary(Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8, 0xf7, 0xf6])),
    ).toBe(true);
  });

  it('M1-29 only the first 4096 bytes are checked', () => {
    const b = Buffer.alloc(8000, 0x61);
    b.fill(0xff, 5000, 6000);
    expect(looksBinary(b)).toBe(false);
  });

  it('M1-30 UTF-16 with BOM is binary (documented limitation)', () =>
    expect(looksBinary(Buffer.from('﻿# Meeting\n', 'utf16le'))).toBe(true));
});

describe('C. readNote', () => {
  it('M1-40 0-byte file [BAD]', () =>
    expect(readNote(put('e.md', ''))).toEqual({ ok: false, reason: 'empty' }));

  it('M1-41 whitespace only [BAD]', () =>
    expect(readNote(put('w.md', '  \n\n \t\r\n'))).toEqual({ ok: false, reason: 'empty' }));

  it('M1-42 BOM only', () =>
    expect(readNote(put('b.md', Buffer.from([0xef, 0xbb, 0xbf])))).toEqual({
      ok: false,
      reason: 'empty',
    }));

  it('M1-43 PNG bytes [BAD]', () =>
    expect(
      readNote(
        put('p.md', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])),
      ),
    ).toEqual({ ok: false, reason: 'binary' }));

  it('M1-44 seeded random 2 KB [BAD]', () => {
    let s = 12345;
    const b = Buffer.alloc(2048);
    for (let i = 0; i < b.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      b[i] = (s >> 16) & 0xff;
    }
    expect(readNote(put('r.md', b))).toEqual({ ok: false, reason: 'binary' });
  });

  it('M1-45 normal text unchanged', () => {
    const t = '# Meeting: Kickoff\n\n- [ ] Do it\n';
    expect(readNote(put('n.md', t))).toEqual({ ok: true, text: t });
  });

  it('M1-46 BOM stripped', () => {
    const r = readNote(put('bom.md', '﻿# Title\n'));
    expect(r).toEqual({ ok: true, text: '# Title\n' });
  });

  it('M1-47 CRLF', () => {
    const r = readNote(put('crlf.md', 'a\r\nb\r\n'));
    expect(r).toEqual({ ok: true, text: 'a\nb\n' });
  });

  it('M1-48 lone CR', () =>
    expect(readNote(put('cr.md', 'a\rb\rc'))).toEqual({ ok: true, text: 'a\nb\nc' }));

  it('M1-49 mixed endings keep line count', () => {
    const r = readNote(put('mix.md', 'a\r\nb\nc\rd\n'));
    expect(r).toEqual({ ok: true, text: 'a\nb\nc\nd\n' });
  });

  it('M1-50 Latin-1 under the limit gets a replacement char', () => {
    const body = Buffer.concat([
      Buffer.from('x'.repeat(500) + ' caf'),
      Buffer.from([0xe9]),
      Buffer.from('\n'),
    ]);
    const r = readNote(put('l1.md', body));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('caf�');
  });

  it('M1-51 Latin-1 with >1% bad bytes is binary', () => {
    const body = Buffer.from('caf\xe9 '.repeat(100), 'latin1');
    expect(readNote(put('l1bad.md', body))).toEqual({ ok: false, reason: 'binary' });
  });

  it('M1-52 file deleted between scan and read', () => {
    const p = put('gone.md', 'hi');
    unlinkSync(p);
    expect(readNote(p)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('M1-53 directory path', () => {
    const p = join(dir, 'd.md');
    mkdirSync(p);
    expect(readNote(p)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it.skipIf(process.platform === 'win32')('M1-54 no read permission', () => {
    const p = put('locked.md', 'secret');
    chmodSync(p, 0o000);
    const r = readNote(p);
    chmodSync(p, 0o644);
    // root can read anything; only assert when the read really was refused
    expect(r.ok || (!r.ok && r.reason === 'unreadable')).toBe(true);
  });

  it('M1-55 5 MB text is fast', () => {
    const p = put('big.md', '- [ ] a task line with some words\n'.repeat(150_000));
    const t0 = performance.now();
    const r = readNote(p);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r.ok).toBe(true);
  });

  it('M1-56 tabs and trailing spaces preserved', () => {
    const t = '- a  \n\t- nested \t\n';
    expect(readNote(put('ws.md', t))).toEqual({ ok: true, text: t });
  });

  it('M1-57 never throws on 200 random buffers [BAD]', () => {
    let s = 987654321;
    const next = () => (s = (s * 1664525 + 1013904223) >>> 0);
    for (let n = 0; n < 200; n++) {
      const b = Buffer.alloc(next() % 6000);
      for (let i = 0; i < b.length; i++) b[i] = next() >>> 24;
      const r = readNote(put(`f${n}.md`, b));
      if (!r.ok) expect(['empty', 'binary', 'unreadable']).toContain(r.reason);
      else expect(typeof r.text).toBe('string');
    }
  });
});
