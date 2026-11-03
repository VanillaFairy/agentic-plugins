# Task T01: Nodes module

rigor: tdd
size: ~20 turns (4 edit sites, 6 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Nodes
- Read: `../shared/architecture.md` § Module boundaries and § Node roles and their frontmatter

## Dependencies
- Depends on: —
- Depended on by: T02a, T03a, T04a, T05, T06

## Scope
**Files:**
- Create: `skills/think-tank/scripts/lib/nodes.mjs`
- Create: `test/nodes.test.mjs`
- Modify: `skills/think-tank/scripts/tt.mjs` (delete the moved functions; import them from `./lib/nodes.mjs`)
- Modify: `test/tt.test.mjs` (move the frontmatter parsing test out to `test/nodes.test.mjs`)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Move `parseValue`, `unquote`, `parseNode`, `list`, `nodeId` and `loadGraph` from `tt.mjs` into
  `lib/nodes.mjs` unchanged, and export `parseNode`, `loadGraph`, `list`, `nodeId`.
- Add `topicOf` exactly as `shared/interfaces.md` § Nodes states, including the `position`,
  `crux` and `ballot` cases, which 0.2.1's private `topicOf` lacks.
- `tt.mjs` keeps working: it imports the moved names, and its own private `topicOf` is deleted in
  favour of the exported one.

## Negative Constraints (DO NOT)
- Do NOT change `parseNode`'s behaviour or return shape.
- Do NOT touch `check`, `next`, `curate` or any other 0.2.1 command logic beyond the import swap;
  T06 replaces them.

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/nodes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNode, topicOf, list, nodeId } from '../skills/think-tank/scripts/lib/nodes.mjs';

const graph = (fms) => new Map(Object.entries(fms).map(([id, fm]) => [id, { id, fm, title: id, body: '', links: [], unclosed: false }]));

test('frontmatter accepts JSON values, YAML flow lists and YAML block lists', () => {
  const n = parseNode('---\na: "x"\nb: [one, "two"]\nc:\n  - p\n  - q\nd: 3\n---\n# T\n\nsee [n](q-a-1.md) and [w](https://e.com/x.md)\n');
  assert.deepEqual([n.fm.a, n.fm.b, n.fm.c, n.fm.d, n.title, n.links], ['x', ['one', 'two'], ['p', 'q'], 3, 'T', ['q-a-1']]);
});

test('a node whose frontmatter is never closed is marked unclosed', () => {
  assert.equal(parseNode('---\nid: q-x-1\nrole: topic\n# Title\n').unclosed, true);
  assert.equal(parseNode('---\nid: q-x-1\n---\n# Title\n').unclosed, false);
});

test('a proposal and a claim chain belong to the topic they answer', () => {
  const nodes = graph({
    'q-a-1': { role: 'topic' },
    'p-a-1': { role: 'proposal', answers: 'q-a-1' },
    'c-b-1': { role: 'claim', target: 'p-a-1' },
    'c-c-1': { role: 'claim', target: 'c-b-1.md' },
  });
  assert.deepEqual(['q-a-1', 'p-a-1', 'c-b-1', 'c-c-1'].map((id) => topicOf(nodes, id)), ['q-a-1', 'q-a-1', 'q-a-1', 'q-a-1']);
});

test('a position, a crux and a ballot belong to the topic they name', () => {
  const nodes = graph({
    'q-a-1': { role: 'topic' },
    'pos-save-q-a-1': { role: 'position', topic: 'q-a-1' },
    'x-save-1': { role: 'crux', topic: 'q-a-1' },
    'b-save-q-a-1': { role: 'ballot', topic: 'q-a-1' },
  });
  assert.deepEqual(['pos-save-q-a-1', 'x-save-1', 'b-save-q-a-1'].map((id) => topicOf(nodes, id)), ['q-a-1', 'q-a-1', 'q-a-1']);
});

