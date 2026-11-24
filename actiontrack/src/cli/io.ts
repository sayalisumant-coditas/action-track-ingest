import { systemClock, type Clock } from '../core/warnings.js';

/** Everything the commands need from the outside world, so the CLI can be driven by tests. */
export interface IO {
  /** Results go to stdout. */
  out(text: string): void;
  /** Messages, warnings and errors go to stderr. */
  err(text: string): void;
  isTTY: boolean;
  columns: number;
  env: Record<string, string | undefined>;
  cwd: string;
  clock: Clock;
}

export const defaultIO = (): IO => ({
  out: (t) => void process.stdout.write(t + '\n'),
  err: (t) => void process.stderr.write(t + '\n'),
  isTTY: process.stdout.isTTY === true,
  // no width limit when piped, so scripts get whole task text
  columns: process.stdout.isTTY ? (process.stdout.columns ?? 100) : Number.POSITIVE_INFINITY,
  env: process.env,
  cwd: process.cwd(),
  clock: systemClock,
});
