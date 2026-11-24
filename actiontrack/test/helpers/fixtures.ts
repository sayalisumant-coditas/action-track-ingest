import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));
export const NOTES_DIR = join(FIXTURES_DIR, 'notes');

/** Copy the sample notes into a fresh temp dir so tests never write into test/fixtures. */
export function copyFixturesToTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'actiontrack-'));
  cpSync(NOTES_DIR, dir, { recursive: true });
  return dir;
}
