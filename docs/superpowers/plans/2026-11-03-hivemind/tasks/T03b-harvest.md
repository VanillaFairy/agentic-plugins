# Task T03b: Dung extensions and harvest — implementation

rigor: pair
role: green
size: ~19 turns (3 edit sites, 7 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | search over admissible sets against locked tests |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Dung and harvest and § Strength

## Dependencies
- Depends on: T03a
- Depended on by: T07, T08a, T12

## Scope
**Files:**
- Modify: `src/dung.mjs`, `src/harvest.mjs` (replace the stubs)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `preferredExtensions`: enumerate admissible sets by backtracking over arguments in sorted order
  (include or exclude, pruning on conflict), keep those not contained in another, stop collecting at
  `max` and set `truncated`. Question subtrees are small; no cleverer algorithm is needed.
- `worldviews`: attacks among the subtree's claims (`attacks` field), extensions over the subtree,
  projection onto the question's answers with the two filters, dedupe; cruxes by breadth-first
  search over attack edges, ignoring direction, between one worldview's answers and another's.
- The lineage of a claim comes from its author agent: `lineageOf` in `src/graph/lineage.mjs` (T01).

## Negative Constraints (DO NOT)
- Do NOT modify `test/dung.test.mjs` or `test/harvest.test.mjs`: authored by T03a and locked.

## Implementation Steps
### Step 1: Read the locked tests
### Step 2: Implement both modules
### Step 3: Run `node --test test/` — Expected: PASS
### Step 4: Commit
```bash
git add src/dung.mjs src/harvest.mjs
git commit -m "Harvest coherent worldviews and their cruxes per question"
```

## Acceptance Criteria
- [ ] Every test in `test/dung.test.mjs` and `test/harvest.test.mjs` passes, unmodified
- [ ] The full suite is green
- [ ] No files outside Scope were modified
