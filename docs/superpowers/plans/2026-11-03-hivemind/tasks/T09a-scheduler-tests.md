# Task T09a: Scheduler — tests

rigor: triad
role: red
size: ~36 turns (6 edit sites, 14 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | xhigh | a state machine over the books, the inbox and the outbox, where a miss leaks energy or replays a file |
| review | opus | medium | |
| fix | sonnet | high | scheduler fixes |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Runner and scheduler and § Outbox, inbox, status and § Tools and the Hive and § Economy and § Genome and § Thermostat and § Field and § Strength
- Read: `../shared/architecture.md` § The clock and § Run directory and § Node kinds

## Dependencies
- Depends on: T07, T08c
- Depended on by: T09b, T09c

## Scope
**Files:**
- Create: `test/scheduler.test.mjs`, `test/fixtures/script-runner.mjs`
- Create: `src/scheduler.mjs` exporting `runHive`, throwing `new Error('not implemented')`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `test/fixtures/script-runner.mjs` is a Runner whose agents follow a script you pass in: for each
  agent id, a list of tool calls per wake. It returns fixed usage per wake (summed the way
  `interfaces.md` § Runner and scheduler says), and can be told to return `limit: true` once, to
  return unparseable text from `mutate`, or to report no usage. It records every call it receives
  (start, fork, wake, interrupt, mutate) with the moment it started and ended, so tests can assert
  on order and overlap.
- Each test runs `runHive` on a temp run made with `initRun`, with `sleep` stubbed to resolve at
  once (recording the milliseconds asked) and `rng` a seeded LCG.

## Negative Constraints (DO NOT)
- Do NOT implement `runHive`.

## Failure Modes
- Interrupted mid-write, then run again: a crash after an inbox file is applied but before it is deleted → acceptance line 'an applied inbox file is never applied twice'
- An input deleted, renamed or removed: an inbox file deleted by hand before it is read → acceptance line 'the inbox delivers verdicts, food and stops'
- A value changed: the user feeds or cuts the supply mid-run → acceptance line 'the inbox delivers verdicts, food and stops'
- Every path into a guarded state (death): upkeep, the context cap, the founder's first wake → acceptance lines 'a founder starts the hive and dies after its wake', 'an agent past the context cap retires', 'a broke hive goes quiet instead of spinning'
- Run from a linked worktree and from the main checkout: n/a: the scheduler reads only the run directory
- Each target that already exists: an ask already sent → acceptance line 'an ask reaches the user once'

## Implementation Steps
### Step 1: Write the fixture and the tests, one per acceptance line
### Step 2: Run `node --test test/scheduler.test.mjs` — Expected: every test FAILS with `not implemented`
### Step 3: Commit
```bash
git add test/scheduler.test.mjs test/fixtures/script-runner.mjs src/scheduler.mjs
git commit -m "Pin the hive's scheduler loop in tests"
```

## Acceptance Criteria
Start and births:
- [ ] An empty hive starts a founder (lineage `L0`, endowed `endowment_seed` from the supply) with `runner.start`, and the founder dies after its first wake → test 'a founder starts the hive and dies after its wake'
- [ ] Founder `seed` births start fresh agents with new lineages, endowed from the supply → test 'seeded agents start fresh in new lineages'
- [ ] A bud forks from its parent, takes half the parent's balance, lands in the most tense niche per agent, and raises the parent's `buds` → test 'a bud forks warm into the tensest niche'
- [ ] A spawn always mutates with `point` and carries its `lens_change` into the mutation prompt → test 'a spawn mutates by its stated lens change'
- [ ] A crossover takes a second parent of another lineage, and a transplant starts a new lineage → test 'crossover and transplant follow the lineage rules'
- [ ] The species floor forces a bud's species → test 'the species floor shifts a bud'
- [ ] The mutation call's usage is priced and debited from the parent → test 'the parent pays for its child's mutation'
- [ ] A mutation that fails to parse moves no energy and logs the failure → test 'a failed mutation moves no energy'

Waking:
- [ ] Never-woken agents are woken first, and agents below the wake floor are not woken → test 'the newest are woken first and the quiet not at all'
- [ ] No more than `concurrency` agents are awake at once, and a freed slot is filled before the slowest wake ends → test 'a freed slot is filled at once, up to concurrency'
- [ ] At the start of a run, the first wake runs alone before the others fan out → test 'a cold start warms one agent first'
- [ ] An agent whose balance can't cover its reserve isn't eligible → test 'an agent that can't pay its reserve sleeps'
- [ ] When every living agent is ineligible and no ask is outstanding, the run ends `quiet` without spinning → test 'a broke hive goes quiet instead of spinning'

Ticks and wakes:
- [ ] Each accepted tool call is one tick; ledger settlement adds none → test 'only tool calls advance the clock'
- [ ] The thermostat steps after each tick, so its levers move during a run → test 'the thermostat steers during a run'
- [ ] A wake ends at `rest`, at the burst, or when the agent dies mid-wake (interrupted) → test 'a wake ends at rest, at the burst or at death'
- [ ] After a wake, a `usage` event with the wake kind is logged, usage is charged and the rest of the escrow released; a wake reporting no usage is written off → test 'a wake's usage is logged, charged and its reserve settled'
- [ ] An agent whose last-call `context` passed `context_cap` dies → test 'an agent past the context cap retires'

User channel:
- [ ] An ask reaches the outbox once at the threshold, or after `ask_max_ticks` with no standing attack → test 'an ask reaches the user once'
- [ ] A verdict file becomes a verdict node and pins its nodes; a feed file changes the supply; a stop file ends the run as `stopped` → test 'the inbox delivers verdicts, food and stops'
- [ ] An inbox file whose name is ≤ `settings.inbox_last` is skipped, so a file left by a crash is not applied again → test 'an applied inbox file is never applied twice'
- [ ] A `limit: true` wake pauses the run and retries after `sleep(60000)`; once the slept total passes an hour, the next reserve doubles → test 'the plan limit pauses and resumes the hive'

The end:
- [ ] The run ends `spent` when supply, balances and escrows are zero → test 'a spent hive ends'
- [ ] The status file and the graph commit reflect the end → test 'the end is persisted and committed'
- [ ] The books balance after a whole scripted run → test 'the books balance over a whole run'
- [ ] No files outside Scope were modified
