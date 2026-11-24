import { stemWord } from './normalise.js';

/** Verbs that name a stage of work. Two tasks with different ones are different tasks. Extend freely. */
export const STAGE_VERBS = [
  'estimate', 'start', 'finish', 'publish', 'collect', 'write', 'review', 'book', 'schedule',
  'send', 'deploy', 'fix', 'prepare', 'approve', 'freeze', 'notify',
] as const; // prettier-ignore

const STAGE_STEMS = new Map<string, string>(STAGE_VERBS.map((v) => [stemWord(v), v]));

/**
 * The first stage verb in a task (any inflection), or null. Known limit: a stage word used as a
 * noun counts (`review meeting`), because only the first stage word is looked at, not its role.
 */
export function stageVerbOf(task: string): string | null {
  for (const raw of (task ?? '').toLowerCase().split(/[^\p{L}]+/u)) {
    if (raw === '') continue;
    const verb = STAGE_STEMS.get(stemWord(raw));
    if (verb) return verb;
  }
  return null;
}

/** False (do not merge) only when both tasks have a stage verb and the verbs differ. */
export function stageGuard(a: string, b: string): boolean {
  const va = stageVerbOf(a);
  const vb = stageVerbOf(b);
  return va === null || vb === null || va === vb;
}
