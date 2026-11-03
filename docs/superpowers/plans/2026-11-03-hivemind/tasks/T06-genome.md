# Task T06: Genome

rigor: tdd
size: ~19 turns (2 edit sites, 7 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Genome
- Read: `../shared/architecture.md` § Node kinds and § Design decisions

## Dependencies
- Depends on: T01
- Depended on by: T08, T09, T10, T11

## Scope
**Files:**
- Create: `src/genome.mjs`, `test/genome.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/genome.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGenome, drawOperator, secondParent, childLineage, renderGenomeTurn, mutationPrompt, parseMutation, speciesForBud } from '../src/genome.mjs';

const G = { lens: 'what it costs to build', stance: 'challenge', constraints: ['no rewrites'], species: 'critic', temperament: 0.3 };
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const ag = (id, lineage, niche, balance, species = 'explorer', died) => ({ id, lineage, niche, balance, species, died });

test('a well-formed genome has no problems, and a bad stance or temperament does', () => {
  assert.deepEqual(validateGenome(G), []);
  assert.ok(validateGenome({ ...G, stance: 'sulk' }).length > 0);
  assert.ok(validateGenome({ ...G, temperament: 2 }).length > 0);
});

test('operators split by the mutation rate between disruptive and mild', () => {
  const rng = lcg(7), n = 20000, counts = {};
  for (let i = 0; i < n; i++) { const op = drawOperator(0.3, rng); counts[op] = (counts[op] ?? 0) + 1; }
  const disruptive = (counts.inversion + counts.transplant + counts.crossover) / n;
  assert.ok(Math.abs(disruptive - 0.3) < 0.02);
  for (const op of ['point', 'constraint', 'species_shift']) assert.ok(Math.abs(counts[op] / n - 0.7 / 3) < 0.02);
});

test('the second parent is the richest living agent of another lineage in the niche', () => {
  const child = ag('a-9', 'L1', 'q-1', 0);
  const agents = [ag('a-1', 'L1', 'q-1', 900), ag('a-2', 'L2', 'q-1', 300), ag('a-3', 'L3', 'q-1', 500), ag('a-4', 'L4', 'q-2', 999), ag('a-5', 'L5', 'q-1', 800, 'explorer', 12)];
  assert.equal(secondParent(agents, child)?.id, 'a-3');
  assert.equal(secondParent([ag('a-1', 'L1', 'q-1', 900)], child), null);
});

test('a transplant starts a new lineage; every other operator keeps the parent's', () => {
  assert.equal(childLineage({ lineage: 'L1' }, 'transplant', 'L7'), 'L7');
  for (const op of ['point', 'constraint', 'inversion', 'crossover', 'species_shift']) assert.equal(childLineage({ lineage: 'L1' }, op, 'L7'), 'L1');
});

test('the genome turn carries every gene', () => {
  const text = renderGenomeTurn(G);
  for (const s of [G.lens, G.stance, G.constraints[0], G.species]) assert.ok(text.includes(s));
});

test('the mutation prompt names the operator and asks for JSON, and the answer parses back', () => {
  const p = mutationPrompt(G, 'crossover', { ...G, lens: 'what the child sees' });
  assert.ok(p.includes('crossover') && p.includes('what the child sees') && /JSON/.test(p));
  assert.deepEqual(parseMutation(p), G);
  assert.deepEqual(parseMutation(`Sure, here it is:\n${JSON.stringify(G)}\nDone.`), G);
  assert.throws(() => parseMutation('no json here'), /genome/);
});

test('a bud takes the species that is below its floor', () => {
  const four = [ag('a-1', 'L1', 'q', 1), ag('a-2', 'L2', 'q', 1), ag('a-3', 'L3', 'q', 1), ag('a-4', 'L4', 'q', 1)];
  assert.equal(speciesForBud(four, { species_floor: 0.25 }), 'critic');
  assert.equal(speciesForBud([...four.slice(0, 3), ag('a-4', 'L4', 'q', 1, 'critic')], { species_floor: 0.25 }), null);
});
```

### Step 2: Run `node --test test/genome.test.mjs` — Expected: FAIL, module not found
### Step 3: Implement `src/genome.mjs` per `interfaces.md` § Genome
### Step 4: Run `node --test test/` — Expected: PASS
### Step 5: Commit
```bash
git add src/genome.mjs test/genome.test.mjs
git commit -m "Add genomes, the operator draw, lineages and the mutation prompt"
```

## Acceptance Criteria
- [ ] `validateGenome` accepts a well-formed genome → test 'a well-formed genome has no problems, and a bad stance or temperament does'
- [ ] `validateGenome` rejects a stance outside its set and a temperament outside [0, 1] → test 'a well-formed genome has no problems, and a bad stance or temperament does'
- [ ] `drawOperator` draws disruptive operators with probability `rate`, mild ones with `1 − rate`, evenly within each group → test 'operators split by the mutation rate between disruptive and mild'
- [ ] `secondParent` picks the richest living agent of another lineage in the child's niche, or null → test 'the second parent is the richest living agent of another lineage in the niche'
- [ ] `childLineage` starts a new lineage only for a transplant → test 'a transplant starts a new lineage; every other operator keeps the parent's'
- [ ] `renderGenomeTurn` includes lens, stance, constraints and species → test 'the genome turn carries every gene'
- [ ] `mutationPrompt` names the operator and the other genome and asks for JSON → test 'the mutation prompt names the operator and asks for JSON, and the answer parses back'
- [ ] `mutationPrompt` puts the parent genome's JSON before any other JSON, so `parseMutation` of the prompt returns the parent → test 'the mutation prompt names the operator and asks for JSON, and the answer parses back'
- [ ] `parseMutation` extracts the first JSON object and throws without one → test 'the mutation prompt names the operator and asks for JSON, and the answer parses back'
- [ ] `speciesForBud` returns the species below its floor, else null → test 'a bud takes the species that is below its floor'
- [ ] No files outside Scope were modified
