# Task T02a: Topic graph — tests

rigor: pair
role: red
size: ~17 turns (3 edit sites, 5 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | high | graph rules with edge cases the spec states in prose |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Topic graph and § Nodes
- Read: `../shared/architecture.md` § Node roles and their frontmatter and § Design decisions

## Dependencies
- Depends on: T01
- Depended on by: T02b

## Scope
**Files:**
- Create: `test/topics.test.mjs`
- Create: `skills/think-tank/scripts/lib/topics.mjs` containing only the exported names from
  `shared/interfaces.md` § Topic graph, each throwing `new Error('not implemented')`, so the tests
  fail on behaviour and not on a missing module.

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Build `nodes` maps in memory with this helper, so no test touches the disk:

```js
const graph = (fms) => new Map(Object.entries(fms).map(([id, fm]) => [id, { id, fm, title: id, body: '', links: [], unclosed: false }]));
const topic = (fm = {}) => ({ role: 'topic', facet: 'x', status: 'open', ...fm });
const done = (seq, fm = {}) => topic({ status: 'complete', outcome: 'decided', completed_seq: seq, ...fm });
```

- One test per acceptance line below, named as the line names it.
- Assert invariants the spec fixes. Where the spec leaves something open, don't pin a value:
  escalate it to the controller instead.

## Negative Constraints (DO NOT)
- Do NOT implement any function in `topics.mjs` beyond the throwing stubs.
- Do NOT touch `nodes.mjs` or any other file.

## Implementation Steps

### Step 1: Write the tests, one per acceptance line

Example of the expected style:

```js
test('a topic is blocked until every topic it needs is complete', () => {
  const nodes = graph({ 'q-a-1': topic({ needs: ['q-b-1', 'q-c-1'] }), 'q-b-1': done(3), 'q-c-1': topic() });
  assert.deepEqual(blockedBy(nodes, 'q-a-1'), ['q-c-1']);
  assert.equal(isComplete(nodes, 'q-a-1'), false);
});
```

### Step 2: Run to verify they fail for the right reason
Run: `node --test test/topics.test.mjs`
Expected: every test FAILS with `not implemented`, and none with a syntax or import error.

### Step 3: Commit
```bash
git add test/topics.test.mjs skills/think-tank/scripts/lib/topics.mjs
git commit -m "Pin the topic graph's blocking, cycle and reopening rules in tests"
```

## Acceptance Criteria
- [ ] `needsOf` resolves a need naming a duplicate to its canonical topic → test 'needs resolve through duplicates and skip missing topics'
- [ ] `needsOf` drops a need naming a missing node → test 'needs resolve through duplicates and skip missing topics'
- [ ] `needsOf` drops a need naming a node that is not a topic → test 'needs naming a non-topic are dropped'
- [ ] `needsOf` lists a topic once when two entries resolve to it → test 'needs are deduplicated after resolving duplicates'
- [ ] `canonical` stops on a duplicate_of loop instead of recursing forever → test 'a duplicate_of loop ends instead of recursing'
- [ ] `needersOf` lists every topic needing it, including through an alias → test 'needers include topics that need its duplicate'
- [ ] `blockedBy` lists the needs that are not complete → test 'a topic is blocked until every topic it needs is complete'
- [ ] A topic needed by two topics blocks both and unblocks both → test 'a shared subtopic blocks and then unblocks every needer'
- [ ] `isComplete` needs status complete and an outcome → test 'complete needs both a complete status and an outcome'
- [ ] `isComplete` is false when a need completed after the topic did (`completed_seq` not smaller) → test 'a topic completed before its dependency is not complete'
- [ ] `isComplete` holds for a need whose outcome is `crux` → test 'a dependency that closed on a crux counts as complete'
- [ ] `isComplete` is transitive: a need of a need that is not complete makes the top not complete → test 'completeness is transitive through needs'
- [ ] `cycles` reports a two-topic and a three-topic cycle with sorted ids → test 'cycles are reported as sorted strongly connected components'
- [ ] `cycles` reports a topic that needs itself → test 'a topic that needs itself is a cycle'
- [ ] `cycles` reports nothing for a diamond (A needs B and C, both need D) → test 'a shared dependency is not a cycle'
- [ ] Topics in a cycle are never complete → test 'topics in a cycle stay incomplete'
- [ ] `graphReport.blocked` maps each not-complete topic with a non-empty `blockedBy` to that list, and leaves out topics with nothing blocking them → test 'the report maps each blocked topic to what blocks it'
- [ ] When a needed topic is reopened (status back to open), every topic that needs it transitively and is marked complete appears in `stale` → test 'reopening a dependency makes every complete needer stale, transitively'
- [ ] `graphReport.unblocked` lists topics with status blocked and nothing left blocking them → test 'a blocked topic whose needs completed is reported as unblocked'
- [ ] `graphReport.stale` lists topics marked complete that `isComplete` rejects → test 'a topic marked complete too early is reported stale'
- [ ] `graphReport` leaves alias topics (with `duplicate_of`) out of cycles, blocked, unblocked and stale → test 'a merged duplicate is never reported on its own'
- [ ] `graphReport.escalations` lists a node's escalation until a verdict addresses that node → test 'an escalation stays open until a verdict addresses its node'
- [ ] `graphReport.done` needs at least one root, every root complete and no open escalation → test 'the run is done only when every root is complete and nothing is escalated'
- [ ] No files outside Scope were modified
