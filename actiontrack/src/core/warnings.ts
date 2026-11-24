export const WarningCode = {
  DATE_INFERRED: 'DATE_INFERRED',
  DATE_MISMATCH_FILENAME: 'DATE_MISMATCH_FILENAME',
  DATE_WEEKDAY_MISMATCH: 'DATE_WEEKDAY_MISMATCH',
  DUE_UNRESOLVABLE: 'DUE_UNRESOLVABLE',
  DUE_WEEKDAY_MISMATCH: 'DUE_WEEKDAY_MISMATCH',
  OWNER_AMBIGUOUS: 'OWNER_AMBIGUOUS',
  OWNER_UNKNOWN: 'OWNER_UNKNOWN',
  OWNER_NOT_ATTENDEE: 'OWNER_NOT_ATTENDEE',
  ITEM_REOPENED: 'ITEM_REOPENED',
  FENCE_UNCLOSED: 'FENCE_UNCLOSED',
  EMPTY_ITEM: 'EMPTY_ITEM',
  MISSING_EMAIL: 'MISSING_EMAIL',
  FRONTMATTER_INVALID: 'FRONTMATTER_INVALID',
  DUPLICATE_IN_FILE: 'DUPLICATE_IN_FILE',
  CONFIDENTIAL_OMITTED: 'CONFIDENTIAL_OMITTED',
} as const;

export type WarningCode = (typeof WarningCode)[keyof typeof WarningCode];

export interface Warning {
  file: string;
  line?: number;
  code: WarningCode;
  message: string;
}

/** A warning raised by a function that does not know the file name; the caller adds `file`. */
export type WarningInfo = Omit<Warning, 'file'>;

/** Injected time source; core code never calls `Date.now()` directly. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date(Date.now());
