# Task T03a: Closing rules — tests

rigor: pair
role: red
size: ~20 turns (5 edit sites, 5 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | high | many conditions, each needs its own failing case |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Closing rules and § Nodes
- Read: `../shared/architecture.md` § Node roles and their frontmatter

## Dependencies
- Depends on: T01
- Depended on by: T03b

## Scope
**Files:**
- Create: `test/rules.test.mjs`
- Create: `skills/think-tank/scripts/lib/rules.mjs` containing only `export function topicRules()`
  throwing `new Error('not implemented')`.

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Build `nodes` in memory. Start every case from one fixture that reaches consensus, then break
  exactly one condition, so each test proves that one condition matters:

```js
const graph = (fms) => new Map(Object.entries(fms).map(([id, fm]) => [id, { id, fm, title: fm.title ?? id, body: '', links: [], unclosed: false }]));
const T = 'q-m-1';
const agreed = () => ({
  [T]: { role: 'topic', facet: 'x', status: 'open', seq: 1 },
  'p-quest-1': { role: 'proposal', answers: T, author: 'quest@q-m-1', seq: 2 },
  'c-save-1': { role: 'claim', target: 'p-quest-1', stance: 'con', provenance: 'I', author: 'save@q-m-1', seq: 3 },
  'c-quest-1': { role: 'claim', target: 'c-save-1', stance: 'reply', author: 'quest@q-m-1', seq: 4 },
  'pos-save-q-m-1': { role: 'position', topic: T, holds: 'p-quest-1', state: 'agreeing', author: 'save@q-m-1', seq: 5 },
  'pos-quest-q-m-1': { role: 'position', topic: T, holds: 'p-quest-1', state: 'agreeing', author: 'quest@q-m-1', seq: 5 },
  'b-save-q-m-1': { role: 'ballot', topic: T, confidence: 8, doubt: '', author: 'save@q-m-1', seq: 6 },
  'b-quest-q-m-1': { role: 'ballot', topic: T, confidence: 7, doubt: '', author: 'quest@q-m-1', seq: 6 },
});
```

- Assert `holds` and `outcome`; for a broken condition also assert that `missing` is non-empty.
  Don't pin the wording of `missing` reasons.

## Negative Constraints (DO NOT)
- Do NOT implement `topicRules`.
- Do NOT touch any other file.

## Implementation Steps

### Step 1: Write the tests, one per acceptance line

### Step 2: Run to verify they fail for the right reason
Run: `node --test test/rules.test.mjs`
Expected: every test FAILS with `not implemented`.

### Step 3: Commit
```bash
git add test/rules.test.mjs skills/think-tank/scripts/lib/rules.mjs
git commit -m "Pin the closing rules a topic moderator applies in tests"
```

## Acceptance Criteria
- [ ] The fixture reaches consensus on `p-quest-1` with outcome `decided` → test 'agreement after an answered objection is consensus'
- [ ] One expert alone is never consensus → test 'consensus needs at least two experts'
- [ ] Positions holding different proposals are not consensus → test 'consensus needs every position on one proposal'
- [ ] A position still `arguing` blocks consensus → test 'consensus needs every position agreeing'
- [ ] A proposal answering another topic is not consensus on this one → test 'the agreed proposal must answer this topic'
- [ ] A proposal nobody but its author objected to is not consensus → test 'consensus needs a clash with someone else'
- [ ] An objection with no answer blocks consensus, a conceded one doesn't → test 'an open objection blocks consensus and a conceded one does not'
- [ ] A reply by the objection's own author does not answer it → test 'answering your own objection does not count'
- [ ] An unanswered `ask` claim anywhere in the topic blocks consensus → test 'an unanswered ask blocks consensus'
- [ ] A `pro` `F` claim on the proposal without `verified: yes` blocks consensus → test 'an unverified fact under the proposal blocks consensus'
- [ ] A missing ballot blocks consensus → test 'every expert must file a ballot'
- [ ] A ballot with confidence 5 blocks consensus, 6 does not → test 'a ballot at confidence 5 or below means the agreement was not earned'
- [ ] A ballot doubt with no reply blocks consensus; one answered by another author does not → test 'an unanswered ballot doubt blocks consensus'
- [ ] Two rivals that each survived a clash, everyone holding, with an acknowledged crux node, hold crux with outcome `crux` → test 'two surviving rivals with an agreed crux close on the crux'
- [ ] A crux node acknowledged by only one side doesn't hold → test 'a crux needs acknowledgement from both sides'
- [ ] A crux node with an empty `decided_by` doesn't hold → test 'a crux must say what would decide it'
- [ ] A rival that never faced an objection doesn't hold crux → test 'each rival must have survived a clash'
- [ ] A position still `arguing` blocks crux → test 'a crux needs everyone holding'
- [ ] Positions on only one proposal, or a single expert, don't hold crux → test 'a crux needs two experts on two proposals'
- [ ] `consensus.proposal` is the agreed proposal, or `null` when positions differ → test 'consensus names the agreed proposal or none'
- [ ] `crux.crux` is the first qualifying crux node by id, or `null` → test 'crux names the first qualifying crux node'
- [ ] Everyone holding with nothing newer than `since` and no agreed crux is a stall → test 'everyone holding with nothing new is a stall'
- [ ] A node newer than `since` means no stall → test 'a new node since the last look is not a stall'
- [ ] When crux holds there is no stall → test 'an agreed crux is not a stall'
- [ ] A position not `holding` means no stall → test 'someone still arguing is not a stall'
- [ ] The same author re-raising an answered objection with the same target and title is a loop → test 'an answered objection raised again unchanged is a loop'
- [ ] A different title, a different author or an unanswered first objection is no loop → test 'a reworded or unanswered objection is not reported as a loop'
- [ ] The repeat must have a larger `seq` than the original, and `repeats` names the earliest original → test 'a loop points at the earliest answered original'
- [ ] An expert whose `wakes` reaches `cap` is capped, and consensus then yields no `decided` outcome → test 'reaching the wake cap rules out a decided outcome'
- [ ] At the cap with a held crux, the outcome is `crux` → test 'at the cap a held crux still closes the topic'
- [ ] An escalation on a node of the topic is listed until a verdict addresses it → test 'an escalation in the topic stays listed until a verdict addresses it'
- [ ] The topic's own escalation addressed by a verdict gives outcome `ruled` → test 'a verdict on the topic's escalation rules it'
- [ ] `positions` lists each cast member's `holds`, `state` and `seq`, sorted by expert → test 'positions are reported per expert'
- [ ] `seq`, `confidence` and `wakes` given as strings compare as numbers (seq `'10'` is newer than `since` 9; confidence `'6'` is above 5) → test 'numbers written as strings still compare as numbers'
- [ ] No files outside Scope were modified
