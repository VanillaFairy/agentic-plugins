# Task T04a: Store — tests

rigor: triad
role: red
size: ~22 turns (6 edit sites, 5 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | xhigh | concurrency and git history: a miss corrupts the run's audit trail silently |
| review | opus | medium | |
| fix | sonnet | high | concurrency fixes |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Store and § Store behaviour
- Read: `../shared/architecture.md` § Run directory

## Dependencies
- Depends on: T01
- Depended on by: T04b, T04c

## Scope
**Files:**
- Create: `test/store.test.mjs`
- Create: `test/fixtures/commit-worker.mjs`: a child-process helper that imports `store.mjs` and calls
  `commitFiles(run, agent, message, files)` with its arguments, so a test can run two commits at
  the same moment in two processes.
- Create: `test/fixtures/seq-worker.mjs`: the same for `nextSeq(run)`, printing the number.
- Create: `skills/think-tank/scripts/lib/store.mjs` containing only the exports of
  `shared/interfaces.md` § Store, each throwing `new Error('not implemented')`.

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Each test makes its own run in `mkdtempSync(join(tmpdir(), 'tt-'))` through `init`, with a
  minimal charter `{ title: 't', purpose: 'p', in_scope: [], out_of_scope: [], sources: [] }`.
- Read git history in assertions with `execFileSync('git', ['-C', join(run, 'graph'), ...])`.
- For the concurrency test, start two `commit-worker.mjs` processes with `spawn` before awaiting
  either, each committing a different new file, and assert on the resulting history.

```js
// test/fixtures/commit-worker.mjs
import { commitFiles } from '../../skills/think-tank/scripts/lib/store.mjs';
const [run, agent, message, ...files] = process.argv.slice(2);
console.log(JSON.stringify(commitFiles(run, agent, message, files)));
```

## Negative Constraints (DO NOT)
- Do NOT implement anything in `store.mjs` beyond the throwing stubs.
- Do NOT touch any other file.

## Failure Modes
- Interrupted mid-write, then run again: a writer that crashed leaves `.lock` behind → acceptance line 'a stale lock older than 30 seconds is broken'
- An input deleted, renamed or removed: a node file deleted by its author → acceptance line 'a deleted node is committed as a deletion'
- A value changed: `seq` survives across calls and processes, the file decides → acceptance line 'seq counts up from 1 and survives across calls'
- Every path into a guarded state: the lock is taken by commit, seq and verdict, and released when `fn` throws → acceptance lines 'the lock is released when the work throws' and 'two concurrent commits both land, each with only its own file'
- Run from a linked worktree and from the main checkout: n/a: the store only ever runs git with `-C <run>/graph`, a repository it created
- Each target that already exists: a run directory that already holds a graph → acceptance line 'init refuses a directory that already holds a run'; a file with no changes → acceptance line 'committing an unchanged file returns no commit'

## Implementation Steps

### Step 1: Write the tests, one per acceptance line

### Step 2: Run to verify they fail for the right reason
Run: `node --test test/store.test.mjs`
Expected: every test FAILS with `not implemented`.

### Step 3: Commit
```bash
git add test/store.test.mjs test/fixtures/commit-worker.mjs test/fixtures/seq-worker.mjs skills/think-tank/scripts/lib/store.mjs
git commit -m "Pin the run store's lock, seq and commit behaviour in tests"
```

## Acceptance Criteria
- [ ] `init` creates `procedure/FOUNDATIONS.md`, `procedure/roles/`, `graph/charter.md` with `cap: 6` by default, `seq` holding 0, and one commit by `think-tank` → test 'init lays out a run with its charter and first commit'
- [ ] `init` writes the charter's own `cap` when given → test 'init keeps a charter's cap'
- [ ] `charter.md` holds the title as its heading, the purpose under `## Purpose`, and no links → test 'the charter carries its title and purpose and links nowhere'
- [ ] `init` throws on a directory that already holds a run → test 'init refuses a directory that already holds a run'
- [ ] `nextSeq` returns 1, then 2, and the file holds the last value → test 'seq counts up from 1 and survives across calls'
- [ ] `withLock` returns `fn`'s result and removes `.lock` → test 'the lock is released after the work'
- [ ] `withLock` removes `.lock` when `fn` throws, and rethrows → test 'the lock is released when the work throws'
- [ ] A `.lock` with an mtime over 30 s old is removed and the lock taken → test 'a stale lock older than 30 seconds is broken'
- [ ] Two processes that find the same stale lock both end with their commit landed and only their own file in it → test 'two writers breaking one stale lock never hold it together'
- [ ] A fresh `.lock` held elsewhere makes `withLock` throw `lock busy` after waiting → test 'a held lock makes a second writer wait, then fail with lock busy' (set the fresh lock's mtime to now; the wait is up to 10 s, so mark this test with a 15 s timeout)
- [ ] `commitFiles` commits exactly the listed files with the agent as git author, for an agent id holding `@` such as `save@q-a-1` → test 'a commit holds only the caller's files, authored by the caller'
- [ ] A path that names no file, tracked or untracked, throws naming the path → test 'a path naming no file is refused by name'
- [ ] Another agent's changed file stays uncommitted after `commitFiles` → test 'a commit holds only the caller's files, authored by the caller'
- [ ] A path outside `graph/` throws naming the path and commits nothing → test 'a path outside the graph is refused'
- [ ] A deleted node file is committed as a deletion → test 'a deleted node is committed as a deletion'
- [ ] An unchanged file returns `{ commit: null }` → test 'committing an unchanged file returns no commit'
- [ ] Two processes committing at once both land, each commit holding only its own file → test 'two concurrent commits both land, each with only its own file'
- [ ] `wakesOf` counts commits per agent and leaves out `think-tank` and `user` → test 'wakes are counted per agent'
- [ ] Two processes taking `seq` at once get two different numbers, and the file ends at the larger → test 'two processes never get the same seq'
- [ ] `verdict` writes `v-1` then `v-2` with author `user`, a `seq` and `addresses`, each committed → test 'verdicts are numbered, stamped and committed'
- [ ] No files outside Scope were modified
