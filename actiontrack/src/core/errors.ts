export class FolderError extends Error {
  constructor(
    public readonly folder: string,
    detail = 'cannot read folder',
  ) {
    super(`${detail}: ${folder}`);
    this.name = 'FolderError';
  }
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

export class AmbiguousOwnerError extends Error {
  constructor(
    public readonly candidates: string[],
    message = `ambiguous owner: ${candidates.join(', ')}`,
  ) {
    super(message);
    this.name = 'AmbiguousOwnerError';
  }
}

export class UnknownIdError extends Error {
  constructor(public readonly id: string) {
    super(`unknown id: ${id}`);
    this.name = 'UnknownIdError';
  }
}

export class ConfigError extends Error {
  constructor(
    public readonly source: string,
    detail: string,
  ) {
    super(`${source}: ${detail}`);
    this.name = 'ConfigError';
  }
}

export class InvalidIdError extends Error {
  constructor(
    public readonly id: string,
    detail = 'ids need at least 2 characters',
  ) {
    super(`invalid id "${id}": ${detail}`);
    this.name = 'InvalidIdError';
  }
}

export class AmbiguousIdError extends Error {
  constructor(
    public readonly prefix: string,
    public readonly matches: string[],
  ) {
    super(`id prefix "${prefix}" matches ${matches.length} items: ${matches.join(', ')}`);
    this.name = 'AmbiguousIdError';
  }
}

/** A bad command-line value (e.g. `--status nonsense`). The CLI maps it to exit code 1. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** The mail drafter could not create a draft (not set up, folder not writable, connector error). */
export class DrafterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrafterError';
  }
}
