import type { ISODate } from '../types.js';

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for a real calendar date written exactly as `YYYY-MM-DD`. Never throws. */
export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
