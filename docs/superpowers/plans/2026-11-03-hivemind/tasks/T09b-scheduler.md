# Task T09b: Scheduler — implementation

rigor: triad
role: green
size: ~28 turns (3 edit sites, 13 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | xhigh | the loop moves energy and consumes the inbox; a miss leaks or replays silently |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Runner and scheduler and § Outbox, inbox, status and § Tools and the Hive and § Economy and § Genome and § Thermostat and § Field and § Strength
- Read: `../shared/architecture.md` § The clock and § Node kinds

## Dependencies
- Depends on: T09a
- Depended on by: T09c

## Scope
**Files:**
- Modify: `src/scheduler.mjs` (replace the stub)
- Create: `prompts/founder.md`: the founder's instructions: read the goal and the sources, open the first questions with `question`, then call `seed` once with one genome per lens the goal needs, explorers and critics in the `species_ratio`, then `rest`.

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Follow `interfaces.md` § Scheduler rules in order. Waking is a pool: keep up to `concurrency`
  wake promises in flight and start the next eligible agent as soon as one settles
  (`Promise.race` over the in-flight set), never waiting for a whole batch. Every tool call goes
  through `runTool` on the one Hive, so writes stay serialized on Node's single thread.
- The `tools` object passed to the runner binds the agent: `{ call: (name, input) => ... }`, which
  runs `runTool`, then the after-tick steps, and resolves `{ ok, result, done }`.

## Negative Constraints (DO NOT)
- Do NOT modify `test/scheduler.test.mjs` or `test/fixtures/script-runner.mjs`: authored by T09a and locked.
- Do NOT import the SDK.

## Implementation Steps
### Step 1: Read the locked tests and the fixture
### Step 2: Implement `src/scheduler.mjs` and write `prompts/founder.md`
### Step 3: Run `node --test test/` — Expected: PASS
### Step 4: Commit
```bash
git add src/scheduler.mjs prompts/founder.md
git commit -m "Run the hive: births, waking by the field, ticks, pauses and the end"
```

## Acceptance Criteria
- [ ] Every test in `test/scheduler.test.mjs` passes, unmodified
- [ ] The full suite is green
- [ ] No files outside Scope were modified
