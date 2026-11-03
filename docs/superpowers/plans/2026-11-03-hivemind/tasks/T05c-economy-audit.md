# Task T05c: Economy — audit

rigor: triad
role: audit
size: ~18 turns (1 edit site, 7 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| audit | opus | medium | |

## References
- Read: `../shared/interfaces.md` § Economy

## Dependencies
- Depends on: T05b
- Depended on by: T08

## Scope
- Read: `src/economy.mjs`, `test/economy.test.mjs`
- Create, only if a gap is found: `docs/superpowers/plans/2026-11-03-hivemind/tasks/T05d-economy-gaps.md`
  in the vanillafairy repo, one finished `tdd` task holding every gap as an acceptance line with
  its test.

**BOUNDARY — you MUST NOT modify code or tests.**

## What to audit
Mutation sweep: change each guard and confirm a test fails. A survivor is a gap.
- `Math.min(amount, supply)` on every draw from the supply;
- the balance check in `debit`, `escrow` and `open` from a parent;
- the escrow-first order in `chargeUsage`, and the floor at zero;
- the standing threshold, the other-lineage condition and the living-author condition in income;
- the bud cap and the factor on the budding threshold;
- the `weak_ratio` condition in `payCritic`;
- the floor at zero in `feed`.

Then anything else in the module that moves energy and isn't pinned.

## Acceptance Criteria
- [ ] Every mutation above was tried, with its catching test or the gap it left, in the hand-back
- [ ] Every gap is an acceptance line in a finished `T05d-economy-gaps.md`, or the hand-back says there were none
- [ ] No code or test file was modified
