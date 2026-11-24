import type { OwnerRef } from '../types.js';

/**
 * Key that decides which items may merge: sorted person ids, `group`, `unassigned`, or `?first`
 * for an ambiguous first name (so `?priya` never merges with `priya-nair` or `?rahul`).
 */
export function ownerKey(owner: OwnerRef): string {
  switch (owner.kind) {
    case 'person':
      return owner.people.length > 0 ? [...owner.people].sort().join(',') : 'unassigned';
    case 'group':
      return 'group';
    case 'ambiguous': {
      const first = (owner.raw ?? '').trim().split(/\s+/)[0] ?? '';
      return `?${first.replace(/^@/, '').toLowerCase()}`;
    }
    default:
      return 'unassigned';
  }
}
