# Task T02b: Strength — implementation

rigor: pair
role: green
size: ~17 turns (2 edit sites, 6 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | an iterated numeric model against locked tests |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Strength
- Read: `../shared/architecture.md` § Node kinds

## Dependencies
- Depends on: T02a
- Depended on by: T04, T05, T07, T08

## Scope
**Files:**
- Modify: `src/strength.mjs` (replace the stubs)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Implement exactly `interfaces.md` § Strength. Shape of the computation:

```js
// 1. arguments: claim ids + `${qid}#relevance` for each question
// 2. relations: for each claim with attacks/supports, an edge (claim → target), dropping supports
//    whose author lineage equals the target author's lineage
// 3. bases: provenance (with verification) for claims; relevance bases computed parents-first
// 4. iterate: s ← s + step·(f(w, E(s)) − s) over all non-pinned arguments, E aggregated per lineage
//    (max per lineage among attackers and among supporters), until max |Δ| < eps or max_iters
// 5. clamp claims to their ceiling; return Map(id → s)
```

- `relevance(graph, strengths)` reads `<qid>#relevance` strengths; relevance bases need parents'
  relevance, so compute strengths of relevance arguments in topological order of `parent`, running
  the claim iteration once per level or iterating jointly with bases refreshed each step.

## Negative Constraints (DO NOT)
- Do NOT modify `test/strength.test.mjs`: authored by T02a and locked. If a test is wrong, escalate.
- Do NOT read files, the clock or `Math.random`.

## Implementation Steps

### Step 1: Read the locked tests
### Step 2: Implement `src/strength.mjs`
### Step 3: Run `node --test test/` — Expected: PASS
### Step 4: Commit
```bash
git add src/strength.mjs
git commit -m "Compute claim strengths with the quadratic energy model, by lineage"
```

## Acceptance Criteria
- [ ] Every test in `test/strength.test.mjs` passes, unmodified
- [ ] The full suite is green
- [ ] No files outside Scope were modified
