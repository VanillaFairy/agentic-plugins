# 2026-09-27-agentics-viewer history

Decisions and closed issues no remaining task depends on, moved out of the checkpoint at the
start of each wave.

## Moved at start of Wave 4
- W2: `knowledge/run-checks-agentics.md` says "branch `design-loop`"; agentics is actually on
  `master` now (4.0.0 shipped 2026-09-27). The command it names is unaffected; only the branch
  note is stale.
- W2 T02a: the RED test-author used a namespace import so 25 tests fail on three distinguishable
  reasons instead of one masked `SyntaxError`; reviewer confirmed this preserves Step 3's intent.
- W2 T02b fix round 1: moved `foldersOf` into `lib/status.mjs` (re-exported into `next.mjs`) and
  restored a split DESIGN.md sentence. Re-review: ADDRESSED.
- W2 T03: `node_modules` doesn't survive a merge; the integration checkout needed its own
  `npm install`. Recorded as `knowledge/viewer-node-modules-after-merge.md`.
- W3: every non-pair task (T04, T05, T06, T08) and both green tasks (T10b) used the plan's
  `tdd`/`pair` Dispatch rows exactly (implement/test-author sonnet, review opus medium, fix sonnet
  medium). All ran to plan with one fix round each except T08 (clean pass) and T10b (clean pass).
- W3 T04 fix round 1: the Important finding (no mutant isolates the leftover-`.tmp` acceptance
  line) was closed by adding one mutant to the probe report; no source or test line changed, so
  the merge carries no new commit over the reviewed head.
- W3 T06 fix round 1: the tie-break test only proved "last in list wins", not "larger name wins".
  One-line fix (a reversed-order assertion). Re-review skipped.
