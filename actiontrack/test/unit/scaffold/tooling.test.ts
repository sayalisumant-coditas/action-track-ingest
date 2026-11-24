import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const json = (f: string) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const run = (cmd: string) => execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });

describe('A. Build and tooling', () => {
  it('S0-01 npm test script runs vitest', () => {
    expect(json('package.json').scripts.test).toContain('vitest');
  });

  it('S0-02 npm run build exits 0 and emits dist/cli/index.js', { timeout: 120_000 }, () => {
    run('npm run build');
    expect(existsSync(join(ROOT, 'dist/cli/index.js'))).toBe(true);
  });

  it('S0-03 lint and format check pass', { timeout: 120_000 }, () => {
    run('npm run lint');
    run('npm run format -- --check');
  });

  it('S0-04 package.json', () => {
    const p = json('package.json');
    expect(p.type).toBe('module');
    expect(p.engines.node).toBe('>=20');
    expect(p.bin.actiontrack).toBe('dist/cli/index.js');
  });

  it('S0-05 tsconfig.json', () => {
    const c = json('tsconfig.json').compilerOptions;
    expect(c.strict).toBe(true);
    expect(c.noUncheckedIndexedAccess).toBe(true);
    expect(c.module).toBe('NodeNext');
    expect(c.outDir).toBe('dist');
  });

  it('S0-06 .gitignore', () => {
    const lines = readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/);
    for (const e of ['dist', 'node_modules', '.actiontrack']) expect(lines).toContain(e);
  });

  it('S0-07 folder layout', () => {
    const dirs = [
      ...['scan', 'parse', 'people', 'dates', 'dedupe', 'store', 'query', 'followup'].map(
        (d) => `src/core/${d}`,
      ),
      'src/cli',
      ...['unit', 'integration', 'snapshots', 'fixtures'].map((d) => `test/${d}`),
    ];
    for (const d of dirs) expect(existsSync(join(ROOT, d)), d).toBe(true);
  });
});

describe('D. Architecture guards', () => {
  it('S0-30 core importing from cli fails lint', { timeout: 120_000 }, () => {
    const dir = join(ROOT, 'src/core/__guard__');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'bad.ts');
    writeFileSync(file, "import '../../cli/index.js';\n");
    try {
      let out = '';
      let failed = false;
      try {
        run('npx eslint src/core/__guard__/bad.ts');
      } catch (e) {
        failed = true;
        out = String((e as { stdout?: string }).stdout);
      }
      expect(failed).toBe(true);
      expect(out).toContain('no-restricted-imports');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const walk = (dir: string): string[] =>
    readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .map((r) => join(dir, r))
      .filter((p) => statSync(p).isFile());

  it('S0-31 no Date.now( / new Date() in core outside the clock helper', () => {
    for (const f of walk(join(ROOT, 'src/core')).filter((f) => f.endsWith('.ts'))) {
      if (f.endsWith('warnings.ts')) continue; // the clock helper
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/Date\.now\(|new Date\(\s*\)/);
    }
  });

  it('S0-32 no email-sending calls in src', () => {
    for (const f of walk(join(ROOT, 'src')).filter((f) => f.endsWith('.ts'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/\.send\(|sendMessage|messages\.send/);
    }
  });
});
