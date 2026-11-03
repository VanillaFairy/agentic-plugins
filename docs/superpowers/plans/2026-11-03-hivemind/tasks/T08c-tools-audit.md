# Task T08c: Hive and physics tools — audit

rigor: triad
role: audit
size: ~20 turns (1 edit site, 9 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| audit | opus | medium | |

## References
- Read: `../shared/interfaces.md` § Tools and the Hive and § Economy

## Dependencies
- Depends on: T08b
- Depended on by: T09a, T10

## Scope
- Read: `src/hive.mjs`, `src/tools.mjs`, `test/tools.test.mjs`, `test/hive.test.mjs`
- Create, only if a gap is found: `docs/superpowers/plans/2026-11-03-hivemind/tasks/T08d-tools-gaps.md`
  in the vanillafairy repo, one finished `tdd` task holding every gap as an acceptance line with
  its test.

**BOUNDARY — you MUST NOT modify code or tests.**

## What to audit
Mutation sweep: change each guard and confirm a test fails.
- the living check, the debit-before-effect order, and the single `advance` per accepted call;
- the source containment check (prefix plus separator, realpath, case);
- the `checks` read-first rule and the F-needs-source rule;
- the one-relation rule and the target-kind check;
- novelty's once-only flag and its foreign-attack condition; rivalry excluded from pay;
- `persist`/`open` round-tripping each ledger total, the thermostat and the birth queue;
- `update` leaving `seq` and `tick` alone.

Then anything else that writes a node or moves energy and isn't pinned.

## Acceptance Criteria
- [ ] Every mutation above was tried, with its catching test or the gap it left, in the hand-back
- [ ] Every gap is an acceptance line in a finished `T08d-tools-gaps.md`, or the hand-back says there were none
- [ ] No code or test file was modified
