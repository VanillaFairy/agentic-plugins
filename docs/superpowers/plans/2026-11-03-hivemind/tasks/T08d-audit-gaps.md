# Task T08d: T08 audit gaps

rigor: tdd
gap: audit
size: ~16 turns (2 edit sites, 2 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | two pay-and-verification rule fixes inside `runTool`, plus junction fixtures on Windows |
| review | opus | medium | |
| fix | sonnet | high | |
| re-review | opus | low | scoped to named findings |

## References
- Read: `../shared/interfaces.md` § Tools and the Hive and § Economy and § Strength
- Read: `../shared/architecture.md` § Node kinds
- Read: `../shared/conventions.md`
- Read: `../knowledge/run-tests.md`
- Read: `T08a-tools-tests.md` § Acceptance Criteria (the lines for `checks` and novelty)
- Read: `T08b-tools.md` § Positive Constraints (source paths, novelty)

## Dependencies
- Depends on: T08c
- Depended on by: T09a, T10

## Scope
**Files:**
- Modify: `test/tools.test.mjs` (add tests only)
- Modify, only for a fails-today line: `src/tools.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list, and you MUST NOT weaken, skip or
delete any existing test in `test/tools.test.mjs`.**

G1 and G3 are fails-today: write the test, run it and see it fail on the head, then fix
`src/tools.mjs` (G1 in `checkVerification`, G3 in `settleAttack`). Every other group is passes-today:
write the test, confirm it passes on the head, then show it can fail with one mutant of your own at
that line's single site through `scripts/mutation-probe.cjs`, with an `"expect"` naming the new
test. If a passes-today test fails on the head, stop and report it.

Use the file's `world()`, `noveltyWorld()`, `attackOn`, `refusedUnchanged` and `accepted` helpers.
To make a target fail to survive, raise `standing_threshold` through `world({ physics })` instead of
building a stronger attack. Derive expected amounts from `payNovelty`'s formula and `computeStrengths`,
never from what the code returns. Make links with `symlinkSync(target, path, 'junction')`, which
needs no elevation on Windows and makes a directory symlink elsewhere.

## Implementation Steps
### Step 1: Add the tests for G1 and G3 and run them — Expected: FAIL on the head
### Step 2: Fix `checkVerification` and `settleAttack` in `src/tools.mjs`
### Step 3: Add the tests for G2 and G4–G9
### Step 4: Run `node --test test/` — Expected: PASS
### Step 5: Run the mutation probe, one mutant per passes-today line, each killed by its own test
### Step 6: Commit
```bash
git add test/tools.test.mjs src/tools.mjs
git commit -m "Check against the checked claim's source and pay novelty at the first survived attack"
```

## Decisions
D1: Does a target that falls below standing on its first foreign attack earn novelty at the first
later foreign attack it survives? `fix`: yes. "A target's first attack claim from another lineage
that it survives" is the first survived one, and `novelty_paid` alone keeps it to once. `accept`:
only the very first foreign attack is judged; a target that did not survive it never earns novelty.
Skip the lines tagged [D1].

## Acceptance Criteria

G1 (fails-today): a check is refused unless its author read the checked claim's source.
- [ ] An agent of another lineage whose `sources_read` holds only a charter file other than the
  checked F claim's `source` posts a check that cites the file it did read
  (`source: <that file>`, `supports: C`, `checks: C`). It is refused and nothing changes
  (`refusedUnchanged`).
- [ ] The same call with `attacks: C` is refused and nothing changes.
- [ ] An agent whose `sources_read` holds the checked claim's `source` is still accepted, and the
  checked claim's strength rises (the existing accepted case keeps passing).

G2 (passes-today): novelty needs the target to survive.
- [ ] A target whose strength after its first foreign attack is below `standing_threshold` pays its
  author no novelty, and the target carries no `novelty_paid` mark, in memory or on disk.
- [ ] The attacker of that attack still receives its critic pay (within one unit).

G3 (fails-today on fix): the first survived foreign attack pays novelty once. [D1]
- [ ] A target that did not survive its first foreign attack, and is then attacked from a second
  foreign lineage while standing (strength after ≥ `standing_threshold`), pays its author
  `novelty_rate × novelty × relevance × temperature × novelty_weight` (within one unit) and is
  marked `novelty_paid`. [D1]
- [ ] A further foreign attack on the same target pays its author no more novelty. Prove it with a
  mutant that drops the `novelty_paid` read in `settleAttack`. [D1]

G4 (passes-today): a link inside a source cannot reach outside it.
- [ ] A junction inside a goal source pointing to a folder outside every source: `source` on a file
  reached through the junction is refused and nothing changes.

G5 (passes-today): a goal source reached through a link still serves its files.
- [ ] A goal source that is itself a junction to a real folder: `source` on a file under the
  junction path is accepted.
- [ ] The same file named by its real path (under the junction's target) is accepted.

G6 (passes-today): on Windows, letter case does not decide containment.
- [ ] On `win32` only (skip elsewhere): a charter file named with its whole path upper-cased is
  accepted and returns the file's text.

G7 (passes-today): an agent whose node says it died is refused even with an open account.
- [ ] After `hive.update(agent, { died: hive.tick })` with no `economy.close`, `look` (with an
  unread inbox entry) is refused and nothing changes.
- [ ] `rest` by the same agent is refused and nothing changes.

G8 (passes-today): an agent with no ledger account is refused, not thrown.
- [ ] An agent node written into the graph after `Hive.open` (through `hive.write`), with no
  account opened: `runTool(hive, id, 'look', {})` returns `ok: false` with a reason and does not
  throw, and nothing changes.

G9 (passes-today): seed births carry the seed endowment.
- [ ] Every birth queued by an accepted `seed` carries `endowment` equal to the run's
  `physics.endowment_seed`.

- [ ] Every passes-today test is killed by its own single-site mutant in the probe file, none
  "killed elsewhere"
- [ ] No existing test was weakened, skipped or deleted
- [ ] No files outside Scope were modified
