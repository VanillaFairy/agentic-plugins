# Task T04: Field

rigor: tdd
size: ~17 turns (2 edit sites, 6 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Field
- Read: `../shared/architecture.md` § The clock and § physics.json

## Dependencies
- Depends on: T01
- Depended on by: T07, T08

## Scope
**Files:**
- Create: `src/field.mjs`, `test/field.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/field.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writesTo, heat, tension, crowding, activeQuestions } from '../src/field.mjs';

const P = JSON.parse(readFileSync(new URL('../physics.json', import.meta.url)));
const g = (nodes) => new Map(Object.entries(nodes).map(([id, fm]) => [id, { id, fm: { id, ...fm }, title: id, body: '' }]));
const alive = (id) => ({ kind: 'agent', lineage: id, species: 'explorer', niche: 'q-1', energy: 1, escrow: 0, born: 0, genome: {} });
const base = { 'g-1': { kind: 'goal' }, 'q-1': { kind: 'question', parent: 'g-1', tick: 0 }, 'a-1': alive('L1'), 'a-2': alive('L2') };

test('writes to a node are the ticks of the nodes naming it, verdicts included', () => {
  const graph = g({ ...base, 'c-3': { kind: 'claim', author: 'a-1', answers: 'q-1', tick: 5 }, 'c-4': { kind: 'claim', author: 'a-2', attacks: 'c-3', tick: 9 },
    'v-5': { kind: 'verdict', author: 'user', addresses: ['c-3'], tick: 12 } });
  assert.deepEqual(writesTo(graph, 'c-3').map((w) => w.tick).sort((a, b) => a - b), [9, 12]);
});

test('heat halves every half-life and verdicts weigh verdict_heat', () => {
  const graph = g({ ...base, 'c-3': { kind: 'claim', author: 'a-1', answers: 'q-1', tick: 0 }, 'c-4': { kind: 'claim', author: 'a-2', attacks: 'c-3', tick: 10 } });
  const h = P.heat_half_life;
  assert.ok(Math.abs(heat(graph, 'c-3', 10 + h, P) - 0.5) < 1e-9);
  const withVerdict = g({ ...base, 'c-3': { kind: 'claim', tick: 0 }, 'v-5': { kind: 'verdict', author: 'user', addresses: ['c-3'], tick: 10 } });
  assert.ok(Math.abs(heat(withVerdict, 'c-3', 10, P) - P.verdict_heat) < 1e-9);
});

test('a rival answer counts as an attacker in tension', () => {
  const graph = g({ ...base, 'c-3': { kind: 'claim', author: 'a-1', answers: 'q-1' }, 'c-4': { kind: 'claim', author: 'a-2', answers: 'q-1' } });
  const s = new Map([['c-3', 0.6], ['c-4', 0.5]]);
  assert.ok(Math.abs(tension(graph, s, 'c-3') - 0.3) < 1e-9);
});

test('tension is the strongest attacker times the target, zero when unattacked', () => {
  const graph = g({ ...base, 'c-3': { kind: 'claim', answers: 'q-1' }, 'c-4': { kind: 'claim', attacks: 'c-3' }, 'c-5': { kind: 'claim', attacks: 'c-3' } });
  const s = new Map([['c-3', 0.8], ['c-4', 0.5], ['c-5', 0.25]]);
  assert.ok(Math.abs(tension(graph, s, 'c-3') - 0.4) < 1e-9);
  assert.equal(tension(graph, s, 'c-4'), 0);
});

test('crowding counts distinct living authors within the window', () => {
  const dead = { ...alive('L3'), died: 4 };
  const graph = g({ ...base, 'a-3': dead, 'c-3': { kind: 'claim', author: 'a-1', answers: 'q-1', tick: 100 },
    'c-4': { kind: 'claim', author: 'a-1', answers: 'q-1', tick: 101 }, 'c-5': { kind: 'claim', author: 'a-2', answers: 'q-1', tick: 100 - P.crowd_window - 1 },
    'c-6': { kind: 'claim', author: 'a-3', answers: 'q-1', tick: 101 } });
  assert.equal(crowding(graph, 'q-1', 102, P), 1);
});

test('a question is active while anything under it was written within the window', () => {
  const graph = g({ ...base, 'q-2': { kind: 'question', parent: 'g-1', tick: 0 }, 'c-3': { kind: 'claim', answers: 'q-1', tick: 90 }, 'c-4': { kind: 'claim', attacks: 'c-3', tick: 95 } });
  assert.deepEqual(activeQuestions(graph, 100, P), ['q-1']);
  assert.deepEqual(activeQuestions(graph, 95 + P.crowd_window + 1, P), []);
});
```

### Step 2: Run `node --test test/field.test.mjs` — Expected: FAIL, module not found
### Step 3: Implement `src/field.mjs` per `interfaces.md` § Field
### Step 4: Run `node --test test/` — Expected: PASS
### Step 5: Commit
```bash
git add src/field.mjs test/field.test.mjs
git commit -m "Derive heat, tension and crowding from the graph"
```

## Acceptance Criteria
- [ ] `writesTo` returns the nodes naming the id through answers, attacks, supports, checks, and verdicts addressing it → test 'writes to a node are the ticks of the nodes naming it, verdicts included'
- [ ] `heat` decays by half per half-life → test 'heat halves every half-life and verdicts weigh verdict_heat'
- [ ] A verdict's write weighs `verdict_heat` → test 'heat halves every half-life and verdicts weigh verdict_heat'
- [ ] `tension` is strongest attacker × own strength, 0 unattacked → test 'tension is the strongest attacker times the target, zero when unattacked'
- [ ] A rival answer counts as an attacker in `tension` → test 'a rival answer counts as an attacker in tension'
- [ ] `writesTo` reads a verdict's `addresses` as a list → test 'writes to a node are the ticks of the nodes naming it, verdicts included'
- [ ] `crowding` counts distinct living authors inside `crowd_window` → test 'crowding counts distinct living authors within the window'
- [ ] `activeQuestions` lists questions with a write under them inside the window → test 'a question is active while anything under it was written within the window'
- [ ] No files outside Scope were modified
