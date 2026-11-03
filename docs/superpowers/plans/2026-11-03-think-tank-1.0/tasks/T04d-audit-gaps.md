# Task T04d: T04 audit gaps

rigor: tdd
gap: audit
size: ~14 turns (2 edit sites, 2 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | xhigh | commit scoping in the run's git history: a miss leaks other agents' changes silently |
| review | opus | medium | |
| fix | sonnet | high | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Store behaviour (the commitFiles bullet)
- Read: `../shared/conventions.md`
- Code: `skills/think-tank/scripts/lib/store.mjs` — `commitFiles`, `commitUnlocked`, `insideGraph`
- Tests: `test/store.test.mjs` — reuse its helpers (`newRun`, `writeNode`, `track`, `git`, `head`, `commitCount`, `filesOf`, `trackedFiles`, `thrownNaming`)

## Dependencies
- Depends on: T04b
- Depended on by: none

## Scope
**Files:**
- Modify: `test/store.test.mjs` (add tests; do not change or remove any existing test)
- Modify: `skills/think-tank/scripts/lib/store.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Decisions
- D1: Does `commitFiles` refuse a path that names a directory? `fix`: yes, it throws naming the path and commits nothing (a directory "names no file", and a directory pathspec sweeps other agents' files). `accept`: a directory is a valid pathspec and everything under it is committed.
- D2: Is a tracked file whose deletion is already staged (`git rm`, file gone from disk and index, still in HEAD) committed as a deletion? `fix`: yes, it is tracked in HEAD, so `commitFiles` commits its deletion. `accept`: it is refused as naming no file.

## Steps

### Step 1: Write the tests, one per acceptance line below, and run them
`node --test test/store.test.mjs`. G1 and G2 tests pass on the current head; G3 and G4 tests fail on it.

### Step 2: Fix store.mjs until G3 and G4 pass
Keep the two-layer shape (exported functions lock, `*Unlocked` helpers do not). Path checks that need no git stay before the lock.

### Step 3: Probe
One mutant per acceptance line, each at a single site, with `"expect"` naming that line's test.

### Step 4: Run the suite
`node --test test/store.test.mjs` green. `node --test test/` may still show `test/rules.test.mjs` failures if T03b has not merged; no other file may fail.

### Step 5: Commit
One commit, both files.

## Acceptance

G1 (passes-today): an empty file list commits nothing
- [ ] With another agent's staged new file and another agent's unstaged edit present, `commitFiles(run, agent, msg, [])` leaves HEAD and the commit count unchanged.
- [ ] After that call, neither of the other agent's files is in HEAD's tree.
- [ ] Whether the call throws or returns `{ commit: null }` is not asserted (the spec leaves it open); only that nothing is committed and the lock is not left behind.
- [ ] A mutant removing the empty-list guard in `commitFiles` is killed by this test.

G2 (passes-today): a path resolving to the graph directory itself is refused
- [ ] `commitFiles` with `.` throws naming `.`, with HEAD unchanged while another agent's changed file is present.
- [ ] `commitFiles` with `sub/..` throws naming `sub/..`, with HEAD unchanged.
- [ ] A mutant dropping the `rel === ''` condition in `insideGraph` is killed by this test.

G3 (fails-today): a directory path does not commit other agents' files
- [ ] [D1] With `graph/sub/mine.md` and `graph/sub/theirs.md` both new, `commitFiles(run, agent, msg, ['sub'])` throws naming `sub`.
- [ ] [D1] After that call HEAD is unchanged and neither file under `sub/` is tracked.
- [ ] [D1] The lock is not left behind after the refusal.
- [ ] [D1] Listing `sub/mine.md` itself still commits exactly `sub/mine.md`.

G4 (fails-today): a staged deletion is committed as a deletion
- [ ] [D2] A file tracked in HEAD and removed with `git rm` is committed by `commitFiles` as a deletion: the new commit's `--name-status` is exactly `D <file>`.
- [ ] [D2] Another agent's staged deletion of a different file in the same run stays out of that commit and stays tracked in HEAD.
- [ ] [D2] A path that was deleted and whose deletion was already committed (the existing "gone.md" case) is still refused naming it.
