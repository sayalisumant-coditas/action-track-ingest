# Plan M5 — People and owner resolution

**Goal**: turn owner text into real people, handling the two Priyas and two Rahuls, groups and unassigned.
**Requirements**: R1, R5, F-LST-2 (owner filter), F-FUP-8 · **Milestone**: 3 · **Depends on**: M2 (attendee lists)
**Files**: `src/core/people/directory.ts`, `src/core/people/resolveOwner.ts`, `src/core/people/config.ts`

## Functions

| Function | Behaviour |
|---|---|
| `buildDirectory(meetings, config)` | Builds the list of people from all attendee lists, then merges config emails. Person id = slug of full name (`priya-nair`). |
| `splitName(full)` | `{first, last}`; handles one-word names and ignores `(role)` suffixes. |
| `resolveOwner(ownerRaw, helperRaw, meeting, dir, config)` | Returns `OwnerRef` and warnings. |
| `findPeople(query, dir)` | Case-insensitive; full name → one; first name → all with that first name; `none` → special. |
| `isGroup(raw)` / `isUnassigned(raw)` | `everyone, everybody, all, team` / `someone, tbd, ?, n/a, ''`. |

## Decision list for `resolveOwner` (first hit wins)

1. Empty or unassigned word → `unassigned`.
2. Group word → `group`.
3. Split joint owners on `&`, ` and `, `,`; resolve each part by steps 4–7, collect all.
4. Config alias for this file, then global alias → that person.
5. Full name in the directory → that person.
6. `First I.` → people with that first name whose last name starts with I; exactly one → that person.
7. Bare first name: candidates = directory people with that first name.
   - Keep those who attended this meeting. Exactly one → that person.
   - None attended and exactly one in the directory → that person (warn `OWNER_NOT_ATTENDEE`).
   - More than one, or the meeting has no attendee list and more than one exists → `ambiguous` with `candidates`, warning `OWNER_AMBIGUOUS`.
   - Not in the directory at all → `unassigned`, warning `OWNER_UNKNOWN`.
8. Helper (`with Priya`) is resolved with the same rules; helper ambiguity is a warning, not an error.

## Tasks

1. Types and `splitName`.
2. `buildDirectory`: gather names from every meeting; dedupe by slug; detect two different people who share a full name (unlikely, warn).
3. Config loader: `people[]`, `aliases` (global and per-file). Validate shape; clear errors.
4. `resolveOwner` following the decision list; keep `ownerRaw` and the resolution reason on the result (`reason: 'full' | 'initial' | 'attendee' | 'alias' | ...`) for the ingest report.
5. `findPeople` and a helper that throws `AmbiguousOwnerError` with candidates for the CLI.
6. Unit tests, data-driven.

## Sample cases (must pass)

| Owner text | Meeting | Result |
|---|---|---|
| `Rahul` | 09-02-standup (Rahul Mehta, Sam, Anita) | Rahul Mehta |
| `Rahul` / `Priya` | 09-03-billing-sync (Rahul Verma, Priya Shah attend) | Rahul Verma / Priya Shah |
| `Priya` | 09-17-billing-sync (Priya Shah and Priya Nair both attend) | ambiguous (Nair, Shah) |
| `Priya S.` / `Priya N.` | 09-29-cutover | Shah / Nair |
| `Priya N.` | 09-08-quote-portal-weekly | Priya Nair |
| `Rahul` | 10-07-standup (both Rahuls) | ambiguous |
| `Priya`, `Rahul` | 09-30-offsite (all nine attend) | ambiguous |
| `Priya`, `Rahul` | 09-18-design-review (Priya Nair, Rahul Mehta) | Nair, Mehta |
| `Rahul`, `Priya` | 09-14-onboarding-flow-design (Rahul Verma, Priya Shah) | Verma, Shah |
| `Anita & Rahul` | 09-18-design-review | two people: Anita Desai, Rahul Mehta |
| `Lena (with Priya)` | 09-18-design-review | Lena Fischer, helper Priya Nair |
| `Everyone` / `Team` | any | group |
| `Someone` / `TBD` / none | any | unassigned |
| `Sam` | 09-23-standup (no attendee list) | Sam Okafor (only one Sam in directory) |
| `Rahul` | 09-23-standup (no attendee list) | ambiguous (two Rahuls in directory) |
| `Priya` with config alias `{"2026-09-17-billing-migration-sync.md": {"Priya": "Priya Nair"}}` | 09-17 | Priya Nair |

## Edge cases

- Directory built only from the notes means a person who never appears in an attendee list is unknown. The config `people` list can add them.
- Name differences such as `Priya  Nair` (double space) are normalised.
- `findPeople("Priya")` returns two people; the CLI turns that into a message that lists both.

## Done when

Every row above passes, and the whole sample folder yields exactly the known ambiguous items: 09-17 Priya, 09-30 Priya and Rahul, 10-07 Rahul, 09-23 Rahul.
