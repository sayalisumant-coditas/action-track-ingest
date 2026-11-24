import { basename } from 'node:path';
import { resolveDue } from '../../src/core/dates/resolveDue.js';
import type { ParsedItem } from '../../src/core/dedupe/merge.js';
import { extractCandidates } from '../../src/core/parse/candidates.js';
import { splitFrontMatter } from '../../src/core/parse/frontmatter.js';
import { parseCandidate } from '../../src/core/parse/line.js';
import { parseMeetingHeader } from '../../src/core/parse/meeting.js';
import { buildDirectory } from '../../src/core/people/directory.js';
import { resolveOwner } from '../../src/core/people/resolveOwner.js';
import { readNote } from '../../src/core/scan/readNote.js';
import { scanFolder } from '../../src/core/scan/scanFolder.js';
import type { Meeting } from '../../src/core/types.js';

/** Run M2 to M6 over a folder: one ParsedItem per candidate with a non-empty task. */
export function parseFolder(dir: string): { items: ParsedItem[]; candidates: number } {
  const files = scanFolder(dir).flatMap((p) => {
    const r = readNote(p);
    return r.ok ? [{ name: basename(p), text: r.text }] : [];
  });
  const meetings: Meeting[] = files.map((f) => parseMeetingHeader(f.text, f.name).meeting);
  const directory = buildDirectory(meetings);
  const items: ParsedItem[] = [];
  let candidates = 0;
  files.forEach((f, i) => {
    const meeting = meetings[i] as Meeting;
    const fm = splitFrontMatter(f.text);
    for (const c of extractCandidates(fm.body, fm.bodyOffsetLines).candidates) {
      candidates++;
      const line = parseCandidate(c);
      if (line.task === '') continue;
      const item: ParsedItem = {
        meeting,
        owner: resolveOwner(line.ownerRaw, line.helperRaw, meeting, directory).owner,
        task: line.task,
        line: c.line,
        rawLine: c.rawLine,
        checked: c.checked,
        due: resolveDue(line.dueRaw, meeting.date, meeting.dateInferred),
      };
      if (c.parentLine !== undefined) item.parentLine = c.parentLine;
      items.push(item);
    }
  });
  return { items, candidates };
}
