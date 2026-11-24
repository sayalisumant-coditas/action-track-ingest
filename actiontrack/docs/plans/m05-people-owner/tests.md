# Tests — M5 People and owner resolution

Plan: [plan.md](plan.md) · Files under test: `directory.ts`, `resolveOwner.ts`, `config.ts` · Tags: `[DUP]` `[GAP]` `[NAME]` `[BAD]`

This module carries the **same-first-name** edge case (two Priyas, two Rahuls) and the **no-owner** edge case. Most tests are data-driven.

Directory used in unit tests: Priya Nair, Priya Shah, Rahul Mehta, Rahul Verma, Anita Desai, Lena Fischer, Sam Okafor, Karan Joshi, Meera Rao.

## A. `splitName` and `buildDirectory`

| ID | Case | Expected |
|---|---|---|
| M5-01 | `splitName('Priya Nair')` | first `Priya`, last `Nair` |
| M5-02 | `splitName('Priya Nair (PM)')` | role suffix ignored |
| M5-03 | `splitName('Madonna')` (one word) | first `Madonna`, last empty, no throw |
| M5-04 | `splitName('Anne Marie van der Berg')` | first `Anne`, last `Marie van der Berg` (pinned) |
| M5-05 | `splitName('Priya  Nair')` (double space) | same as single space |
| M5-06 | `splitName('')` | no throw; person skipped `[BAD]` |
| M5-07 | Directory from two meetings that list `Priya Nair` | one person, not two `[DUP]` |
| M5-08 | Person id | slug of full name: `priya-nair` |
| M5-09 | Names that differ only by case (`priya nair`, `Priya Nair`) | one person |
| M5-10 | Directory built from the fixture notes | contains both Priyas and both Rahuls `[NAME]` |
| M5-11 | Two different people with the identical full name | warning; stays one entry |
| M5-12 | Config `people` adds email | email present on the matching person |
| M5-13 | Config person not in any attendee list | added to the directory |
| M5-14 | Empty meetings and no config | empty directory, no throw `[GAP]` |
| M5-15 | Directory order | deterministic (sorted by full name) |

## B. `isGroup` and `isUnassigned`

| ID | Input | Group? | Unassigned? |
|---|---|---|---|
| M5-20 | `Everyone`, `everybody`, `ALL`, `Team` | true | false |
| M5-21 | `Someone`, `TBD`, `tbd`, `?`, `n/a`, `N/A` | false | true `[GAP]` |
| M5-22 | `''`, `'  '` | false | true `[GAP]` |
| M5-23 | `Allan` (starts with "all") | false | false |
| M5-24 | `Teamwork` | false | false |
| M5-25 | `Priya` | false | false |

## C. `resolveOwner`: core decision list

| ID | Owner text | Meeting attendees | Expected |
|---|---|---|---|
| M5-30 | `''` | any | `unassigned`, no warning needed `[GAP]` |
| M5-31 | `Someone` / `TBD` | any | `unassigned` `[GAP]` |
| M5-32 | `Everyone` / `Team` | any | `group` |
| M5-33 | `Priya Nair` | any | person Nair |
| M5-34 | `priya nair` (lowercase) | any | person Nair |
| M5-35 | `Priya N.` | Nair + Shah | person Nair `[NAME]` |
| M5-36 | `Priya S.` | Nair + Shah | person Shah `[NAME]` |
| M5-37 | `Priya N.` | only Shah attended | still Nair (initial match is directory-wide) |
| M5-38 | `Priya X.` (no Priya with last name X) | any | `unassigned`, warning `OWNER_UNKNOWN` |
| M5-39 | `Sam` | Sam, Anita | Sam Okafor |
| M5-40 | `Zed` (nobody) | any | `unassigned`, `OWNER_UNKNOWN` `[GAP]` |
| M5-41 | `Sam` | meeting where Sam did not attend, one Sam in directory | Sam Okafor, warning `OWNER_NOT_ATTENDEE` |
| M5-42 | Result keeps `raw` | any | `ownerRaw` equals the input text exactly |
| M5-43 | Result carries a `reason` | any | one of `full`, `initial`, `attendee`, `alias`, … |

## D. Same-first-name cases (the two Priyas and two Rahuls)

| ID | Owner | Meeting | Expected |
|---|---|---|---|
| M5-50 | `Rahul` | 09-02-standup (Rahul Mehta, Sam, Anita) | Rahul Mehta `[NAME]` |
| M5-51 | `Rahul` | 09-03-billing-sync (Rahul Verma, Priya Shah) | Rahul Verma |
| M5-52 | `Priya` | 09-03-billing-sync | Priya Shah |
| M5-53 | `Priya` | 09-17-billing-sync (both Priyas) | `ambiguous`, candidates Nair and Shah, `OWNER_AMBIGUOUS` |
| M5-54 | `Rahul` | 10-07-standup (both Rahuls) | `ambiguous`, candidates Mehta and Verma |
| M5-55 | `Priya` | 09-30-offsite (all nine) | `ambiguous` |
| M5-56 | `Rahul` | 09-30-offsite | `ambiguous` |
| M5-57 | `Priya` | 09-18-design-review (Priya Nair only) | Priya Nair |
| M5-58 | `Rahul` | 09-18-design-review (Rahul Mehta only) | Rahul Mehta |
| M5-59 | `Rahul` / `Priya` | 09-14-onboarding-flow-design | Verma / Shah |
| M5-60 | `Priya S.` and `Priya N.` | 09-29-cutover | Shah / Nair |
| M5-61 | `Priya N.` | 09-08-quote-portal-weekly | Nair |
| M5-62 | `Sam` | 09-23-standup (no attendee list) | Sam Okafor (one Sam in directory) `[GAP]` |
| M5-63 | `Rahul` | 09-23-standup (no attendee list) | `ambiguous` (two Rahuls in directory) `[GAP]` |
| M5-64 | `Priya` | meeting with no attendee list | `ambiguous` `[GAP]` |
| M5-65 | Ambiguous result | `people = []`, `candidates` holds both person ids, never one chosen silently |
| M5-66 | Ambiguous item flows | `kind = ambiguous` is distinguishable from `unassigned` (so follow-up refuses it) |
| M5-67 | Three people sharing a first name (synthetic) | ambiguous with 3 candidates |
| M5-68 | Both Priyas in directory, one attended | the attendee wins; non-attendee never chosen |

