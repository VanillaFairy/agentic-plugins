# Task T08b: Hive and physics tools — implementation

rigor: triad
role: green
size: ~29 turns (4 edit sites, 12 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | cross-module state: graph, ledger, strengths and pay rules meet here |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Tools and the Hive and § Graph and § Economy and § Strength and § Field and § Genome and § Thermostat and § Dung and harvest
- Read: `../shared/architecture.md` § Node kinds and § The clock

## Dependencies
- Depends on: T08a
- Depended on by: T08c

## Scope
**Files:**
- Modify: `src/hive.mjs`, `src/tools.mjs` (replace the stubs)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `runTool` order: living check → input validation → price → `debit` (refuse on false) → effect
  (`hive.write`) → pay rules → `hive.advance()` → `logEvent`.
- Novelty: `1 − max Jaccard similarity of word 3-shingles` against earlier claims (smaller `seq`)
  under the same question; paid through `payNovelty` with `temperature(hive.thermo)` and the
  target's `claimRelevance`, marking `novelty_paid: true` on the claim.
- Critic pay: strengths before the write and after (`hive.strengths()` before and after), the
  attacker's best = its strongest standing claim before the write.
- Source paths: `realpathSync` both the requested path and each goal source (so a junction can't
  escape), compare lower-cased on Windows, and accept only a path equal to a source or starting with
  the source plus a path separator. Pages are 8 KB.
- Novelty pay passes `hive.thermo.levers.novelty_weight` as the weight. "Tested" and "first
  foreign attack" count `attacks` claims only, never rivalry.
- `persist()` after every accepted tool call is the scheduler's job; `runTool` itself only writes
  nodes, so a crash between the two loses at most that tick's ledger change.

## Negative Constraints (DO NOT)
- Do NOT modify `test/tools.test.mjs` or `test/hive.test.mjs`: authored by T08a and locked.
- Do NOT import the SDK.

## Implementation Steps
### Step 1: Read the locked tests
### Step 2: Implement `src/hive.mjs` and `src/tools.mjs`
### Step 3: Run `node --test test/` — Expected: PASS
### Step 4: Commit
```bash
git add src/hive.mjs src/tools.mjs
git commit -m "Give agents their physics: priced tools over one writer"
```

## Acceptance Criteria
- [ ] Every test in `test/tools.test.mjs` and `test/hive.test.mjs` passes, unmodified
- [ ] The full suite is green
- [ ] No files outside Scope were modified
