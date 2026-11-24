import { readFileSync } from 'node:fs';

export type ReadResult =
  { ok: true; text: string } | { ok: false; reason: 'empty' | 'binary' | 'unreadable' };

const SAMPLE_BYTES = 4096;

/**
 * True if the first 4096 bytes contain a NUL byte, or MORE than 1% of them decode to U+FFFD or
 * control characters (other than tab, LF, CR). The limit is rounded up (ceil), so 41 bad bytes
 * in a 4096-byte sample is still text and 42 is binary.
 * Limitation: UTF-16 is not supported; it contains NUL bytes, so it counts as binary.
 */
export function looksBinary(buf: Uint8Array): boolean {
  const sample = buf.subarray(0, SAMPLE_BYTES);
  if (sample.length === 0) return false;
  if (sample.includes(0)) return true;

  // stream:true keeps a multi-byte character cut off by the 4096 limit from counting as bad
  const decoded = new TextDecoder('utf-8').decode(sample, { stream: true });
  let bad = 0;
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded.charCodeAt(i);
    if (c === 0xfffd || c === 0x7f || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d)) bad++;
  }
  return bad > Math.ceil(sample.length * 0.01);
}

/** Read a note as text. Never throws. */
export function readNote(path: string): ReadResult {
  try {
    const buf = readFileSync(path);
    if (buf.length === 0) return { ok: false, reason: 'empty' };

    let text = new TextDecoder('utf-8').decode(buf); // BOM is kept by default; strip below
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.trim() === '') return { ok: false, reason: 'empty' };

    if (looksBinary(buf)) return { ok: false, reason: 'binary' };

    return { ok: true, text: text.replace(/\r\n?/g, '\n') };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
