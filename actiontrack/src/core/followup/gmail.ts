import type { WarningInfo } from '../warnings.js';

/** A ready-to-review email. There is no cc or bcc (Q7), and `to` is empty when no address is known. */
export interface Draft {
  to: string;
  subject: string;
  body: string;
  /** Ids of the action items in the body, in the order listed. */
  itemIds: string[];
  warnings: WarningInfo[];
}

/**
 * The only thing the tool may ask of a mail service: put a draft in the user's drafts folder.
 * This interface has exactly one method on purpose; nothing in the codebase can mail anyone.
 */
export interface GmailDrafter {
  createDraft(draft: Draft): Promise<{ draftId: string }>;
}