## E. Aliases (user fix for ambiguity)

| ID | Config | Case | Expected |
|---|---|---|---|
| M5-70 | `{"2026-09-17-billing-migration-sync.md": {"Priya": "Priya Nair"}}` | `Priya` in 09-17 | Priya Nair, reason `alias` `[NAME]` |
| M5-71 | Same config | `Priya` in 09-30 offsite | still `ambiguous` (alias is file-scoped) |
| M5-72 | Global alias `{"Priya": "Priya Shah"}` | `Priya` in 09-17 | Priya Shah |
| M5-73 | Both global and file alias | `Priya` in 09-17 | file alias wins |
| M5-74 | Alias key in different case (`priya`) | matches |
| M5-75 | Alias points to a person not in the directory | clear config error or warning; no crash `[BAD]` |
| M5-76 | Alias does not override a full name | `Priya Shah` with alias `Priya → Nair` | Priya Shah |
| M5-77 | Resolving by alias and re-running | same result (deterministic) |

## F. Joint owners and helpers

| ID | Owner text | Expected |
|---|---|---|
| M5-80 | `Anita & Rahul` in 09-18 | two people: Anita Desai, Rahul Mehta |
| M5-81 | `Anita and Rahul` | same |
| M5-82 | `Anita, Rahul` | same |
| M5-83 | `Priya & Rahul` where both are ambiguous | `kind = ambiguous` for the item; each unresolved part is listed in candidates; warning per part `[NAME]` |
| M5-84 | `Anita & Priya` where Priya resolves, Anita resolves | two people |
| M5-85 | `Anita & Zed` (Zed unknown) | Anita kept; `OWNER_UNKNOWN` for Zed; item is not dropped |
| M5-86 | `Anita & Anita` | one person (deduped) `[DUP]` |
| M5-87 | `Lena` + helper `Priya` in 09-18 | primary Lena Fischer; helper Priya Nair |
| M5-88 | Helper `Priya` in a meeting with both Priyas | helper ambiguous → warning only, primary unaffected |
| M5-89 | Helper unknown name | warning, primary unaffected |

## G. `findPeople` and `AmbiguousOwnerError`

| ID | Query | Expected |
|---|---|---|
| M5-90 | `Priya Shah` | one person |
| M5-91 | `priya shah` | one person |
| M5-92 | `Priya` | two people (Nair, Shah) `[NAME]` |
| M5-93 | `Rahul` | two people |
| M5-94 | `Karan` | one person (unique first name) |
| M5-95 | `Zed` | empty list |
| M5-96 | `none` | special marker for unassigned items `[GAP]` |
| M5-97 | `everyone` | special marker for group items |
| M5-98 | Helper that throws on more than one match | `AmbiguousOwnerError`; `candidates` lists **both full names**; message names them |
| M5-99 | Query with extra spaces `' Priya   Nair '` | one person |
| M5-100 | Query `Priya N.` | Priya Nair |
| M5-101 | Query `P` or `Pri` (prefix) | no match (exact first name only) |

## H. Config loader

| ID | Case | Expected |
|---|---|---|
| M5-110 | No config file | defaults, no error |
| M5-111 | Valid `people` and `aliases` | parsed |
| M5-112 | `people` is not an array | clear error naming the key `[BAD]` |
| M5-113 | Person without `fullName` | clear error naming the entry |
| M5-114 | Invalid email format | warning (kept) |
| M5-115 | Unknown extra keys | ignored |
| M5-116 | Malformed JSON | clear error with file path; no crash `[BAD]` |

## I. Whole-folder checks

| ID | Case | Expected |
|---|---|---|
| M5-120 | Resolve every parsed owner across the 33 fixtures | no exception |
| M5-121 | Ambiguous results across the folder `[NAME]` | exactly: 09-17 Priya, 09-30 Priya, 09-30 Rahul, 10-07 Rahul, 09-23 Rahul |
| M5-122 | `untitled.md` owners `[GAP]` | resolved against the directory (no attendee list → ambiguous for Priya/Rahul, person for unique names); never dropped |
| M5-123 | Items with `Someone`, `TBD`, no owner `[GAP]` | all `unassigned` and counted |
| M5-124 | `Team` (10-01 quote-portal) and `Everyone` (09-18, 09-30) | `group` |
| M5-125 | Snapshot of all `OwnerRef`s | matches reviewed snapshot |

## Done when

Every row in D and I passes, and the ambiguous set in M5-121 is exactly the five known cases.
