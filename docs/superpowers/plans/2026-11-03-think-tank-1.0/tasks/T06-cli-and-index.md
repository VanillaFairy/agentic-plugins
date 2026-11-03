# Task T06: CLI and index

rigor: tdd
size: ~33 turns (6 edit sites, 12 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | wiring against fixed interfaces, code given below |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § CLI and § Nodes and § Topic graph and § Closing rules and § Problems and coverage and § Store
- Read: `../shared/architecture.md` § Module boundaries and § Run directory

## Dependencies
- Depends on: T02b, T03b, T04c, T05
- Depended on by: T08

## Scope
**Files:**
- Rewrite: `skills/think-tank/scripts/tt.mjs`
- Create: `skills/think-tank/scripts/lib/index-file.mjs`
- Create: `test/cli.test.mjs`
- Delete: `test/tt.test.mjs` (every test in it covers 0.2.1 commands that this task removes; the
  junction test moves to `cli.test.mjs`)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `tt.mjs` is the CLI only: argument parsing, calls into `lib/`, JSON out. Keep the junction-safe
  main guard (`realpathSync` on both sides) exactly as in 0.2.1.
- `writeIndex(run, nodes)` in `lib/index-file.mjs` writes `<run>/index.md`:
  - a header `# Index` and the line ``Every node, one line each. Written by `tt.mjs`; don't edit.``
  - one `## <title>` section per root topic (`root: true`), roots ordered by id;
  - under each topic, indented two spaces per level: its proposals, under each proposal the claims
    on it (claims on claims nested further), then its positions, cruxes and ballots, then each topic
    it needs (via `needsOf`), recursively;
  - a topic already printed in this file prints once more as one line ending ` (see above)` and is
    not expanded again;
  - an `## Elsewhere` section for every node not printed yet, except `charter`;
  - each line: ``- `<id>` <role> · <status or stance or state> · <author> · [<title>](graph/<id>.md)``.
- `commit` calls `commitFiles`, then rewrites the index from a fresh `loadGraph`.

```js
#!/usr/bin/env node
// think-tank run tool: sets up a run, checks topics and the topic graph, commits under a lock.
// It reports and never decides: judgment belongs to the roles.
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGraph, topicOf } from './lib/nodes.mjs';
import { blockedBy, needersOf, graphReport } from './lib/topics.mjs';
import { topicRules } from './lib/rules.mjs';
import { nodeProblems, cardCoverage, castCoverage } from './lib/problems.mjs';
import { init, nextSeq, commitFiles, wakesOf, verdict } from './lib/store.mjs';
import { writeIndex } from './lib/index-file.mjs';

function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function positional(argv) {
  const out = [];
  for (let i = 2; i < argv.length; i++) { if (argv[i].startsWith('--')) i++; else out.push(argv[i]); }
  return out;
}

const need = (v, name) => { if (v === undefined || v === '') throw new Error(`missing --${name}`); return v; };

export function main(argv) {
  const [cmd, run] = argv;
  if (!cmd || !run) throw new Error('usage: tt.mjs <init|seq|commit|check|graph|verdict> <run-dir> [options]');
  switch (cmd) {
    case 'init': return init(run, JSON.parse(readFileSync(need(arg(argv, 'charter'), 'charter'), 'utf8')));
    case 'seq': return { seq: nextSeq(run) };
    case 'commit': {
      const files = positional(argv);
      if (!files.length) throw new Error('commit needs at least one file');
      const result = commitFiles(run, need(arg(argv, 'as'), 'as'), need(arg(argv, 'message'), 'message'), files);
      writeIndex(run, loadGraph(run));
      return result;
    }
    case 'check': {
      const topic = need(arg(argv, 'topic'), 'topic');
      const nodes = loadGraph(run);
      if (nodes.get(topic)?.fm.role !== 'topic') throw new Error(`no topic ${topic}`);
      const cap = Number(nodes.get('charter')?.fm.cap ?? 6);
      return {
        topic,
        rules: topicRules(nodes, topic, { cap, wakes: wakesOf(run), since: Number(arg(argv, 'since') ?? 0) }),
        coverage: castCoverage(nodes, topic),
        problems: nodeProblems(nodes).filter((p) => topicOf(nodes, p.node) === topic),
        blocked_by: blockedBy(nodes, topic),
        needers: needersOf(nodes, topic),
      };
    }
    case 'graph': {
      const nodes = loadGraph(run);
      return { ...graphReport(nodes), problems: nodeProblems(nodes), cards: cardCoverage(nodes) };
    }
    case 'verdict': {
      const result = verdict(run, need(arg(argv, 'text'), 'text'), (arg(argv, 'addresses') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
      writeIndex(run, loadGraph(run));
      return result;
    }
    default: throw new Error(`unknown command ${cmd}`);
  }
}

// import.meta.url is already resolved through junctions and symlinks; argv[1] is not.
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)).toLowerCase() === realpathSync(process.argv[1]).toLowerCase()) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 1)); }
  catch (e) { console.error(e.message); process.exit(1); }
}
```

## Negative Constraints (DO NOT)
- Do NOT keep `next`, `map.md`, `agenda/`, `check.json`, `curate` or any round logic.
- Do NOT put graph, rule or store logic in `tt.mjs`; it calls `lib/`.
- Do NOT edit any `lib/` module other than `index-file.mjs`.

## Failure Modes
- Interrupted mid-write, then run again: `index.md` is rewritten whole from the graph on every commit, so a torn index heals on the next commit; the commit itself is T04's → n/a: no state of its own beyond the derived index
- An input deleted, renamed or removed: a topic named in `needs` that no longer exists → acceptance line 'graph reports cycles, problems and card coverage, and done' (its `problems` list carries the missing-node problem from T05)
- A value changed: the charter's `cap` decides, read on every `check` → acceptance line 'check counts wakes from commits and applies the charter cap'
- Every path into a guarded state: `commit` and `verdict` both rewrite the index → acceptance lines 'commit records the files and rewrites the index under the root topic' and 'a verdict is written, committed and closes the escalation it addresses'
- Run from a linked worktree and from the main checkout: n/a: the CLI reads only the run directory it is given
- Each target that already exists: `init` on an existing run is T04's 'init refuses a directory that already holds a run'; an unknown topic for `check` → acceptance line 'a bad command, a missing option and an unknown topic exit 1 with a message'

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '../skills/think-tank/scripts');
const tt = (...args) => JSON.parse(execFileSync(process.execPath, [join(SCRIPTS, 'tt.mjs'), ...args], { encoding: 'utf8' }));
const charter = (extra = {}) => {
  const file = join(mkdtempSync(join(tmpdir(), 'tt-charter-')), 'c.json');
  writeFileSync(file, JSON.stringify({ title: 'Plan', purpose: 'p', in_scope: [], out_of_scope: [], sources: [], ...extra }));
  return file;
};
const newRun = (extra) => { const run = join(mkdtempSync(join(tmpdir(), 'tt-')), 'run'); tt('init', run, '--charter', charter(extra)); return run; };
const node = (run, id, fm, body = '') => writeFileSync(join(run, 'graph', `${id}.md`),
  ['---', `id: ${id}`, ...Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', `# ${id}`, '', body, ''].join('\n'));

test('the CLI runs when its directory is reached through a junction or symlink', () => {
  const link = join(mkdtempSync(join(tmpdir(), 'tt-link-')), 'scripts');
  symlinkSync(SCRIPTS, link, 'junction');
  const run = join(mkdtempSync(join(tmpdir(), 'tt-')), 'run');
  const out = execFileSync(process.execPath, [join(link, 'tt.mjs'), 'init', run, '--charter', charter()], { encoding: 'utf8' });
  assert.equal(JSON.parse(out).run, run);
});

test('seq hands out increasing numbers', () => {
  const run = newRun();
  assert.deepEqual([tt('seq', run).seq, tt('seq', run).seq], [1, 2]);
});

test('commit records the files and rewrites the index under the root topic', () => {
  const run = newRun();
  node(run, 'q-composer-1', { role: 'topic', root: true, facet: 'x', status: 'open', author: 'composer', seq: 1 });
  node(run, 'p-save-1', { role: 'proposal', answers: 'q-composer-1', author: 'save@q-composer-1', seq: 2 });
  assert.ok(tt('commit', run, '--as', 'composer', '--message', 'roots', 'q-composer-1.md', 'p-save-1.md').commit);
  const index = readFileSync(join(run, 'index.md'), 'utf8');
  assert.match(index, /## q-composer-1/);
  assert.match(index, /^ {2}- `p-save-1` proposal/m);
});

test('a topic needed by two roots is expanded once and referenced after that', () => {
  const run = newRun();
  node(run, 'q-composer-1', { role: 'topic', root: true, facet: 'x', status: 'blocked', needs: ['q-reg-1'] });
  node(run, 'q-composer-2', { role: 'topic', root: true, facet: 'x', status: 'blocked', needs: ['q-reg-1'] });
  node(run, 'q-reg-1', { role: 'topic', facet: 'x', status: 'open' });
  tt('commit', run, '--as', 'registrar', '--message', 'shared', 'q-composer-1.md', 'q-composer-2.md', 'q-reg-1.md');
  const index = readFileSync(join(run, 'index.md'), 'utf8');
  assert.equal(index.match(/`q-reg-1`/g).length, 2);
  assert.match(index, /`q-reg-1`.*\(see above\)/);
});

test('the index nests claims and positions, orders roots by id, and lists the rest under Elsewhere', () => {
  const run = newRun();
  node(run, 'q-composer-9', { role: 'topic', root: true, facet: 'x', status: 'open', author: 'composer' });
  node(run, 'q-composer-2', { role: 'topic', root: true, facet: 'x', status: 'open', author: 'composer' });
  node(run, 'p-save-3', { role: 'proposal', answers: 'q-composer-2', author: 'save@q-composer-2' });
  node(run, 'c-quest-4', { role: 'claim', target: 'p-save-3', stance: 'con', provenance: 'I', author: 'quest@q-composer-2' });
  node(run, 'pos-save-q-composer-2', { role: 'position', topic: 'q-composer-2', state: 'arguing', author: 'save@q-composer-2' });
  node(run, 'e-save', { role: 'expert', lens: 'l', facets: ['x'], biases: ['b'], checks: [] });
  tt('commit', run, '--as', 'composer', '--message', 'all', 'q-composer-9.md', 'q-composer-2.md', 'p-save-3.md', 'c-quest-4.md', 'pos-save-q-composer-2.md', 'e-save.md');
  const index = readFileSync(join(run, 'index.md'), 'utf8');
  assert.ok(index.indexOf('## q-composer-2') < index.indexOf('## q-composer-9'));
  assert.match(index, /^ {2}- `p-save-3` proposal/m);
  assert.match(index, /^ {4}- `c-quest-4` claim · con · quest@q-composer-2 · \[c-quest-4\]\(graph\/c-quest-4\.md\)$/m);
  assert.match(index, /^ {2}- `pos-save-q-composer-2` position · arguing/m);
  assert.ok(index.indexOf('## Elsewhere') < index.indexOf('`e-save`'));
  assert.doesNotMatch(index, /`charter`/);
});

test('check reports a topic's rules, blockers, needers, coverage and problems', () => {
  const run = newRun({ cap: 3 });
  node(run, 'q-composer-1', { role: 'topic', root: true, facet: 'x', status: 'blocked', needs: ['q-reg-1'] });
  node(run, 'q-reg-1', { role: 'topic', facet: 'x', status: 'open' });
  const out = tt('check', run, '--topic', 'q-composer-1');
  assert.deepEqual(Object.keys(out).sort(), ['blocked_by', 'coverage', 'needers', 'problems', 'rules', 'topic']);
  assert.deepEqual(out.blocked_by, ['q-reg-1']);
  assert.deepEqual(tt('check', run, '--topic', 'q-reg-1').needers, ['q-composer-1']);
  assert.equal(out.rules.outcome, null);
});

test('check counts wakes from commits and applies the charter cap', () => {
  const run = newRun({ cap: 2 });
  node(run, 'q-composer-1', { role: 'topic', root: true, facet: 'x', status: 'open' });
  node(run, 'pos-save-q-composer-1', { role: 'position', topic: 'q-composer-1', state: 'arguing', author: 'save@q-composer-1' });
  tt('commit', run, '--as', 'save@q-composer-1', '--message', 'one', 'pos-save-q-composer-1.md');
  node(run, 'pos-save-q-composer-1', { role: 'position', topic: 'q-composer-1', state: 'holding', author: 'save@q-composer-1' });
  tt('commit', run, '--as', 'save@q-composer-1', '--message', 'two', 'pos-save-q-composer-1.md');
  assert.deepEqual(tt('check', run, '--topic', 'q-composer-1').rules.capped, ['save@q-composer-1']);
});

test('graph reports cycles, problems and card coverage, and done', () => {
  const run = newRun();
  node(run, 'q-composer-1', { role: 'topic', root: true, facet: 'x', status: 'open', needs: ['q-reg-1'] });
  node(run, 'q-reg-1', { role: 'topic', facet: 'x', status: 'open', needs: ['q-composer-1'] });
  const out = tt('graph', run);
  assert.deepEqual(out.cycles, [['q-composer-1', 'q-reg-1']]);
  assert.equal(out.done, false);
  assert.ok(Array.isArray(out.problems));
  assert.equal(typeof out.cards.ok, 'boolean');
});

test('a verdict is written, committed and closes the escalation it addresses', () => {
  const run = newRun();
  node(run, 'q-composer-1', { role: 'topic', root: true, facet: 'x', status: 'open', escalation: 'Free or by reading?' });
  assert.equal(tt('graph', run).escalations.length, 1);
  assert.equal(tt('verdict', run, '--text', 'by reading', '--addresses', 'q-composer-1').id, 'v-1');
  assert.equal(tt('graph', run).escalations.length, 0);
});

test('a bad command, a missing option and an unknown topic exit 1 with a message', () => {
  const run = newRun();
  for (const args of [['nope', run], ['commit', run, '--as', 'a', 'x.md'], ['check', run, '--topic', 'q-none-1']]) {
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'tt.mjs'), ...args], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.notEqual(r.stderr.trim(), '');
  }
});
```

### Step 2: Run to verify they fail
Run: `node --test test/cli.test.mjs`
Expected: FAIL, the old CLI has no `seq` or `graph` and its `commit` takes `--stage`.

### Step 3: Implement
Write `lib/index-file.mjs`, rewrite `tt.mjs` as above, delete `test/tt.test.mjs`.

### Step 4: Run to verify they pass
Run: `node --test test/`
Expected: PASS, the whole suite.

### Step 5: Commit
```bash
git add -A skills/think-tank/scripts/tt.mjs skills/think-tank/scripts/lib/index-file.mjs test/cli.test.mjs test/tt.test.mjs
git commit -m "Replace the round CLI with seq, commit, check --topic and graph"
```

## Acceptance Criteria
- [ ] The CLI runs through a junction → test 'the CLI runs when its directory is reached through a junction or symlink'
- [ ] `seq` prints increasing numbers → test 'seq hands out increasing numbers'
- [ ] `commit` commits and rewrites `index.md` with nodes nested under their root topic → test 'commit records the files and rewrites the index under the root topic'
- [ ] A shared subtopic prints once in full and then as `(see above)` → test 'a topic needed by two roots is expanded once and referenced after that'
- [ ] Root sections are ordered by id → test 'the index nests claims and positions, orders roots by id, and lists the rest under Elsewhere'
- [ ] A claim nests under the proposal it targets, one level deeper → test 'the index nests claims and positions, orders roots by id, and lists the rest under Elsewhere'
- [ ] A position nests under its topic → test 'the index nests claims and positions, orders roots by id, and lists the rest under Elsewhere'
- [ ] Each line has the form `` - `<id>` <role> · <status or stance or state> · <author> · [<title>](graph/<id>.md) `` → test 'the index nests claims and positions, orders roots by id, and lists the rest under Elsewhere'
- [ ] Every node not under a root, except `charter`, is listed under `## Elsewhere` → test 'the index nests claims and positions, orders roots by id, and lists the rest under Elsewhere'
- [ ] `check --topic` prints exactly `topic`, `rules`, `coverage`, `problems`, `blocked_by`, `needers` → test 'check reports a topic's rules, blockers, needers, coverage and problems'
- [ ] `check` takes `cap` from the charter and `wakes` from git → test 'check counts wakes from commits and applies the charter cap'
- [ ] `graph` prints the graph report plus `problems` and `cards` → test 'graph reports cycles, problems and card coverage, and done'
- [ ] `verdict` writes `v-1` and closes the escalation → test 'a verdict is written, committed and closes the escalation it addresses'
- [ ] An unknown command, a missing `--message` and an unknown topic exit 1 with a stderr message → test 'a bad command, a missing option and an unknown topic exit 1 with a message'
- [ ] `test/tt.test.mjs` is gone and no round logic remains in `tt.mjs`
- [ ] No files outside Scope were modified
