import type { ActionItem, Meeting, Person } from '../types.js';
import { WarningCode, type WarningInfo } from '../warnings.js';
import { attended } from './select.js';

export interface RedactResult {
  items: ActionItem[];
  warnings: WarningInfo[];
}

/**
 * Drop items that came from a confidential meeting the recipient did not attend (R9). A merged
 * item counts as confidential if any of its occurrences is (the safe choice). Pure: the input
 * items are neither changed nor copied, and only the task text of kept items is ever used later.
 */
export function redactForConfidential(
  items: ActionItem[],
  recipient: Person,
  meetings: Meeting[],
): RedactResult {
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const kept: ActionItem[] = [];
  const hidden = new Set<string>();

  for (const item of items) {
    const blocked = item.occurrences
      .map((o) => byId.get(o.meetingId))
      .filter((m): m is Meeting => m !== undefined && m.confidential && !attended(recipient, m));
    if (blocked.length === 0) kept.push(item);
    else for (const m of blocked) hidden.add(m.sourceFile);
  }

  const warnings: WarningInfo[] = [];
  const omitted = items.length - kept.length;
  if (omitted > 0) {
    warnings.push({
      code: WarningCode.CONFIDENTIAL_OMITTED,
      message: `${omitted} item${omitted === 1 ? '' : 's'} left out: from a confidential meeting (${[
        ...hidden,
      ]
        .sort()
        .join(', ')}) that ${recipient.fullName} did not attend`,
    });
  }
  return { items: kept, warnings };
}
