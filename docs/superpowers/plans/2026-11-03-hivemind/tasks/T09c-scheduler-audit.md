# Task T09c: Scheduler — audit

rigor: triad
role: audit
size: ~20 turns (1 edit site, 9 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| audit | opus | medium | |

## References
- Read: `../shared/interfaces.md` § Runner and scheduler and § Outbox, inbox, status

## Dependencies
- Depends on: T09b
- Depended on by: T11, T12

## Scope
- Read: `src/scheduler.mjs`, `test/scheduler.test.mjs`, `test/fixtures/script-runner.mjs`
- Create, only if a gap is found: `docs/superpowers/plans/2026-11-03-hivemind/tasks/T09d-scheduler-gaps.md`
  in the vanillafairy repo, one finished `tdd` task holding every gap as an acceptance line with
  its test.

**BOUNDARY — you MUST NOT modify code or tests.**

## What to audit
Mutation sweep: change each guard and confirm a test fails.
- eligibility's reserve condition and the wake floor with its slack;
- the pool refilling a freed slot, and the cold-start lone first wake;
- write-off only when a wake reports no usage at all;
- the `inbox_last` skip and the persist-before-delete order;
- the outbox's once-only `sent` mark and the ask timeout's standing-attack condition;
- the pause total crossing an hour doubling the reserve;
- each end condition (quiet, spent, stopped) and the persist-and-commit on end;
- the mutation's usage debited from the parent; a failed birth moving no energy.

Then anything else in the loop that moves energy, writes the run directory or ends the run and
isn't pinned.

## Acceptance Criteria
- [ ] Every mutation above was tried, with its catching test or the gap it left, in the hand-back
- [ ] Every gap is an acceptance line in a finished `T09d-scheduler-gaps.md`, or the hand-back says there were none
- [ ] No code or test file was modified
