# Task T04b: Store — implementation

rigor: triad
role: green
size: ~19 turns (2 edit sites, 7 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | xhigh | concurrency and git history: a miss corrupts the audit trail silently |
| review | opus | medium | |
| fix | sonnet | high | concurrency fixes |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Store and § Store behaviour
- Read: `../shared/architecture.md` § Run directory

## Dependencies
- Depends on: T04a
- Depended on by: T04c

## Scope
**Files:**
- Modify: `skills/think-tank/scripts/lib/store.mjs` (replace the stubs)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Implement every export exactly as `shared/interfaces.md` § Store behaviour states.
- Keep two layers: unlocked helpers (`seqUnlocked`, `commitUnlocked`) that assume the lock is
  held, and the exported functions, which wrap them in `withLock`. `verdict` takes the lock once and
  calls only unlocked helpers inside it.
- Copy the procedure in `init` from the skill directory:
  `const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');`
  (this file sits in `scripts/lib/`).
- Run git with `execFileSync('git', ['-C', join(run, 'graph'), '-c', 'user.name=think-tank',
  '-c', 'user.email=think-tank@localhost', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })`.
- Detect "nothing to commit" by running `git diff --cached --quiet -- <files>` after `git add`
  (exit code 0 means no changes), not by parsing commit output.

```js
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const age = (p) => { try { return Date.now() - statSync(p).mtimeMs; } catch { return -1; } };

// Only the holder of the break token removes a stale lock, and it re-checks the age first,
// so a waiter that saw an old lock can never remove a fresh one taken since.
function breakIfStale(lock) {
  if (age(lock) <= 30_000) return false;
  const token = `${lock}.break`;
  if (age(token) > 30_000) rmSync(token, { recursive: true, force: true });
  try { mkdirSync(token); } catch { return false; }
  try { if (age(lock) > 30_000) rmSync(lock, { recursive: true, force: true }); }
  finally { rmSync(token, { recursive: true, force: true }); }
  return true;
}

export function withLock(run, fn) {
  const lock = join(run, '.lock');
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (breakIfStale(lock)) continue;
      if (Date.now() > deadline) throw new Error(`lock busy: ${lock}`);
      sleep(50);
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}
```

## Negative Constraints (DO NOT)
- Do NOT modify `test/store.test.mjs`, `test/fixtures/commit-worker.mjs` or
  `test/fixtures/seq-worker.mjs`: authored by T04a and locked. If a test is wrong, escalate; never edit it.
- Do NOT call `withLock` from inside code that already holds the lock.
- Do NOT `rmSync` the path `<run>/.lock` anywhere except the holder's own `finally` and
  `breakIfStale` while it holds the break token.
- Do NOT use `git add -A` without a pathspec, or `git commit` without `--only -- <files>`.

## Implementation Steps

### Step 1: Read the locked tests
Read `test/store.test.mjs` and both files in `test/fixtures/` in full.

### Step 2: Implement `store.mjs`

### Step 3: Run to verify they pass
Run: `node --test test/`
Expected: PASS, the whole suite.

### Step 4: Commit
```bash
git add skills/think-tank/scripts/lib/store.mjs
git commit -m "Let agents commit to the run at the same time under one lock"
```

## Acceptance Criteria
- [ ] Every test in `test/store.test.mjs` passes, unmodified
- [ ] The full suite is green
- [ ] No files outside Scope were modified
