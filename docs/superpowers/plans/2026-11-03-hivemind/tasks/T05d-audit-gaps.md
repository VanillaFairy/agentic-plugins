# Task T05d: T05 audit gaps

rigor: tdd
gap: audit
size: ~10 turns (1 edit site, 2 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | tests against a fixed module; each acceptance line names its outcome |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to named findings |

## References
- Read: `../shared/interfaces.md` § Economy
- Read: `../shared/conventions.md`
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: T05c
- Depended on by: T08

## Scope
**Files:**
- Modify: `test/economy.test.mjs` (add tests only)
- Modify, only if a new test fails on the current head: `src/economy.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list, and you MUST NOT weaken, skip or
delete any existing test in `test/economy.test.mjs`.**

All three gaps are passes-today: the code in `src/economy.mjs` is expected to be right and the
tests miss the case. For each acceptance line, write the test, confirm it passes on the head, then
show it can fail with one mutant at that line's single site through
`scripts/mutation-probe.cjs`, each mutant with an `"expect"` naming the new test. If a new test
fails on the head instead, stop and report it: the line becomes fails-today and needs a fix.

Use the existing helpers in the test file (`ledgerWith`, `money`, `assertBooks`, `worldOf`,
`levers`, `claim`) and end every new test with `assertBooks`. Derive expected values from the rule
and `physics.json`, never from what the code returns.

## Implementation Steps
### Step 1: Add the tests for G1, G2 and G3 to `test/economy.test.mjs`
### Step 2: Run `node --test test/economy.test.mjs` — Expected: PASS
### Step 3: Run the mutation probe, one mutant per acceptance line, each killed by its own test
### Step 4: Commit
```bash
git add test/economy.test.mjs
git commit -m "Pin closed accounts, tick order and broke-agent deaths in the economy tests"
```

## Decisions
D1: Is a closed account inert for `escrow`, `chargeUsage` and endowing a child? `fix`: yes, pin it
(escrow refuses, a usage charge moves nothing, a closed parent cannot endow). `accept`: leave these
open for T09 to define; skip the lines tagged [D1].
D2: Within one `settleTick`, is income paid before upkeep is charged? `fix`: yes, as the interface
lists them. `accept`: the order stays unspecified; skip the line tagged [D2].

## Acceptance Criteria

G1 (passes-today): a closed account moves no energy through escrow, usage or endowment.
- [ ] `escrow` on a closed account that holds a positive balance returns `false`, and the whole
  ledger is unchanged (balance stays, escrow stays 0) [D1]
- [ ] `chargeUsage` on a closed account that holds a positive balance returns the whole cost as
  unpaid, and the whole ledger is unchanged (balance and `spent` unmoved) [D1]
- [ ] `open(ledger, child, amount, closedParent)` with a closed parent whose balance covers the
  amount returns `false`, creates no account for the child, and leaves the parent's balance and the
  rest of the ledger unchanged [D1]

G2 (passes-today): income lands before upkeep in a tick.
- [ ] An agent whose balance is below one upkeep charge (`upkeep × upkeep_factor`) and which authors
  one tested standing claim paying more than one upkeep charge survives the tick with
  `start + income − upkeep` (within one unit), not `income`; `spent` rises by the full upkeep charge;
  it is not in `deaths` [D2]

G3 (passes-today): a broke agent dies at the next tick.
- [ ] A living agent whose balance is exactly 0 when `settleTick` is called (spent down by `debit`),
  with no income that tick, is in `deaths` and is closed after the tick
- [ ] In the same tick, a living agent with a positive balance above one upkeep charge is not in
  `deaths` and stays open

- [ ] Every new test is killed by its own single-site mutant in the probe file, none "killed elsewhere"
- [ ] No existing test was weakened, skipped or deleted
- [ ] No files outside Scope were modified
