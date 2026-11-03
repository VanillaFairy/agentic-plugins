# Task T04c: Store — audit

rigor: triad
role: audit
size: ~20 turns (1 edit site, 9 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| audit | opus | medium | |

## References
- Read: `../shared/interfaces.md` § Store and § Store behaviour
- Read: `../shared/architecture.md` § Run directory and § Design decisions

## Dependencies
- Depends on: T04b
- Depended on by: T06

## Scope
**Files:**
- Read: `skills/think-tank/scripts/lib/store.mjs`, `test/store.test.mjs`, `test/fixtures/*.mjs`
- Create, only if the audit finds a gap: one finished `tdd` task file
  `docs/superpowers/plans/2026-11-03-think-tank-1.0/tasks/T04d-store-gaps.md` in the vanillafairy
  repo, carrying every gap as an acceptance line with its test.

**BOUNDARY — you MUST NOT modify code or tests.** You audit; a gap goes into the task file.

## What to audit
Run the mutation sweep over `store.mjs`: for each guard below, change it and confirm a test fails.
A mutation no test catches is a gap.

- the `EEXIST` check in `withLock`;
- the 30 s stale threshold, the break token, and the age re-check under it;
- the `finally` that removes the lock;
- `--only -- <files>` on the commit, and the pathspec on `git add`;
- the "nothing to commit" check;
- the path-inside-graph check;
- the authors `wakesOf` leaves out;
- the verdict number and the `seq` it stamps.

Then look for what nobody listed: anything in the store that writes the run's history or `seq`
and that the spec's Store behaviour doesn't describe, or describes and the tests don't pin.

## Acceptance Criteria
- [ ] Every mutation above was tried, with the test that caught it, or the gap it left, recorded in the hand-back
- [ ] Every gap is an acceptance line, with its test, in a finished `T04d-store-gaps.md`, or the hand-back says there were none
- [ ] No code or test file was modified
