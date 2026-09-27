# T07a: Refresh scheduler and store watcher: tests

rigor: pair
role: red
size: ~18 turns (2 edit sites, 5 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | high | timing rules with interleavings; a wrong reading passes its author's own tests |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Refresh scheduler and store watcher and § Clock
- Spec § 6.5

## Dependencies
- Depends on: T03
- Depended on by: T07b

**Files:**
- Create: `agentics-viewer/test/watch.test.ts`

**Scope / Negative Constraints:**
- Tests only. Time comes from `fakeClock()`, never from real timers, except the single
  `watchStore` test, which uses a real temp directory and waits for at most 2 s.
- `run` in the tests is a fake that records calls and returns a promise the test resolves by
  hand, so "in flight" is under the test's control. Flush microtasks with
  `await Promise.resolve()` (twice where needed) after resolving it.
- Assert the scheduler rules numbered in interfaces. Where a rule leaves something open, assert
  the invariant and escalate the question.

**Interfaces:**
- Consumes: `fakeClock` (T03).
- Produces: the locked tests for T07b.

- [ ] **Step 1: Write the tests**, one per acceptance line.

- [ ] **Step 2: Run**: `npx vitest run test/watch.test.ts`. Expected: FAIL, with
  `server/watch.ts` not found.

- [ ] **Step 3: Commit**

```bash
git add agentics-viewer/test/watch.test.ts
git commit -m "test(agentics-viewer): the refresh scheduler's timing rules"
```

## Acceptance
- [ ] One `notify()` runs once, after exactly `quietMs` and not before → test 'a single change runs after the quiet period'
- [ ] Notifies 200 ms apart for 3 s run at least once per `capMs` → test 'a steady stream still runs every second'
- [ ] Two notifies 100 ms apart run once → test 'changes inside the quiet period coalesce'
- [ ] While `run` is in flight, three notifies give exactly one more run after it settles, and
      none before → test 'changes during a run queue exactly one more'
- [ ] A `run` that rejects still lets the queued run happen → test 'a failed run still settles'
- [ ] `setActive(true)` runs every `pollMs` with no notify → test 'active polling runs every five seconds'
- [ ] `setActive(false)` stops polling → test 'inactive stops polling'
- [ ] A poll that comes due while a run is in flight doesn't start a second concurrent run →
      test 'polling respects one run at a time'
- [ ] After `dispose()`, no notify or pending timer runs anything, and `pending()` is 0 → test 'dispose stops everything'
- [ ] `isIgnored` is true for `.state/context/x.md` and `.state\\context\\x.md` → test 'context files are ignored'
- [ ] `isIgnored` is true for `.state/.lock` and `a/.lock` → test 'lock files are ignored'
- [ ] `isIgnored` is false for `.state/events.jsonl` and `a/DESIGN.md` → test 'logs and specs are not ignored'
- [ ] `watchStore` on a temp directory calls `onChange` within 2 s of appending to
      `eff/.state/events.jsonl` → test 'watchStore reports a write'
- [ ] `watchStore` doesn't call `onChange` for a write to `eff/.state/context/c.md` → test 'watchStore ignores context writes'
