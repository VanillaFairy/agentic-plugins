# Task T07: Thermostat

rigor: tdd
size: ~20 turns (2 edit sites, 8 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Thermostat and § Dung and harvest and § Field
- Read: `../shared/architecture.md` § physics.json

## Dependencies
- Depends on: T03b, T04
- Depended on by: T09, T11

## Scope
**Files:**
- Create: `src/thermostat.mjs`, `test/thermostat.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
`step(state, sample, physics)`, with `t = physics.thermostat` and `d = t.gain × |error|` where
`error = ema − target` after the ema and target updates:

- `error < −t.band` (herding): `mutation_rate += d`, `novelty_weight += d`, `floor_slack += d`,
  `budding_factor −= d`;
- `error > t.band` (scattered): `upkeep_factor += d`, `budding_factor += d`;
- inside the band nothing moves; every lever is clamped to `t.clamps[lever]` after moving.

`spread` uses `worldviews` from `src/harvest.mjs` and `activeQuestions` from `src/field.mjs`.

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/thermostat.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newThermostat, step, temperature, spread } from '../src/thermostat.mjs';

const P = JSON.parse(readFileSync(new URL('../physics.json', import.meta.url)));
const T = P.thermostat;
const clone = (s) => JSON.parse(JSON.stringify(s));

test('a new thermostat starts at target_start with every lever at its clamp midpoint', () => {
  const s = newThermostat(P);
  assert.equal(temperature(s), T.target_start);
  for (const [k, [lo, hi]] of Object.entries(T.clamps)) assert.equal(s.levers[k], (lo + hi) / 2);
});

test('the target cools by the cooling factor every step', () => {
  const s = newThermostat(P);
  const next = step(clone(s), s.target, P);
  assert.ok(Math.abs(next.target - T.target_start * T.cooling) < 1e-12);
});

test('herding raises mutation, novelty and floor slack and lowers the budding factor', () => {
  let s = newThermostat(P); s.ema = 0;
  const before = clone(s.levers);
  s = step(s, 0, P);
  assert.ok(s.levers.mutation_rate > before.mutation_rate);
  assert.ok(s.levers.novelty_weight > before.novelty_weight);
  assert.ok(s.levers.floor_slack > before.floor_slack);
  assert.ok(s.levers.budding_factor < before.budding_factor);
  assert.equal(s.levers.upkeep_factor, before.upkeep_factor);
});

test('scattering raises upkeep and the budding factor', () => {
  let s = newThermostat(P); s.target = 0.1; s.ema = 1;
  const before = clone(s.levers);
  s = step(s, 1, P);
  assert.ok(s.levers.upkeep_factor > before.upkeep_factor);
  assert.ok(s.levers.budding_factor > before.budding_factor);
  assert.equal(s.levers.mutation_rate, before.mutation_rate);
});

test('inside the band no lever moves', () => {
  let s = newThermostat(P); s.ema = s.target;
  const before = clone(s.levers);
  s = step(s, s.target, P);
  assert.deepEqual(s.levers, before);
});

test('levers never leave their clamps however long herding lasts', () => {
  let s = newThermostat(P); s.ema = 0;
  for (let i = 0; i < 1000; i++) s = step(s, 0, P);
  for (const [k, [lo, hi]] of Object.entries(T.clamps)) assert.ok(s.levers[k] >= lo && s.levers[k] <= hi);
});

test('spread is zero with one worldview and highest with two equal ones', () => {
  const g = (nodes) => new Map(Object.entries(nodes).map(([id, fm]) => [id, { id, fm: { id, ...fm }, title: id, body: '' }]));
  const ag = (l) => ({ kind: 'agent', lineage: l, species: 'critic', niche: 'q-1', energy: 1, escrow: 0, born: 0, genome: {} });
  const base = { 'g-1': { kind: 'goal' }, 'q-1': { kind: 'question', parent: 'g-1', tick: 0 }, 'a-1': ag('L1'), 'a-2': ag('L2'), 'a-3': ag('L3'), 'a-4': ag('L4') };
  const ans = (id, author) => ({ [id]: { kind: 'claim', author, provenance: 'I', answers: 'q-1', tick: 90 } });
  const att = (id, author, target) => ({ [id]: { kind: 'claim', author, provenance: 'I', attacks: target, tick: 95 } });
  // X and Y answer q-1; each is attacked by two other lineages; X's and Y's defenders attack each other
  const graph = g({ ...base, ...ans('c-x', 'a-1'), ...ans('c-y', 'a-2'), ...att('c-1', 'a-3', 'c-x'), ...att('c-2', 'a-4', 'c-x'),
    ...att('c-3', 'a-3', 'c-y'), ...att('c-4', 'a-4', 'c-y'), ...att('c-5', 'a-1', 'c-y'), ...att('c-6', 'a-2', 'c-5'), ...att('c-7', 'a-2', 'c-x'), ...att('c-8', 'a-1', 'c-7') });
  const s = new Map([...graph.keys()].filter((k) => k.startsWith('c-')).map((k) => [k, 0.7]));
  const v = spread(graph, s, P, 100);
  assert.ok(v >= 0 && v <= 1 + 1e-9);
  const one = g({ ...base, ...ans('c-x', 'a-1') });
  assert.equal(spread(one, new Map([['c-x', 0.9]]), P, 100), 0);
});
```

### Step 2: Run `node --test test/thermostat.test.mjs` — Expected: FAIL, module not found
### Step 3: Implement `src/thermostat.mjs`
### Step 4: Run `node --test test/` — Expected: PASS
### Step 5: Commit
```bash
git add src/thermostat.mjs test/thermostat.test.mjs
git commit -m "Steer mutation and selection from the hive's spread"
```

## Acceptance Criteria
- [ ] `newThermostat` starts at `target_start` with levers at clamp midpoints → test 'a new thermostat starts at target_start with every lever at its clamp midpoint'
- [ ] `step` cools the target by `cooling` → test 'the target cools by the cooling factor every step'
- [ ] Below the band, mutation rate, novelty weight and floor slack rise and the budding factor falls; upkeep doesn't move → test 'herding raises mutation, novelty and floor slack and lowers the budding factor'
- [ ] Above the band, upkeep and the budding factor rise; mutation doesn't move → test 'scattering raises upkeep and the budding factor'
- [ ] Inside the band nothing moves → test 'inside the band no lever moves'
- [ ] Levers stay within their clamps → test 'levers never leave their clamps however long herding lasts'
- [ ] `spread` is 0 for a single worldview and within [0, 1] otherwise → test 'spread is zero with one worldview and highest with two equal ones'
- [ ] No files outside Scope were modified
