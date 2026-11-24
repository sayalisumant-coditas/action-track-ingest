import { parse as parseYaml } from 'yaml';
import { WarningCode, type WarningInfo } from '../warnings.js';

export interface FrontMatterResult {
  data: Record<string, unknown>;
  body: string;
  /** Lines taken by the front matter block, fences included. Body line n is original line n + offset. */
  bodyOffsetLines: number;
  warnings: WarningInfo[];
}

/** A JS Date (what YAML 1.1 timestamps become) to `YYYY-MM-DD` in UTC, never local time. */
export function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normaliseDates(data: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Date && !Number.isNaN(v.getTime())) data[k] = dateToISO(v);
  }
  return data;
}

/**
 * If the text starts with a `---` line, parse everything up to the next `---` line as YAML.
 * Unclosed fences or invalid YAML mean "no front matter": data = {}, body = whole text, plus a
 * warning. Never throws.
 */
export function splitFrontMatter(text: string): FrontMatterResult {
  const none = (warnings: WarningInfo[] = []): FrontMatterResult => ({
    data: {},
    body: text,
    bodyOffsetLines: 0,
    warnings,
  });

  const lines = text.split('\n');
  if ((lines[0] ?? '').trimEnd() !== '---') return none();

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trimEnd() === '---') {
      close = i;
      break;
    }
  }
  if (close === -1) {
    return none([
      { line: 1, code: WarningCode.FRONTMATTER_INVALID, message: 'front matter is never closed' },
    ]);
  }

  const yamlSrc = lines.slice(1, close).join('\n');
  let data: Record<string, unknown> = {};
  if (yamlSrc.trim() !== '') {
    try {
      const parsed: unknown = parseYaml(yamlSrc);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('front matter is not a key/value map');
      }
      data = normaliseDates(parsed as Record<string, unknown>);
    } catch (e) {
      return none([
        {
          line: 1,
          code: WarningCode.FRONTMATTER_INVALID,
          message: `invalid front matter: ${(e as Error).message.split('\n')[0]}`,
        },
      ]);
    }
  }

  return {
    data,
    body: lines.slice(close + 1).join('\n'),
    bodyOffsetLines: close + 1,
    warnings: [],
  };
}
