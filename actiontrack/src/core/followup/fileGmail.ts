import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DrafterError } from '../errors.js';
import type { Clock } from '../warnings.js';
import type { Draft, GmailDrafter } from './gmail.js';

export const DEFAULT_DRAFTS_DIR = path.join('.actiontrack', 'drafts');

/**
 * Stand-in for Gmail: writes each draft as a JSON file and returns its id. Used until the real
 * connector is set up (`--gmail mock`, the default). The id comes from the clock and the content,
 * so it is the same for the same input under a fixed clock.
 */
export class FileGmailDrafter implements GmailDrafter {
  constructor(
    private readonly dir: string,
    private readonly clock: Clock,
  ) {}

  createDraft(draft: Draft): Promise<{ draftId: string }> {
    const createdAt = this.clock().toISOString();
    const hash = createHash('sha1')
      .update(`${createdAt}\n${draft.to}\n${draft.subject}\n${draft.body}`)
      .digest('hex')
      .slice(0, 8);
    const draftId = `mock-${createdAt.replace(/\D/g, '').slice(0, 14)}-${hash}`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const file = path.join(this.dir, `${draftId}.json`);
      fs.writeFileSync(file, JSON.stringify({ draftId, createdAt, ...draft }, null, 2) + '\n');
    } catch (e) {
      return Promise.reject(
        new DrafterError(`cannot write draft to ${this.dir}: ${(e as Error).message}`),
      );
    }
    return Promise.resolve({ draftId });
  }
}
