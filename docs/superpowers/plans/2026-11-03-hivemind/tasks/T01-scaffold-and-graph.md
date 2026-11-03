# Task T01: Scaffold, graph store, events, physics

rigor: tdd
size: ~36 turns (10 edit sites, 10 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/architecture.md` § Repository and § Module boundaries and § Run directory and § Node kinds and § The clock and § physics.json
- Read: `../shared/interfaces.md` § Graph

## Dependencies
- Depends on: —
- Depended on by: every later task

## Scope
The orchestrator has created the repository at `C:\work\claude\vanillafairy\hivemind` with one
empty commit on `master`; your worktree branches from it. Add:
- `package.json` (`"name": "hivemind"`, `"type": "module"`, `"bin": { "hive": "src/cli.mjs" }`,
  `"scripts": { "test": "node --test test/" }`, dependencies pinned exactly:
  `"@anthropic-ai/claude-agent-sdk": "0.3.317"`, `"zod": "4.6.7"`), and `package-lock.json` from
  `npm install`
- `.gitignore` (`node_modules/`)
- `physics.json` (exactly the defaults in `architecture.md` § physics.json)
- `src/graph/nodes.mjs`, `src/graph/schema.mjs`, `src/graph/store.mjs`, `src/graph/lineage.mjs`, `src/events.mjs`, `src/physics.mjs`
- `test/graph.test.mjs`, `test/store.test.mjs`

**BOUNDARY — you MUST NOT create or modify files outside this repository.** Read
`C:\work\claude\vanillafairy\think-tank\skills\think-tank\scripts\lib\nodes.mjs` as the starting
point for `parseNode`; copy its parsing code, don't import it.

## Positive Constraints (DO)
- `parseValue` tries `JSON.parse` on every value first (objects, arrays, numbers, `true`, `false`,
  `null`, quoted strings) and falls back to think-tank's bare-YAML rules only when that throws.
  `parseNode`'s `body` excludes the `# title` line (think-tank's keeps it; hivemind's doesn't).
- `author` and `seq` are not in any kind's `required`: the Hive stamps them on every node.
- `serializeNode({ id, fm, title, body })` writes `---`, one `key: <JSON.stringify(value)>` line per
  field in the order `id, kind, author, seq, tick` then the rest sorted, `---`, `# <title>`, a blank
  line, the body.
- `SCHEMA` holds, per kind, `required`, `refs` (fields naming other node ids; a value
  `<qid>#relevance` refers to `qid`), `lists` (ref fields holding arrays: `decides`, `candidates`,
  `addresses`)
  and `values` (allowed sets: claim `provenance` F/I/A, agent `species` explorer/critic,
  `genome.stance` challenge/extend/orthogonal).
- `initRun(dir, goal)` creates `graph/`, `outbox/`, `inbox/`, writes `seq` as `1`, writes the goal
  node `g-1` (`kind: goal`, `author: user`, `seq: 1`, `tick: 0`, `purpose`, `scope`, `sources`,
  `supply`, `settings: { tick: 0, physics: {} }`), `git init`, sets `core.autocrlf false`, and
  commits as author `hive <hive@localhost>`. It throws if `dir/graph` exists.
- `commit(dir, message)` runs `git add -A` and commits; returns `null` when nothing changed.
- `loadPhysics(dir)` deep-merges `physics.json` (resolved next to `src/`) with the goal's
  `settings.physics`.

## Negative Constraints (DO NOT)
- Do NOT import anything from think-tank.
- Do NOT add dependencies beyond the two pinned ones.

## Failure Modes
- Interrupted mid-write, then run again: a node file is written whole with `writeFileSync`; `initRun` refuses an existing `graph/` → acceptance line 'initRun refuses a directory that already holds a run'
- An input deleted, renamed or removed: a ref to a node that no longer exists → acceptance line 'a ref to a missing node is a problem'
- A value changed: `seq` persists in its file and the file decides → acceptance line 'seq counts up from the file and survives a reload'
- Every path into a guarded state: only `nextSeq` advances `seq` → acceptance line 'seq counts up from the file and survives a reload'
- Run from a linked worktree and from the main checkout: n/a: git runs only with `-C <run>/graph`
- Each target that already exists: an unchanged graph commits nothing → acceptance line 'commit returns null when nothing changed'

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/graph.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNode, serializeNode } from '../src/graph/nodes.mjs';
import { nodeProblems } from '../src/graph/schema.mjs';