test('a node naming a missing topic, a non-topic or a missing node belongs to no topic', () => {
  const nodes = graph({
    'p-a-1': { role: 'proposal', answers: 'q-gone-1' },
    'pos-a-x': { role: 'position', topic: 'p-a-1' },
    'e-save': { role: 'expert' },
  });
  assert.deepEqual(['p-a-1', 'pos-a-x', 'e-save', 'nothing'].map((id) => topicOf(nodes, id)), [null, null, null, null]);
});

test('a claim cycle with no topic ends as no topic instead of recursing forever', () => {
  const nodes = graph({ 'c-a-1': { role: 'claim', target: 'c-b-1' }, 'c-b-1': { role: 'claim', target: 'c-a-1' } });
  assert.equal(topicOf(nodes, 'c-a-1'), null);
});

test('list and nodeId normalise frontmatter values', () => {
  assert.deepEqual([list(undefined), list(''), list('a'), list(['a', 'b'])], [[], [], ['a'], ['a', 'b']]);
  assert.equal(nodeId(' q-a-1.md '), 'q-a-1');
});
```

Delete the test 'frontmatter accepts JSON values, YAML flow lists and YAML block lists' from
`test/tt.test.mjs`: it now lives in `nodes.test.mjs`. Leave every other test in `tt.test.mjs`
where it is; T06 replaces that file.

### Step 2: Run to verify they fail
Run: `node --test test/nodes.test.mjs`
Expected: FAIL, `Cannot find module .../lib/nodes.mjs`.

### Step 3: Implement

Create `lib/nodes.mjs` with the moved functions and:

```js
export function topicOf(nodes, id, guard = 0) {
  const n = nodes.get(nodeId(id));
  if (!n || guard > 50) return null;
  switch (n.fm.role) {
    case 'topic': return n.id;
    case 'proposal': return topicOf(nodes, n.fm.answers ?? '', guard + 1);
    case 'claim': return topicOf(nodes, n.fm.target ?? '', guard + 1);
    case 'position': case 'crux': case 'ballot': {
      const t = nodes.get(nodeId(n.fm.topic ?? ''));
      return t?.fm.role === 'topic' ? t.id : null;
    }
    default: return null;
  }
}
```

In `tt.mjs`, delete the moved functions and the private `topicOf`, and add
`import { parseNode, loadGraph, list, nodeId, topicOf } from './lib/nodes.mjs';`.

### Step 4: Run the whole suite
Run: `node --test test/`
Expected: PASS, every test in `nodes.test.mjs` and every remaining test in `tt.test.mjs`.

### Step 5: Commit
```bash
git add skills/think-tank/scripts/lib/nodes.mjs skills/think-tank/scripts/tt.mjs test/nodes.test.mjs test/tt.test.mjs
git commit -m "Move node parsing into lib/nodes.mjs and give positions, cruxes and ballots a topic"
```

## Acceptance Criteria
- [ ] `parseNode` behaves as in 0.2.1 → test 'frontmatter accepts JSON values, YAML flow lists and YAML block lists'
- [ ] `parseNode` marks unclosed frontmatter → test 'a node whose frontmatter is never closed is marked unclosed'
- [ ] `topicOf` of a topic is its own id → test 'a proposal and a claim chain belong to the topic they answer'
- [ ] `topicOf` follows `answers` and `target` through claim chains → test 'a proposal and a claim chain belong to the topic they answer'
- [ ] `topicOf` of a position, crux or ballot is its `topic` → test 'a position, a crux and a ballot belong to the topic they name'
- [ ] `topicOf` is null for a missing topic, a non-topic target, an unrelated role and a missing node → test 'a node naming a missing topic, a non-topic or a missing node belongs to no topic'
- [ ] `topicOf` stops on a claim cycle → test 'a claim cycle with no topic ends as no topic instead of recursing forever'
- [ ] `list` and `nodeId` normalise values → test 'list and nodeId normalise frontmatter values'
- [ ] The full suite stays green, so `tt.mjs` still works on the moved code
- [ ] No files outside Scope were modified
