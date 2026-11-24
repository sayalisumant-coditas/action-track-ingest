/**
 * Owner grammar for the start of an action line. Only the *shape* is decided here; whether the
 * text is a real person, a group or unassigned is M5's job.
 *
 * One owner = `@?Name`, `Name Surname`, `Name N.` (a capitalised word, optionally followed by a
 * capitalised word or an initial). A lowercase single word (`priya to send it`) is accepted for the
 * `to`/`will`/`should` forms and, with `@`, for the colon form. Owners join with `&` or `and`.
 * An optional `(with X)` names helpers.
 */

const CAP = "\\p{Lu}[\\p{L}'’-]*";
const LOW = "\\p{Ll}[\\p{L}'’-]*";
const INITIAL = '\\p{Lu}\\.';
const NAME = `${CAP}(?:\\s+(?:${CAP}|${INITIAL}))?`;

const ONE_STRICT = `(?:@?${NAME}|@${LOW})`; // colon form
const ONE_LOOSE = `(?:@?${NAME}|@?${LOW})`; // `to` / `will` / `should` forms

const owners = (one: string) => `${one}(?:\\s+(?:&|and)\\s+${one})*`;
const HELPER = '(?:\\s*\\(\\s*with\\s+([^)]+?)\\s*\\))?';

const COLON = new RegExp(`^(${owners(ONE_STRICT)})${HELPER}\\s*:\\s+(.+)$`, 'u');
const TO = new RegExp(`^(${owners(ONE_LOOSE)})${HELPER}\\s+to(?:\\s+(.*))?$`, 'u');
const MODAL = new RegExp(`^(${owners(ONE_LOOSE)})${HELPER}\\s+(?:will|should)\\s+(.+)$`, 'u');

/**
 * First words that look like a name but are really verbs or labels (`Call Karan to confirm`,
 * `Reply to Acme`, `Note: …`). They are never an owner.
 */
const NOT_AN_OWNER = new Set([
  'to', 'todo', 'todos', 'action', 'actions', 'note', 'notes', 'fyi', 'reminder', 'thanks',
  'thank', 'please', 'reply', 'respond', 'talk', 'speak', 'listen', 'call', 'send', 'ask',
  'tell', 'email', 'ping', 'remind', 'agree', 'report', 'refer', 'reach', 'get', 'go', 'back',
  'up', 'due', 'need', 'needs', 'want', 'wants', 'how', 'what', 'when', 'why', 'who',
]); // prettier-ignore

export interface OwnerMatch {
  /** Owner text as written, without `@` and without the `(with …)` part. */
  ownerRaw: string;
  helperRaw?: string;
  /** Everything after the owner marker; may be empty (`Karan to`). */
  task: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function build(m: RegExpExecArray): OwnerMatch | null {
  const ownerRaw = clean((m[1] as string).replace(/(^|\s)@/g, '$1'));
  const first = (ownerRaw.split(' ')[0] ?? '').toLowerCase();
  if (NOT_AN_OWNER.has(first)) return null;
  const helper = m[2] ? clean(m[2]) : undefined;
  const task = clean(m[3] ?? '');
  return helper ? { ownerRaw, helperRaw: helper, task } : { ownerRaw, task };
}

/** Try `owner: task`, then `owner to task`, then `owner will|should task`. Null if none match. */
export function matchOwner(text: string): OwnerMatch | null {
  const t = clean(text);
  for (const re of [COLON, TO, MODAL]) {
    const m = re.exec(t);
    if (m) {
      const r = build(m);
      if (r) return r;
    }
  }
  return null;
}

/** `anita` -> `Anita` (display only; the raw text stays in `ownerRaw`). */
export function displayOwner(raw: string): string {
  return raw.replace(/(^|\s)(\p{Ll})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
}
