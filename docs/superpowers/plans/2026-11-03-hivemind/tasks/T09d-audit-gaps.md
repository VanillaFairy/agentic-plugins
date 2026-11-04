# Task T09d: T09 audit gaps

rigor: tdd
gap: audit
size: ~24 turns (2 edit sites, 3 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | xhigh | the loop moves energy and holds the run for the user; a miss leaks energy or ends a run early, silently |
| review | opus | medium | |
| fix | sonnet | high | |
| re-review | opus | low | scoped to named findings |

## References
- Read: `../shared/interfaces.md` § Runner and scheduler and § Outbox, inbox, status and § Economy and § Strength
- Read: `../shared/conventions.md`
- Read: `../knowledge/run-scheduler-tests.md`
- Read: `../knowledge/run-tests.md`
- Read: `../../specs/2026-11-03-hivemind-design.md` § 9. The user (what an answered ask is)

## Dependencies
- Depends on: T09c
- Depended on by: T11, T12

## Scope
**Files:**
- Modify: `test/scheduler.test.mjs` (add tests; change only the verdict step at the `an ask reaches the user once` script, and only for [D3])
- Modify, only for a fails-today line: `src/scheduler.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list, and you MUST NOT weaken, skip or
delete any existing test. `test/fixtures/script-runner.mjs` is locked: where a test needs a
behaviour the fixture lacks (a wake that throws, two separate limit runs), wrap the runner the
fixture returns inside the test.**

G1, G2 and G3 are fails-today on `fix`. Write each test, run it and see it fail on the head, then fix
`src/scheduler.mjs`: G1 in `Scheduler.settleWake`, G2 in `Scheduler.sendAsks`, G3 in
`Scheduler.holdsForUser`. Every other group is passes-today. Write the test, confirm it passes on the
head, then show it can fail with one mutant of your own at that line's single site through
`scripts/mutation-probe.cjs`, with an `"expect"` naming the new test. If a passes-today test fails on
the head, stop and report it.

Use the file's `world()`, `budWorld()`, `go()`, `settled()`, `drop()`, `w.ask()` and `costOf()`.
Derive expected amounts from the rule (`price`, `wake_reserve`, `endowment_seed`, `computeStrengths`),
never from what the code returns.

## Implementation Steps
### Step 1: Add the tests for G1–G3 and run them — Expected: FAIL on the head
### Step 2: Fix `settleWake`, `sendAsks` and `holdsForUser` in `src/scheduler.mjs`
### Step 3: Add the tests for G4–G13
### Step 4: Run `node --test test/` — Expected: PASS
### Step 5: Run the mutation probe, one mutant per passes-today line, each killed by its own test
### Step 6: Commit
```bash
git add test/scheduler.test.mjs src/scheduler.mjs
git commit -m "Pin the scheduler's answered asks, failed wakes, guards and pause rules"
```

## Decisions
D1: Is a wake whose runner call throws written off? `fix`: yes. It reports no usage at all, and
rule 5 writes such a wake off. `accept`: its reserve is released back to the agent, as now. Skip
the lines tagged [D1].
D2: Does an attacking claim whose strength equals `standing_threshold` hold an ask past
`ask_max_ticks`? `fix`: no. Rule 6 holds it only for an attack "above" the threshold. `accept`:
yes, as now, matching "standing" (≥) in the economy and tools. Skip the lines tagged [D2].
D3: Does a verdict that addresses only an ask's candidate claims, not the ask, answer it?
`fix`: no. Design §9 separates an answered ask from a verdict on a claim, so only a verdict whose
`addresses` include the ask id answers it. `accept`: yes, as now. Skip the lines tagged [D3].

## Acceptance Criteria

G1 (fails-today): a wake whose runner throws is written off. [D1]
- [ ] A runner whose `wake` (or `start`) rejects for one agent: the run still ends with a reason and `settled()` holds.
- [ ] That agent's balance is down by exactly `wake_reserve`, and `settings.ledger.writtenOff` rose by `wake_reserve`. [D1]
- [ ] A `wake_failed` event names the agent.

G2 (fails-today): an attack exactly at `standing_threshold` doesn't hold an ask. [D2]
- [ ] An unsent ask whose only attacker is an unpinned claim at strength exactly `standing_threshold` (assert the fixture's equality with `computeStrengths`) reaches the outbox once `ask_max_ticks` ticks have passed. [D2]
- [ ] An ask whose attacker is pinned at 1 still never reaches the outbox (the existing case keeps passing).

G3 (fails-today): only a verdict addressing the ask answers it. [D3]
- [ ] With one sent ask and no eligible agent, a verdict file addressing only the ask's candidate claim doesn't end the run `quiet`. The run waits until a later stop file ends it `stopped`. [D3]
- [ ] The verdict step in 'an ask reaches the user once' addresses the three sent asks' ids instead of their candidates, and that test still ends `quiet`. [D3]

G4 (passes-today): a verdict addressing the ask id answers it.
- [ ] With one sent ask and no eligible agent, a verdict file addressing the ask id ends the run `quiet`.

G5 (passes-today): an ask times out at exactly `ask_max_ticks`.
- [ ] An ask with `tick: 0` and no attack is absent from the outbox after `ask_max_ticks − 1` accepted calls and present after exactly `ask_max_ticks`.

G6 (passes-today): `floor_slack` lowers the wake floor.
- [ ] With `floor_slack` clamped to a fixed positive value, an agent whose priority lies in `[wake_floor − floor_slack, wake_floor)` is woken.
- [ ] An agent whose priority is below `wake_floor − floor_slack` is not woken.

G7 (passes-today): a long pause doubles only the next reserve.
- [ ] After a pause past an hour, an agent's first wake holds `2 × wake_reserve` in escrow, and its next wake in the same run holds `wake_reserve`.

G8 (passes-today): the pause length is counted per pause.
- [ ] Two pauses of 40 sleeps each, separated by a successful wake: the wake after the second pause holds `wake_reserve`, not double.

G9 (passes-today): a mutation that fails to parse keeps only its own bill.
- [ ] A bud whose mutation costs a nonzero usage and returns unparseable text: no child, the parent's `buds` unchanged, and the parent's balance is down by exactly its wake cost plus the mutation's price.
- [ ] `settings.ledger.spent` includes the mutation's price.

G10 (passes-today): a spawn the parent can no longer endow after the mutation bill fails cleanly.
- [ ] A spawn whose endowment the balance covers at queue time but not after the mutation debit: the run ends with a reason, no child is born, a `birth_failed` event is logged, and the parent paid the spawn price, its wake and the mutation only.

G11 (passes-today): a seed the supply can't cover fails cleanly.
- [ ] A founder that seeds one genome when the supply left is below `endowment_seed`: the run ends with a reason, no seed agent exists, a `birth_failed` event is logged, and the supply is unchanged by the seed.

G12 (passes-today): escrow stranded on disk is released at the start of a run.
- [ ] A living agent written with `escrow > 0` and a balance below `wake_reserve` (never woken): at the end its escrow is 0, its balance equals the old balance plus the old escrow, and `settled()` holds.

G13 (passes-today): a wake with no accepted call isn't repeated at the same tick.
- [ ] With `wake_floor: 0`, an agent whose only wake makes no accepted call is woken exactly once, and the run ends `quiet`.

- [ ] Every passes-today test is killed by its own single-site mutant in the probe file, none "killed elsewhere"
- [ ] No existing test was weakened, skipped or deleted
- [ ] No files outside Scope were modified
