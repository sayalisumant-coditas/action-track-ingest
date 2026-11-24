import { describe, expect, it } from 'vitest';
import { resolveDue } from '../../../src/core/dates/resolveDue.js';
import { nextWeekday } from '../../../src/core/dates/weekday.js';

/**
 * Open assumption Q1: a meeting on a Friday that says "by Friday" means NEXT Friday (+7 days).
 * If the answer changes to "same day", flip the expectations in this file (and `nextWeekday`).
 */
describe('Q1 same weekday means +7', () => {
  it('M6-80 Friday meeting, "Friday" -> +7', () => {
    expect(resolveDue('Friday', '2026-10-09', false).date).toBe('2026-10-16');
    expect(resolveDue('by Friday', '2026-10-09', false).date).toBe('2026-10-16');
  });
  it('nextWeekday is strictly after', () =>
    expect(nextWeekday('2026-10-09', 4)).toBe('2026-10-16'));
});