const g = (nodes) => new Map(Object.entries(nodes).map(([id, fm]) => [id, { id, fm: { id, ...fm }, title: id, body: '' }]));

test('a node round-trips through serialize and parse, objects, booleans and null included', () => {
  const n = { id: 'a-7', fm: { id: 'a-7', kind: 'agent', author: 'hive', seq: 7, tick: 3, died: null, founder: true, session: 's-1', genome: { lens: 'cost', stance: 'challenge', constraints: ['x'], species: 'critic', temperament: 0.4 } }, title: 'An agent', body: 'Body text.' };
  const back = parseNode(serializeNode(n));
  assert.deepEqual([back.fm, back.title, back.body.trim()], [n.fm, n.title, n.body]);
});

test('a missing required field is a problem', () => {
  assert.match(nodeProblems(g({ 'c-2': { kind: 'claim' } })).map((p) => p.problem).join(' '), /provenance/);
});

test('a ref to a missing node is a problem, and a relevance ref names its question', () => {
  const graph = g({ 'q-1': { kind: 'question', parent: 'g-0' }, 'c-2': { kind: 'claim', provenance: 'I', attacks: 'q-9#relevance' } });
  const text = nodeProblems(graph).map((p) => p.problem).join(' ');
  assert.match(text, /g-0/);
  assert.match(text, /q-9/);
});

test('a value outside its set is a problem', () => {
  assert.match(nodeProblems(g({ 'c-2': { kind: 'claim', provenance: 'X' } })).map((p) => p.problem).join(' '), /provenance/);
});

test('lineage comes from the author agent', async () => {
  const { lineageOf } = await import('../src/graph/lineage.mjs');
  const graph = g({ 'a-5': { kind: 'agent', lineage: 'L2' }, 'c-6': { kind: 'claim', author: 'a-5', provenance: 'I' }, 'v-7': { kind: 'verdict', author: 'user' }, 'c-8': { kind: 'claim', author: 'a-99', provenance: 'I' } });
  assert.deepEqual(['c-6', 'v-7', 'c-8'].map((id) => lineageOf(graph, id)), ['L2', 'user', null]);
});

test('rival edges pair every two answers of a question', async () => {
  const { rivalEdges } = await import('../src/graph/lineage.mjs');
  const graph = g({ 'q-1': { kind: 'question' }, 'q-2': { kind: 'question' }, 'c-3': { kind: 'claim', provenance: 'I', answers: 'q-1' },
    'c-4': { kind: 'claim', provenance: 'I', answers: 'q-1' }, 'c-5': { kind: 'claim', provenance: 'I', answers: 'q-2' }, 'c-6': { kind: 'claim', provenance: 'I', attacks: 'c-3' } });
  assert.deepEqual(rivalEdges(graph), [['c-3', 'c-4'], ['c-4', 'c-3']]);
  assert.deepEqual(rivalEdges(graph, 'q-2'), []);
});

test('a claim with two relations is a problem', () => {
  const graph = g({ 'q-1': { kind: 'question', parent: 'g-1' }, 'g-1': { kind: 'goal', purpose: 'p', sources: [], supply: 1, settings: {} },
    'c-2': { kind: 'claim', provenance: 'I', answers: 'q-1' }, 'c-3': { kind: 'claim', provenance: 'I', answers: 'q-1', attacks: 'c-2' } });
  assert.deepEqual(nodeProblems(graph).map((p) => p.node), ['c-3']);
});
```

```js
// test/store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRun, loadGraph, nextSeq, writeNode, commit } from '../src/graph/store.mjs';
import { logEvent } from '../src/events.mjs';
import { loadPhysics } from '../src/physics.mjs';

const goal = { purpose: 'p', scope: 's', sources: ['C:/x'], supply: 1000 };
const fresh = () => { const dir = join(mkdtempSync(join(tmpdir(), 'hive-')), 'run'); initRun(dir, goal); return dir; };

