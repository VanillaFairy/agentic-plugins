# Task T02a: Strength — tests

rigor: pair
role: red
size: ~22 turns (4 edit sites, 6 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | high | numeric rules with edge cases; expected values must be derived, not copied |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Strength
- Read: `../shared/architecture.md` § Node kinds and § physics.json

## Dependencies
- Depends on: T01
- Depended on by: T02b

## Scope
**Files:**
- Create: `test/strength.test.mjs`
- Create: `src/strength.mjs` exporting the names in `interfaces.md` § Strength, each throwing `new Error('not implemented')`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Build graphs in memory. Agents carry lineages, claims carry authors:

```js
const P = JSON.parse(readFileSync(new URL('../physics.json', import.meta.url)));
const g = (nodes) => new Map(Object.entries(nodes).map(([id, fm]) => [id, { id, fm: { id, ...fm }, title: id, body: '' }]));
const agent = (lineage) => ({ kind: 'agent', lineage, species: 'explorer', niche: 'q-1', energy: 0, escrow: 0, born: 0, genome: {} });
const goalQ = { 'g-1': { kind: 'goal', purpose: 'p', sources: [], supply: 1, settings: {} }, 'q-1': { kind: 'question', parent: 'g-1' } };
const claim = (author, provenance, rel = {}) => ({ kind: 'claim', author, provenance, ...rel });
```

- Compute expected numbers from the formulas in `interfaces.md` § Strength in the test (a small
  helper `f(w, E)` written from the formula is fine), never from what the code returns.
- Compare floats with a tolerance of 1e-3 for iterated results.

## Negative Constraints (DO NOT)
- Do NOT implement `strength.mjs` beyond the stubs.

## Implementation Steps

### Step 1: Write the tests, one per acceptance line

### Step 2: Run to verify they fail for the right reason
Run: `node --test test/strength.test.mjs`
Expected: every test FAILS with `not implemented`.

### Step 3: Commit
```bash
git add test/strength.test.mjs src/strength.mjs
git commit -m "Pin claim strengths, relevance and verification in tests"
```

## Acceptance Criteria
- [ ] An unrelated claim keeps its provenance base score (A, I, F unchecked) → test 'a lone claim keeps its base score'
- [ ] One attacker lowers its target to f(w, −s_attacker) at the fixed point → test 'an attack lowers the target by the energy formula'
- [ ] One supporter from another lineage raises its target to f(w, s_supporter), capped by the ceiling → test 'a support from another lineage raises the target'
- [ ] A support from the target author's own lineage changes nothing → test 'a family cannot support itself'
- [ ] Ten attackers of one lineage weigh as their strongest one → test 'ten weak attacks from one lineage weigh as one'
- [ ] Two attackers of two lineages both count → test 'attacks from two lineages add up'
- [ ] Strength never exceeds the provenance ceiling however many supporters → test 'support never lifts a claim past its provenance ceiling'
- [ ] A mutual attack converges to equal strengths for equal bases → test 'a mutual attack settles symmetrically'
- [ ] An odd attack cycle (A→B→C→A) returns finite strengths in [0, 1] within max_iters → test 'an odd attack cycle still returns strengths in range'
- [ ] A chain A attacks B attacks C leaves C stronger than with B alone attacking it → test 'an attacked attacker weakens its attack'
- [ ] An F claim supported with `checks` by another lineage takes base F_verified → test 'a cross-lineage check verifies an F claim'
- [ ] A `checks` support from the same lineage leaves base F_unchecked → test 'a family cannot verify itself'
- [ ] A `checks` attack from another lineage gives base F_failed, and wins over a verifying support → test 'a failed check outweighs a passed one'
- [ ] A pinned node keeps exactly its pin → test 'a pinned claim keeps its pin'
- [ ] An `ask` node is an argument with base I: a supporting claim raises it, an attacking claim lowers it → test 'an ask gains and loses strength like a claim'
- [ ] A question under the goal has relevance argument base question_base_factor; a sub-question's base is its parent's relevance × question_base_factor → test 'a sub-question starts less relevant than its parent'
- [ ] Attacking a question's relevance argument lowers `relevance` for it and for `claimRelevance` of every claim answering it → test 'an attacked relevance lowers every claim under the question'
- [ ] `claimRelevance` follows attacks and supports up to the answered question, and is 0 for a definition → test 'claim relevance follows the relation chain'
- [ ] No files outside Scope were modified
