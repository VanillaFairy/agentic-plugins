# Task T09a: Scheduler — tests

rigor: pair
role: red
size: ~30 turns (5 edit sites, 11 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | high | a state machine with many transitions |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Runner and scheduler and § Outbox, inbox, status and § Tools and the Hive and § Economy and § Genome and § Thermostat
- Read: `../shared/architecture.md` § The clock and § Run directory

## Dependencies
- Depends on: T07, T08b
- Depended on by: T09b

## Scope
**Files:**
- Create: `test/scheduler.test.mjs`, `test/fixtures/script-runner.mjs`
- Create: `src/scheduler.mjs` exporting `runHive`, throwing `new Error('not implemented')`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `test/fixtures/script-runner.mjs` is a Runner whose agents follow a script you pass in: for each
  agent id, a list of tool calls per wake; it returns fixed usage per wake and can be told to
  return `limit: true` once, to throw on a mutation, or to report no usage. It records every call
  it receives (start, fork, wake, interrupt, mutate) so tests assert on them.
- Each test runs `runHive` on a temp run made with `initRun`, with `sleep` stubbed to resolve at
  once and `rng` a seeded LCG.

## Negative Constraints (DO NOT)
- Do NOT implement `runHive`.

## Implementation Steps
### Step 1: Write the fixture and the tests, one per acceptance line
### Step 2: Run `node --test test/scheduler.test.mjs` — Expected: every test FAILS with `not implemented`
### Step 3: Commit
```bash
git add test/scheduler.test.mjs test/fixtures/script-runner.mjs src/scheduler.mjs
git commit -m "Pin the hive's scheduler loop in tests"
```

## Acceptance Criteria
- [ ] An empty hive starts a founder with `runner.start`, which dies after its first wake → test 'a founder starts the hive and dies after its wake'
- [ ] Founder `seed` births start fresh agents with new lineages, endowed from the supply → test 'seeded agents start fresh in new lineages'
- [ ] A bud forks from its parent, takes half the parent's balance, lands in the most tense niche per agent, and raises the parent's `buds` → test 'a bud forks warm into the tensest niche'
- [ ] A crossover takes a second parent of another lineage, and a transplant starts a new lineage → test 'crossover and transplant follow the lineage rules'
- [ ] A bud forced by the species floor takes the missing species → test 'the species floor shifts a bud'
- [ ] A mutation that fails to parse drops the birth and returns its endowment → test 'a failed mutation returns the endowment'
- [ ] Never-woken agents are woken first, and agents below the wake floor are not woken → test 'the newest are woken first and the quiet not at all'
- [ ] No more than `concurrency` agents are awake at once → test 'concurrency caps the waking agents'
- [ ] An agent that can't cover `wake_reserve` isn't woken → test 'an agent that can't pay its reserve sleeps'
- [ ] Each accepted tool call is one tick; ledger settlement adds none → test 'only tool calls advance the clock'
- [ ] A wake ends at `rest`, at the burst, or when the agent dies mid-wake (interrupted) → test 'a wake ends at rest, at the burst or at death'
- [ ] After a wake, usage is charged and the rest of the escrow released; a wake with no usage is written off → test 'a wake's usage is charged and its reserve settled'
- [ ] An agent past `context_cap` dies → test 'an agent past the context cap retires'
- [ ] An ask reaches the outbox once at the threshold, or after `ask_max_ticks` with no standing attack → test 'an ask reaches the user once'
- [ ] A verdict file becomes a verdict node and pins its nodes; a feed file changes the supply; a stop file ends the run as `stopped` → test 'the inbox delivers verdicts, food and stops'
- [ ] A `limit: true` wake pauses the run, retries after `sleep`, and doubles the next reserve after a pause over an hour → test 'the plan limit pauses and resumes the hive'
- [ ] The run ends `quiet` when nobody is eligible and no ask is outstanding → test 'a quiet hive ends'
- [ ] The run ends `spent` when supply, balances and escrows are zero → test 'a spent hive ends'
- [ ] The status file and the graph commit reflect the end → test 'the end is persisted and committed'
- [ ] The books balance after a whole scripted run → test 'the books balance over a whole run'
- [ ] No files outside Scope were modified
