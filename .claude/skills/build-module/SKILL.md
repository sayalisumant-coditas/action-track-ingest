---
name: build-module
description: Implement one ActionTrack module end to end from its plan, tests and tasks docs, then tick its tasks.md checkboxes. Takes the module number as the argument (0 for scaffold, 1-12 for m01-m12). Use when the user says "build module N", "work on m05", or invokes /build-module N.
argument-hint: <module-number, e.g. 1, 07, m07, 0 for scaffold>
disable-model-invocation: true
---

# Build an ActionTrack module

Argument: `$ARGUMENTS` is the module number. Accept `1`, `01`, `m01`, `M1`; `0` or `00` means the scaffold.

All paths below are relative to the `actiontrack/` project folder.

## 1. Resolve the module

1. Parse the number and find its folder under `docs/plans/`: `00-scaffold` for 0, otherwise `mNN-*` (zero-padded, e.g. `m07-dedupe`). If no folder matches, or the argument is missing or not a number, stop and list the available folders.
2. Read, in full: `docs/plans/<folder>/plan.md`, `tests.md`, `tasks.md`. Read `docs/plans/README.md` for conventions and `docs/technical-spec.md` for the sections the plan references (types in §4, folder layout in §3). Read `docs/requirements.md` only if a requirement ID needs clarifying.

## 2. Check readiness

- Look up "Depends on" for this module in `docs/plans/README.md`. Note the build order differs from the folder numbers (**m06 before m05**; **m04 needs the date grammar from m06**).
- For each dependency, confirm its `tasks.md` is fully ticked (`[x]`) and its source files exist. If a dependency is incomplete, **stop and tell the user** which module to build first. Don't build the dependency unasked.
- If `tasks.md` is already fully ticked, say the module is already complete and stop, unless the user asked to redo it.
- If some tasks are ticked, resume from the first unticked one.

## 3. Implement

Work through the `tasks.md` checklist in order:

- Follow `plan.md` exactly: file paths, function signatures, behaviour tables and edge cases. Use the real types from `src/core/types.ts`; don't redefine them.
- Write the tests for each task alongside it, using the case IDs from `tests.md` (e.g. `M1-01`) in test names so they can be traced. Respect the edge-case tags `[DUP]`, `[GAP]`, `[NAME]`, `[BAD]`.
- Use fixtures from `test/fixtures/notes` (never edit sample files); use temp dirs for synthetic ones.
- Respect the architecture rule: `src/core` never imports from `src/cli`.
- Stay within the module's scope. If the plan and tests disagree, or the plan is ambiguous, pick the reading that matches `tests.md`, and record the decision in your final report. Ask the user only if it is a genuine blocker.
- Tick a task's checkbox (`- [ ]` to `- [x]`) in `tasks.md` as soon as that task and its tests pass, not in a batch at the end.

## 4. Verify

Run from the project root and fix failures until clean:

```
npm test
npm run build
npm run lint
```

Also run this module's tests on their own to confirm each numbered test case in `tests.md` is covered. Check the "Done when" items one by one against real output, not by assumption. Don't weaken or skip a test to make it pass. If a test case can't pass, leave it unticked and explain why.

## 5. Mark complete

Only when every "Done when" item is verified:

1. Tick every remaining checkbox in `tasks.md`, including the "Done when" section.
2. Report briefly: the module, files created or changed, test results (counts and any failures), decisions made on ambiguities, and the next module in build order.

If anything is not done, leave its box unticked and state exactly what is left and why. Never tick a box for work that wasn't done and verified.

Don't commit or push; the user will ask when ready.
