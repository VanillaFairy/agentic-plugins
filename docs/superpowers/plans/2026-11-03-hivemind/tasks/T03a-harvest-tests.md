# Task T03a: Dung extensions and harvest — tests

rigor: pair
role: red
size: ~22 turns (4 edit sites, 6 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | high | argumentation semantics with edge cases |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Dung and harvest and § Strength
- Read: `../shared/architecture.md` § Node kinds

## Dependencies
- Depends on: T01
- Depended on by: T03b

## Scope
**Files:**
- Create: `test/dung.test.mjs`, `test/harvest.test.mjs`
- Create: `src/dung.mjs`, `src/harvest.mjs` exporting the names in `interfaces.md` § Dung and harvest, each throwing `new Error('not implemented')`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `dung` tests use plain arrays. `harvest` tests build a graph in memory (helper as in T02a's
  task: `g`, `agent(lineage)`, `claim(author, provenance, rel)`) and pass a hand-built `strengths`
  map, so harvest is tested independently of the strength model.
- Expected extensions come from the definition (maximal admissible sets), worked out by hand for
  each small graph. Remember a claim has exactly one relation, so attacks among claims form trees;
  the only cycles are the implicit rivalry between answers of one question (`rivalEdges` in
  `src/graph/lineage.mjs`, from T01).

## Negative Constraints (DO NOT)
- Do NOT implement either module beyond the stubs.

## Implementation Steps
### Step 1: Write the tests, one per acceptance line
### Step 2: Run `node --test test/dung.test.mjs test/harvest.test.mjs` — Expected: every test FAILS with `not implemented`
### Step 3: Commit
```bash
git add test/dung.test.mjs test/harvest.test.mjs src/dung.mjs src/harvest.mjs
git commit -m "Pin preferred extensions and the harvest's worldviews in tests"
```

## Acceptance Criteria
- [ ] No attacks: one extension holding every argument → test 'without attacks everything stands together'
- [ ] A attacks B attacks C: one extension {A, C} → test 'a defended argument stands with its defender'
- [ ] A and B attack each other: two extensions {A} and {B} → test 'a mutual attack gives two worldviews'
- [ ] A self-attacking argument is in no extension → test 'a self-attacker is never accepted'
- [ ] An odd cycle A→B→C→A: one extension, the empty set → test 'an odd cycle accepts nothing'
- [ ] Extensions and their members come back sorted → test 'extensions are sorted'
- [ ] More than `max` extensions are cut to `max` and the result is flagged `truncated` → test 'too many extensions are cut and flagged'
- [ ] `questionSubtree` holds the question's answers and every claim below them through attacks and supports, and nothing from another question → test 'a question's subtree stops at its own claims'
- [ ] `questionSubtree`'s attacks include both directions between every two answers of the question → test 'the subtree carries the answers' rivalry'
- [ ] Two answers to one question, each attacked by claims of two other lineages that nothing defeats, come back as two worldviews → test 'two surviving answers are two worldviews'
- [ ] An answer whose only attacker is itself defeated, beside a rival with an undefeated attacker, leaves one worldview with the first answer → test 'a defeated rival leaves one worldview'
- [ ] An answer below harvest_threshold is left out of every worldview → test 'a weak answer is not harvested'
- [ ] An answer attacked directly by claims of fewer than two lineages other than its own is left out, and rivalry alone doesn't count as being attacked → test 'an answer two other families never attacked is not harvested'
- [ ] Two worldviews produce one crux naming one answer from each, the attack chain between them (the rival pair itself), and the strongest claim whose `decides` names that pair → test 'a crux names its answers, its chain and what decides it'
- [ ] `reportInput` carries the skeleton, every verdict's text and addresses, and the books it is given → test 'the report input carries rulings and spend'
- [ ] A crux with no `decides` claim reports `decides: null` → test 'a crux nobody decided says so'
- [ ] `skeleton` lists questions in descending relevance, each with its worldviews → test 'the skeleton orders questions by relevance'
- [ ] No files outside Scope were modified
