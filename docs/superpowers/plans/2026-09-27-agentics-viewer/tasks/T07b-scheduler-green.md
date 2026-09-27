# T07b: Refresh scheduler and store watcher: implementation

rigor: pair
role: green
size: ~16 turns (2 edit sites, 4 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | concurrency between timers and an in-flight promise |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Refresh scheduler and store watcher and § Clock
- Spec § 6.5

## Dependencies
- Depends on: T07a
- Depended on by: T09

**Files:**
- Create: `agentics-viewer/server/watch.ts`

**Scope / Negative Constraints:**
- Do NOT modify `agentics-viewer/test/watch.test.ts`. T07a wrote and locked it. If a test is
  wrong, escalate; never edit it.
- Only the injected `Clock` schedules time. No `setTimeout` or `setInterval` from globals in the
  scheduler. `watchStore` also uses the clock for its fallback poll.
- Model the scheduler's state so a second concurrent run can't be expressed: one field holding
  `idle | waiting | running`, plus one `followUp` flag. No pair of booleans that can disagree.

**Interfaces:**
- Consumes: `Clock` (T03).
- Produces: `createScheduler`, `Scheduler`, `SchedulerOptions`, `isIgnored`, `watchStore`.

- [ ] **Step 1: Read the locked tests**: `npx vitest run test/watch.test.ts`. All fail.
- [ ] **Step 2: Implement `server/watch.ts`** per the numbered rules in interfaces.
- [ ] **Step 3: Run** `npm test`. Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add agentics-viewer/server/watch.ts
git commit -m "feat(agentics-viewer): refresh scheduler and store watcher"
```

## Acceptance
- [ ] Every test in `test/watch.test.ts` passes, unmodified.
- [ ] `npm test` is green.
- [ ] The scheduler's state is one tagged field plus a follow-up flag.
