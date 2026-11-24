# actiontrack

Extract and track action items from meeting notes. See [docs/](docs/) for requirements, the technical spec and per-module plans.

```
npm test        # unit tests
npm run build   # compile to dist/
npm run lint
```

## Usage

```
npm run build
node dist/cli/index.js <command>      # or: npm link, then: actiontrack <command>

actiontrack ingest <folder> [--recursive] [--verbose] [--json]
actiontrack list [--owner <name>] [--status open|done|overdue] [--due-before <date>] [--as-of <date>] [--json]
actiontrack done <id>                 # a unique id prefix is enough
actiontrack followup <owner> [--dry-run] [--include-group] [--replace] [--gmail mock|mcp] [--as-of <date>]
```

Global options: `--store <path>` (or `ACTIONTRACK_STORE`; default `./.actiontrack/store.json`), `--config <path>` (default `./actiontrack.config.json` if present), `--no-color`.

`followup` only ever creates a draft; it never mails anyone. With `--gmail mock` (the default) drafts are written to a `drafts/` folder next to the store. `--gmail mcp` is not set up yet. Run `actiontrack --help` for the due-date rules. The exit code is 0 on success and 1 on an error; skipped files never cause a failure.
