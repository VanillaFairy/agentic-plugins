# Task T11: The simulator

rigor: tdd
size: ~24 turns (4 edit sites, 9 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | the stub agents' policies are judgment the task leaves open |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Runner and scheduler and § Tools and the Hive and § Economy and § Thermostat and § Genome
- Read: `../shared/architecture.md` § physics.json

## Dependencies
- Depends on: T09b
- Depended on by: T12

## Scope
**Files:**
- Create: `src/sim.mjs`, `test/sim.test.mjs`
- Modify: `physics.json`: add `"sim_cost": { "start_write": 1000, "turn_output": 300, "turn_context": 1500, "mutate": 1500 }`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `createSimRunner({ physics, rng })` returns a Runner with no model behind it. Each stub agent
  follows its species, reading the world only through `tools.call`:
  - founder: one `question`, then `seed` with three explorer and two critic genomes, then `rest`;
  - explorer: `look`; if its niche has fewer than two answers by it, `claim` an answer (provenance
    `I`, text built from its lens and the tick so shingles differ); else support its strongest
    answer with a new claim; then `rest`;
  - critic: `look`; `claim` an attack on the strongest answer in its niche by another lineage;
    then `rest`.
- Usage per wake from the cost model: start/fork `cache_write = start_write`; each accepted call
  adds `turn_output` to output and `turn_context` to `cache_read`, growing with the agent's
  number of wakes. `mutate(prompt)` parses the parent genome out of the prompt with `parseMutation` (the
  mutation prompt carries it as JSON) and returns it as JSON with the operator name appended to the
  lens; the runner charges nothing for it (the scheduler prices it).
- `fitCostModel(events)` returns `sim_cost` values from a real run's `events.jsonl` lines of type
  `usage` (means of the fields per wake kind).

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRun, loadGraph } from '../src/graph/store.mjs';
import { runHive } from '../src/scheduler.mjs';
import { createSimRunner, fitCostModel } from '../src/sim.mjs';

const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const fresh = (supply) => { const dir = join(mkdtempSync(join(tmpdir(), 'hive-')), 'run'); initRun(dir, { purpose: 'p', scope: 's', sources: [], supply }); return dir; };

test('a simulated hive argues and ends without a model', async () => {
  const dir = fresh(300000);
  const P = JSON.parse(readFileSync(new URL('../physics.json', import.meta.url)));
  const r = await runHive(dir, createSimRunner({ physics: P, rng: lcg(3) }), { rng: lcg(4), sleep: async () => {} });
  assert.ok(['quiet', 'spent'].includes(r.reason));
  const graph = loadGraph(dir);
  const kinds = [...graph.values()].map((n) => n.fm.kind);
  assert.ok(kinds.filter((k) => k === 'agent').length >= 6);
  assert.ok([...graph.values()].some((n) => n.fm.kind === 'claim' && n.fm.attacks));
});

test('the same seeds replay the same run', async () => {
  const P = JSON.parse(readFileSync(new URL('../physics.json', import.meta.url)));
  const run = async () => { const dir = fresh(200000); await runHive(dir, createSimRunner({ physics: P, rng: lcg(3) }), { rng: lcg(4), sleep: async () => {} }); return readFileSync(join(dir, 'events.jsonl'), 'utf8'); };
  assert.equal(await run(), await run());
});

test('the cost model is fitted from real usage events', () => {
  const ev = [{ type: 'usage', wake: 'start', usage: { cache_write: 900, output: 200, cache_read: 0 } }, { type: 'usage', wake: 'start', usage: { cache_write: 1100, output: 400, cache_read: 0 } }];
  assert.equal(fitCostModel(ev).start_write, 1000);
});
```

### Step 2: Run `node --test test/sim.test.mjs` — Expected: FAIL, module not found
### Step 3: Implement `src/sim.mjs` and add `sim_cost` to `physics.json`
### Step 4: Run `node --test test/` — Expected: PASS
### Step 5: Commit
```bash
git add src/sim.mjs test/sim.test.mjs physics.json
git commit -m "Simulate the hive with stub agents and a fitted cost model"
```

## Acceptance Criteria
- [ ] A simulated run from an empty hive ends `quiet` or `spent`, with a founder, seeded agents and at least one attack → test 'a simulated hive argues and ends without a model'
- [ ] The same seeds produce the same event log → test 'the same seeds replay the same run'
- [ ] `fitCostModel` averages real usage per wake kind → test 'the cost model is fitted from real usage events'
- [ ] No files outside Scope were modified
