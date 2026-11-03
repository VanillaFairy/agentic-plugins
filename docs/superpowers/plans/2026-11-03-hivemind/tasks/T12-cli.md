# Task T12: The CLI

rigor: tdd
size: ~26 turns (3 edit sites, 11 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Graph and § Dung and harvest and § Outbox, inbox, status and § Runner and scheduler
- Read: `../shared/architecture.md` § Run directory

## Dependencies
- Depends on: T03b, T10, T11
- Depended on by: T13

## Scope
**Files:**
- Create: `src/cli.mjs` (with `#!/usr/bin/env node`), `test/cli.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
Commands, each printing one JSON object and exiting 0, or the error on stderr and exit 1:

| Command | Does |
|---|---|
| `hive init <dir> --charter <file.json>` | `initRun` from `{ purpose, scope, sources, supply? }`; supply defaults to the latest `next_default` in `~/.hivemind/budget.jsonl`, else `physics.supply` |
| `hive run <dir>` | `runHive` with the SDK runner; prints `{ reason }` |
| `hive sim <dir> [--seed n]` | `runHive` with the sim runner; prints `{ reason, ticks, agents, spent }` |
| `hive status <dir>` | prints the status line parsed into an object |
| `hive verdict <dir> --text <t> --addresses <ids> [--pins id=1,id=0]` | writes the next inbox file |
| `hive feed <dir> --amount <n>` | writes a feed inbox file (negative cuts) |
| `hive stop <dir>` | writes a stop inbox file |
| `hive report <dir> [--sim]` | builds `skeleton` and returns `{ text }` from `runner.report` (sim: the skeleton as text) |
| `hive rate <dir> --rating too_expensive\|about_right\|more` | appends `{ run, spent, supply, rating, next_default }` to `~/.hivemind/budget.jsonl`, `next_default = supply × 0.67 \| 1 \| 1.5` |

`~/.hivemind` resolves from `HIVEMIND_HOME` when set (tests set it to a temp dir).

- Inbox files are named `<13-digit epoch ms>-<4-digit counter>.json` (`interfaces.md` § Outbox,
  inbox, status): the counter goes up within one millisecond, so names are unique and ordered no
  matter which files the scheduler has already deleted.
- `report` builds its input with `reportInput(graph, strengths, physics, books)` from
  `src/harvest.mjs`, with `books` read from a `Hive.open(dir)` ledger, so the report carries the
  rulings and the spend.

## Failure Modes
- Interrupted mid-write, then run again: an inbox file is written whole with `writeFileSync` under a fresh name → acceptance line 'verdict, feed and stop write ordered inbox files'
- An input deleted, renamed or removed: inbox files already consumed and deleted by the scheduler → acceptance line 'new inbox files sort after consumed ones'
- A value changed: a rating changes the next default; the latest line decides → acceptance line 'a rating sets the next run's default supply'
- Every path into a guarded state: n/a: the CLI writes no guarded state; the scheduler applies the inbox
- Run from a linked worktree and from the main checkout: n/a: the CLI reads only the run directory and `HIVEMIND_HOME`
- Each target that already exists: `init` on an existing run → acceptance line 'init refuses an existing run'

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../src/cli.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const home = mkdtempSync(join(tmpdir(), 'hive-home-'));
const hive = (...args) => JSON.parse(execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, HIVEMIND_HOME: home } }));
const charter = (extra = {}) => { const f = join(mkdtempSync(join(tmpdir(), 'hive-c-')), 'c.json'); writeFileSync(f, JSON.stringify({ purpose: 'p', scope: 's', sources: [], ...extra })); return f; };
const newRun = (extra) => { const dir = join(mkdtempSync(join(tmpdir(), 'hive-')), 'run'); hive('init', dir, '--charter', charter(extra)); return dir; };

test('init uses the physics default supply when nothing was rated', () => {
  const dir = newRun();
  assert.match(readFileSync(join(dir, 'graph', 'g-1.md'), 'utf8'), /supply: 1000000/);
});

test('init refuses an existing run', () => {
  const dir = newRun();
  const r = spawnSync(process.execPath, [CLI, 'init', dir, '--charter', charter()], { encoding: 'utf8', env: { ...process.env, HIVEMIND_HOME: home } });
  assert.equal(r.status, 1);
});

test('new inbox files sort after consumed ones', () => {
  const dir = newRun();
  hive('feed', dir, '--amount', '5');
  const first = readdirSync(join(dir, 'inbox'))[0];
  rmSync(join(dir, 'inbox', first));
  hive('feed', dir, '--amount', '6');
  const second = readdirSync(join(dir, 'inbox'))[0];
  assert.ok(second > first);
});

test('verdict, feed and stop write ordered inbox files', () => {
  const dir = newRun();
  hive('verdict', dir, '--text', 'by reading', '--addresses', 'k-4', '--pins', 'c-5=1,c-6=0');
  hive('feed', dir, '--amount', '-1000');
  hive('stop', dir);
  const files = readdirSync(join(dir, 'inbox')).sort();
  const docs = files.map((f) => JSON.parse(readFileSync(join(dir, 'inbox', f), 'utf8')));
  assert.deepEqual(docs.map((d) => d.type), ['verdict', 'feed', 'stop']);
  assert.deepEqual(docs[0].pins, [{ id: 'c-5', value: 1 }, { id: 'c-6', value: 0 }]);
});

test('sim runs a hive to its end and status reads back', () => {
  const dir = newRun({ supply: 200000 });
  const out = hive('sim', dir, '--seed', '5');
  assert.ok(['quiet', 'spent'].includes(out.reason));
  assert.equal(typeof hive('status', dir).tick, 'number');
});

test('a rating sets the next run's default supply', () => {
  const dir = newRun();
  hive('rate', dir, '--rating', 'more');
  const next = newRun();
  assert.match(readFileSync(join(next, 'graph', 'g-1.md'), 'utf8'), /supply: 1500000/);
});

test('report --sim returns the skeleton as text', () => {
  const dir = newRun({ supply: 200000 });
  hive('sim', dir, '--seed', '5');
  assert.match(hive('report', dir, '--sim').text, /spend/i);
});

test('a bad command exits 1 with a message', () => {
  const r = spawnSync(process.execPath, [CLI, 'nope'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.notEqual(r.stderr.trim(), '');
});
```

### Step 2: Run `node --test test/cli.test.mjs` — Expected: FAIL, module not found
### Step 3: Implement `src/cli.mjs`
### Step 4: Run `node --test test/` — Expected: PASS
### Step 5: Commit
```bash
git add src/cli.mjs test/cli.test.mjs
git commit -m "Add the hive CLI: init, run, sim, status, verdicts, food, stop, report, rating"
```

## Acceptance Criteria
- [ ] `init` defaults the supply to physics when no rating exists → test 'init uses the physics default supply when nothing was rated'
- [ ] `init` refuses an existing run → test 'init refuses an existing run'
- [ ] Inbox names keep sorting after files the scheduler deleted → test 'new inbox files sort after consumed ones'
- [ ] `verdict`, `feed` and `stop` write ordered inbox files, with pins parsed → test 'verdict, feed and stop write ordered inbox files'
- [ ] `sim` runs to an end and `status` parses the status line → test 'sim runs a hive to its end and status reads back'
- [ ] `rate more` makes the next `init` default to supply × 1.5 → test 'a rating sets the next run's default supply'
- [ ] `report --sim` returns the report input as text, including a "spend" section → test 'report --sim returns the skeleton as text'
- [ ] An unknown command exits 1 with a message → test 'a bad command exits 1 with a message'
- [ ] No files outside Scope were modified
