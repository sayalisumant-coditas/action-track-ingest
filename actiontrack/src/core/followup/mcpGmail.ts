import { DrafterError } from '../errors.js';
import type { Draft, GmailDrafter } from './gmail.js';

/**
 * Placeholder for the real Gmail connector (milestone 7). It is not wired up yet: the connector
 * needs a one-time sign-in that has to be checked first (Q10), and the MCP client package is not
 * installed. Until then `createDraft` fails with a clear message and never falls back to anything
 * else. Its only public method is `createDraft`.
 */
export class McpGmailDrafter implements GmailDrafter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createDraft(_draft: Draft): Promise<{ draftId: string }> {
    return Promise.reject(
      new DrafterError(
        'the Gmail connector is not set up yet; use --gmail mock to write drafts to .actiontrack/drafts/',
      ),
    );
  }
}
