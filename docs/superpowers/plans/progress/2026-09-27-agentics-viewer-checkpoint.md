Status: NEEDS_INPUT
# 2026-09-27-agentics-viewer checkpoint

Wave: 3 — T04, T05, T06, T07a, T07b, T08, T10a, T10b
Integration head (agentics/master): 48f5b18
Integration head (vanillafairy/claude/agentics-tasks-observability-f37843): 51965ba
Remaining: T07a, T07b, T09, T09m, T11, T12, T13, T14, T15a, T15b

## Tasks
| Task | Wave | Branch | State | Review cycles | Merge commit |
| T02a | 2 | sdd/2026-09-27-agentics-viewer/T02a | merged | 0 | 80f39d2 |
| T02b | 2 | sdd/2026-09-27-agentics-viewer/T02b | merged | 1 | 48f5b18 |
| T03 | 2 | sdd/2026-09-27-agentics-viewer/T03 | merged | 0 | 183f5c0 |
| T04 | 3 | sdd/2026-09-27-agentics-viewer/T04 | merged | 1 | c5ebeec |
| T05 | 3 | sdd/2026-09-27-agentics-viewer/T05 | merged | 1 | d0b347e |
| T06 | 3 | sdd/2026-09-27-agentics-viewer/T06 | merged | 1 | afdf906 |
| T07a | 3 | sdd/2026-09-27-agentics-viewer/T07a | blocked | 0 | |
| T07b | 3 | sdd/2026-09-27-agentics-viewer/T07b | not started | 0 | |
| T08 | 3 | sdd/2026-09-27-agentics-viewer/T08 | merged | 0 | c8451bc |
| T10a | 3 | sdd/2026-09-27-agentics-viewer/T10a | merged | 1 | 4cf5002 |
| T10b | 3 | sdd/2026-09-27-agentics-viewer/T10b | merged | 0 | 51965ba |

`T07a`'s worktree stays at `.worktrees/2026-09-27-agentics-viewer-T07a` (head `7ff73ed`) with its
node_modules junction in place; don't delete it. The next wave-controller resumes it once the
question below is answered.

## Decisions and deviations
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
- W3 T05 fix round 1: `execFile`'s default 1 MiB `maxBuffer` made a large snapshot's stdout
  overflow read as a false "timed out" (Node sets `err.killed` on both timeout and overflow).
  Fixed by raising `maxBuffer` to 64 MiB and telling the two apart by `err.code`. Also closed two
  probe gaps (three acceptance lines had no mutant of their own). 8-line fix, re-review skipped.
- W3 T06 fix round 1: the tie-break test only proved "last in list wins", not "larger name wins".
  One-line fix (a reversed-order assertion). Re-review skipped.
- W3 T10a fix round 1: the depth-first-order test's fixture ids happened to sort lexicographically
  into the same order, so a plain `sort()` would have passed. Added a sibling id (`a-b`) whose
  lexicographic and depth-first positions diverge. 8-line fix, re-review skipped.
- W3 T10b: implementer self-review caught and fixed a `subtreeDone` bug (it counted the target
  node itself as a leaf of its own subtree) and a tile-title bug (raw id instead of short `name`)
  before the tests could catch either — both invisible to the locked tests as written, since the
  fixture's tile nodes are top-level. Worth a look if a later task adds nested tile fixtures.
- W3 T10a/T10b: T10a's report named four ambiguities (tile tie-break on equal seq, a no-match
  `visibleRows` filter, `subtreeDone` on a leaf id, `costText` .5k rounding) that no locked test
  pins either way. T10b's implementer picked a reasonable reading for each (documented in
  T10b-implementer.md) without needing a decision, since nothing enforces one reading over another
  yet. Worth pinning explicitly if T12/T13/T14 turn out to depend on a specific reading.
- W3 T07a is blocked; see Pending questions. Its Critical finding (wrong `tempStore()` root — the
  acceptance puts the store at the temp dir with files under `eff/.state/...`, but the test passed
  `eff/.state` itself as the store) is a plain bug, fixable without a decision. But the reviewer's
  own scratch test on this machine showed that even after that fix, `fs.watch(store, {recursive:
  true})` on Windows fires a `change` event on the bare ancestor directory itself (e.g. `change
  eff\.state`) when a file changes deep inside it — a path with no `context` segment, so
  `isIgnored` (as interfaces.md § Refresh scheduler and store watcher defines it: a segment
  sequence `.state/context/`, or a `.lock` basename) can't filter it out. 'watchStore ignores
  context writes' can't pass on Windows under the contract as written. This reaches into
  shared/interfaces.md, not just T07a's own test file, so it isn't the wave-controller's call.
  T07a's worktree is kept; no fix round was dispatched pending the answer. T07b never started.

## Open issues and escalations
- T07a/T07b: blocked on the pending question below. Nothing else in the wave depends on this
  chain, so T09 (wave 4) should NOT be started until T07b lands, since T09 depends on T07b.

## Pending questions
- T07a: how should `isIgnored`/`watchStore`'s contract treat a bare ancestor-directory `change`
  event (e.g. `change eff\.state`) that Windows' recursive `fs.watch` fires when a file changes
  inside an ignored subtree, given the event's own path carries no `context` or `.lock` segment to
  match against? Candidate directions, none chosen: (a) widen `isIgnored` to also ignore an
  extensionless/directory-only relative path when it is itself `.state` or an ancestor that only
  ever contains ignored content; (b) relax the acceptance to "no event names a non-ignored file"
  (the reviewer's suggestion — checks that `onChange`'s caller sees no *file* path it must react
  to, rather than banning the event outright); (c) something else. Full reproduction and reasoning
  in T07a-review.md (Critical and the "Escalation for the wave-controller" note) and
  T07a-test-author.md. Remove this question once answered and T07a/T07b are re-run.

## Knowledge entries
- viewer-node-modules-after-merge (W2)
- mutation-probe-vite-cache (W3)