test('initRun lays out a run with its goal node and a first commit', () => {
  const dir = fresh();
  for (const p of ['graph', 'outbox', 'inbox', 'seq']) assert.ok(existsSync(join(dir, p)));
  assert.equal(loadGraph(dir).get('g-1').fm.kind, 'goal');
});

test('initRun refuses a directory that already holds a run', () => {
  const dir = fresh();
  assert.throws(() => initRun(dir, goal), /already/);
});

test('seq counts up from the file and survives a reload', () => {
  const dir = fresh();
  assert.deepEqual([nextSeq(dir), nextSeq(dir)], [2, 3]);
  assert.equal(readFileSync(join(dir, 'seq'), 'utf8').trim(), '3');
});

test('a written node loads back', () => {
  const dir = fresh();
  writeNode(dir, { id: 'q-2', fm: { id: 'q-2', kind: 'question', author: 'a-5', seq: 2, tick: 1, parent: 'g-1' }, title: 'Q', body: '' });
  assert.equal(loadGraph(dir).get('q-2').fm.parent, 'g-1');
});

test('commit returns null when nothing changed', () => {
  const dir = fresh();
  assert.equal(commit(dir, 'nothing'), null);
  writeNode(dir, { id: 'q-2', fm: { id: 'q-2', kind: 'question', author: 'a-5', seq: 2, tick: 1, parent: 'g-1' }, title: 'Q', body: '' });
  assert.ok(commit(dir, 'one question'));
});

test('events append one JSON line each', () => {
  const dir = fresh();
  logEvent(dir, { t: 1, type: 'tool', agent: 'a-5', name: 'look' });
  logEvent(dir, { t: 1, type: 'debit', agent: 'a-5', amount: 200 });
  const lines = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map((l) => l.type), ['tool', 'debit']);
});

test('physics merges the goal settings over the defaults', () => {
  const dir = fresh();
  const raw = readFileSync(join(dir, 'graph', 'g-1.md'), 'utf8').replace('"physics":{}', '"physics":{"upkeep":7}');
  writeFileSync(join(dir, 'graph', 'g-1.md'), raw);
  const p = loadPhysics(dir);
  assert.deepEqual([p.upkeep, p.income_rate], [7, 400]);
});
```

### Step 2: Run to verify they fail
Run: `node --test test/`
Expected: FAIL, modules not found.

### Step 3: Implement the files in Scope

### Step 4: Run to verify they pass
Run: `npm install && node --test test/`
Expected: PASS.

### Step 5: Commit
```bash
git add -A
git commit -m "Scaffold hivemind with its graph store, event log and physics defaults"
```

## Acceptance Criteria
- [ ] `serializeNode` and `parseNode` round-trip fields, objects, booleans, null, title and body (the body without its title line) → test 'a node round-trips through serialize and parse, objects, booleans and null included'
- [ ] A missing required field is a problem → test 'a missing required field is a problem'
- [ ] A ref to a missing node is a problem, and `q-9#relevance` resolves to `q-9` → test 'a ref to a missing node is a problem, and a relevance ref names its question'
- [ ] A value outside its set is a problem → test 'a value outside its set is a problem'
- [ ] A claim with two relations is a problem → test 'a claim with two relations is a problem'
- [ ] `lineageOf` returns the author agent's lineage, `user` for the user, null for an unknown author → test 'lineage comes from the author agent'
- [ ] `rivalEdges` returns both directions for every two answers of a question, sorted, and only that question's when given → test 'rival edges pair every two answers of a question'
- [ ] `initRun` creates `graph/`, `outbox/`, `inbox/`, `seq` and `g-1` → test 'initRun lays out a run with its goal node and a first commit'
- [ ] `initRun` refuses a directory that already holds a run → test 'initRun refuses a directory that already holds a run'
- [ ] `nextSeq` counts up from the file → test 'seq counts up from the file and survives a reload'
- [ ] `writeNode` then `loadGraph` returns the node → test 'a written node loads back'
- [ ] `commit` returns null when clean, a sha when not → test 'commit returns null when nothing changed'
- [ ] `logEvent` appends one JSON line per event → test 'events append one JSON line each'
- [ ] `loadPhysics` deep-merges the goal's overrides → test 'physics merges the goal settings over the defaults'
- [ ] `package.json` pins exactly `@anthropic-ai/claude-agent-sdk` 0.3.317 and `zod` 4.6.7
