Status: DONE
# 2026-09-27-agentics-viewer checkpoint

Wave: 2 — T02a, T02b, T03
Integration head (agentics/master): 48f5b18
Integration head (vanillafairy/claude/agentics-tasks-observability-f37843): 183f5c0
Remaining: T04, T05, T06, T07a, T07b, T08, T09, T09m, T10a, T10b, T11, T12, T13, T14, T15a, T15b

## Tasks
| Task | Wave | Branch | State | Review cycles | Merge commit |
| T02a | 2 | sdd/2026-09-27-agentics-viewer/T02a | merged | 0 | 80f39d2 |
| T02b | 2 | sdd/2026-09-27-agentics-viewer/T02b | merged | 1 | 48f5b18 |
| T03 | 2 | sdd/2026-09-27-agentics-viewer/T03 | merged | 0 | 183f5c0 |

## Decisions and deviations
- W2: `knowledge/run-checks-agentics.md` says "branch `design-loop`"; agentics is actually on
  `master` now (4.0.0 shipped 2026-09-27, plan.md Global Constraints confirm). The command it
  names (`node tools/lint.mjs && node --test`) is unaffected; only the branch note is stale.
- W2 T02a: the RED test-author used a namespace import (`import * as statusModule`) rather than a
  named `snapshotOf` import, so the 25 tests fail on three distinguishable reasons in one run
  instead of one module-load `SyntaxError` masking all of them. The task's Step 3 names the exact
  error text a named import would produce; reviewer confirmed this deviation preserves the step's
  intent and does not affect T02b or later tasks.
- W2 T02a review left 4 minor test-hardening findings unfixed (JSON round-trip comparison at
  test/snapshot.test.mjs:482 could reject a correct T02b; a missing-branch fixture that's actually
  "not a git repo"; two fixture-reachability guards; two loose `typeof` checks on event.seq). None
  blocked T02b, which passed against the tests as committed. Worth a look if a later task touches
  `test/snapshot.test.mjs`'s neighbourhood, but nobody may edit that file now that it's merged and
  locked history.
- W2 T02b fix round 1 addressed both Important findings: moved `foldersOf` out of `lib/next.mjs`
  into `lib/status.mjs` (re-exported into `next.mjs`, no import cycle) instead of duplicating the
  walk, and restored the DESIGN.md "Why a flag" sentence that the Progress paragraph had split in
  two. Re-review: ADDRESSED, no new issues.
- W2 T03: two commits landed for one task (scaffold + a mutation-probe-motivated rename inside
  `fake-clock.ts`'s `advance()`). Reviewer flagged as minor/cosmetic and did not require a fix;
  merged as-is under one `--no-ff` merge commit.
- W2 T03: `node_modules` does not survive a merge (gitignored). The integration checkout's
  `agentics-viewer/` needed its own `npm install` after T03 merged, before the suite could run.
  Recorded as knowledge/viewer-node-modules-after-merge.md (roles: implementer, test-author,
  auditor, reviewer) so later waves don't repeat T03's worktree-vs-integration-checkout mismatch.

## Open issues and escalations
(none)

## Pending questions
(none)

## Knowledge entries
- viewer-node-modules-after-merge (W2)
