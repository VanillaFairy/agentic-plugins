Status: ONGOING
# 2026-09-27-agentics-viewer checkpoint

Wave: 5 — T09m, T12, T13, T14, T15a
Integration head (agentics/master): 48f5b18
Integration head (vanillafairy/claude/agentics-tasks-observability-f37843): 5505f21
Remaining: T09m, T12, T13, T14, T15a, T15b

## Tasks
| Task | Wave | Branch | State | Review cycles | Merge commit |
| T02a | 2 | sdd/2026-09-27-agentics-viewer/T02a | merged | 0 | 80f39d2 |
| T02b | 2 | sdd/2026-09-27-agentics-viewer/T02b | merged | 1 | 48f5b18 |
| T03 | 2 | sdd/2026-09-27-agentics-viewer/T03 | merged | 0 | 183f5c0 |
| T04 | 3 | sdd/2026-09-27-agentics-viewer/T04 | merged | 1 | c5ebeec |
| T05 | 3 | sdd/2026-09-27-agentics-viewer/T05 | merged | 1 | d0b347e |
| T06 | 3 | sdd/2026-09-27-agentics-viewer/T06 | merged | 1 | afdf906 |
| T07a | 3 | sdd/2026-09-27-agentics-viewer/T07a | merged | 1 | 445068b |
| T07b | 3 | sdd/2026-09-27-agentics-viewer/T07b | merged | 0 | 465141b |
| T08 | 3 | sdd/2026-09-27-agentics-viewer/T08 | merged | 0 | c8451bc |
| T10a | 3 | sdd/2026-09-27-agentics-viewer/T10a | merged | 1 | 4cf5002 |
| T10b | 3 | sdd/2026-09-27-agentics-viewer/T10b | merged | 0 | 51965ba |
| T09 | 4 | sdd/2026-09-27-agentics-viewer/T09 | merged | 1 | b3b7d2b |
| T11 | 4 | sdd/2026-09-27-agentics-viewer/T11 | merged | 1 | db042e1 |
| T09m | 5 | sdd/2026-09-27-agentics-viewer/T09m | implementing | 0 | |
| T12 | 5 | sdd/2026-09-27-agentics-viewer/T12 | implementing | 0 | |
| T13 | 5 | sdd/2026-09-27-agentics-viewer/T13 | implementing | 0 | |
| T14 | 5 | sdd/2026-09-27-agentics-viewer/T14 | implementing | 0 | |
| T15a | 5 | sdd/2026-09-27-agentics-viewer/T15a | implementing | 0 | |


## Decisions and deviations
(W2 and part of W3 moved to `progress/2026-09-27-agentics-viewer-history.md` at the start of Wave 4 — not depended on by T09, T11, T09m, T12, T13, T14, T15a, T15b)
- W3 T05 fix round 1: `execFile`'s default 1 MiB `maxBuffer` made a large snapshot's stdout
  overflow read as a false "timed out" (Node sets `err.killed` on both timeout and overflow).
  Fixed by raising `maxBuffer` to 64 MiB and telling the two apart by `err.code`. Also closed two
  probe gaps (three acceptance lines had no mutant of their own). 8-line fix, re-review skipped.
  Relevant to T09 (runs `runSnapshot`).
- W4 T09 brief: `assemble-brief` warned the implementer brief is 42554-42925 bytes (task + shared +
  knowledge), over the 40000-byte guide. T09's References section names 7 § sections across two
  shared files plus one `roles:` knowledge file; not trimmed mid-wave per procedure.
- W4 T09 review round 1 (SPEC FAIL): backslash/`%5c`/drive-letter path traversal past `distDir`
  on Windows in static serving; a watcher leaked when a stream opened with no effort selected
  (`disposeFn` was a no-op); the watcher-close call site had no killing mutant; `/api/projects`'s
  test didn't assert `found` and scanned the developer's real `C:\work`; no mutant existed for
  "the viewer writes nothing under .agentics". Fix round 1 (84 lines: `server/app.ts`,
  `test/app.test.ts`, `test/wiring.test.ts`) closed all five — `serveStatic` now resolves and
  requires containment under `resolve(distDir)`; `KeyState` gained an `openCount` so a null-effort
  stream's close also tears down the watcher at 0; a `deps.log` trace on the watcher's onChange
  makes the close call site observable to a new mutant; the projects test seeds a temp fixture
  root and asserts `found`; a new mutant (F6, a second `writeState` under the project's
  `.agentics/`) covers the no-writes line. Scoped re-review: ADDRESSED, 0 open. Merged `b3b7d2b`.
  7 Minor findings from round 1 were left for the plan's final review (T15b).
- W4 T11 review round 1 (SPEC PASS, 1 unverifiable): the wide 3-track grid auto-placed the board
  column into the 250px outline track whenever `<Outline>` wasn't mounted (every pre-snapshot
  state: no-project, `problemText`, `noEffortsText`, loading) — spec §7.4. The probe's 'connection
  state follows the source' mutant covered only the `open` listener, not `error`. Fix round 1
  (6 lines: `styles.css` pins `.board-col`/`.detail` to grid-column 2/3 wide, 1/1 narrow; probe
  mutant M13 added for the `error` listener) closed both; re-review skipped (≤20 lines) per
  procedure, final review covers it. Merged `db042e1`. 7 Minor findings from round 1
  (per-fetch `.catch` handling, a double-connect on the first `efforts` event, a `toEqual` on a
  whole `UrlState`, visible placeholder text in the T12–T14 stubs, a missing "Effort" label, a
  `!important` rule-order workaround, no visible close control on the Open project dialog) were
  left for the plan's final review.
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
- W3 T07a round 1 found a plain bug (wrong `tempStore()` root) and a real contract gap (Windows'
  recursive `fs.watch` can report a change inside an ignored subtree as a bare ancestor-directory
  event with no filename, e.g. `change eff\.state`, which `isIgnored` can't classify). The user
  decided: treat an ambiguous/unresolvable event as real (call `onChange`), never suppress it — a
  spurious `onChange` costs one dropped snapshot call, suppressing risks missing a real log write.
  `shared/interfaces.md` § Refresh scheduler and store watcher now states this explicitly
  (commit `119c595`); `isIgnored` is not widened to bare directory names. T07a is being re-run
  with a fresh test-author to fix the store-root bug and correct the 'watchStore ignores context
  writes' acceptance to this contract. Review round 2 found one further Critical: `watchStore`'s
  `onChange` takes no path argument, so a real-fs test of that acceptance line can never
  distinguish the (ignored, correct) resolved context event from the (not-ignored, correct per
  the Decided paragraph) bare-ancestor event that fires alongside it on Windows — the line is
  unsatisfiable as a `watchStore`-level integration test. Fix round 1 (18 lines, re-review
  skipped) repointed 'watchStore ignores context writes' at `isIgnored` directly, asserting the
  fully-resolved `eff/.state/context/c.md` shape is ignored, without exercising real `fs.watch`.
  Merged as `445068b`.

## Open issues and escalations
- (none open)

## Knowledge entries
- viewer-node-modules-after-merge (W2)
- mutation-probe-vite-cache (W3)
