# Task T05a: Economy — tests

rigor: triad
role: red
size: ~22 turns (4 edit sites, 6 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | xhigh | the ledger is the hive's money: a miss leaks energy silently |
| review | opus | medium | |
| fix | sonnet | high | ledger fixes |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Economy
- Read: `../shared/architecture.md` § physics.json

## Dependencies
- Depends on: T01
- Depended on by: T05b, T05c

## Scope
**Files:**
- Create: `test/economy.test.mjs`
- Create: `src/economy.mjs` exporting the names in `interfaces.md` § Economy, each throwing `new Error('not implemented')`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Every test ends by asserting the invariant: `total(ledger) === ledger.initial + ledger.added`
  and no negative balance, escrow or supply. Write one helper `assertBooks(ledger)` and call it.
- Derive amounts from `physics.json` values read in the test, never typed as literals.
- Add one property test: 500 random operations from a seeded generator (a small LCG in the test
  file), checking the invariant after each.

## Negative Constraints (DO NOT)
- Do NOT implement `economy.mjs` beyond the stubs.

## Failure Modes
- Interrupted mid-write, then run again: a wake interrupted with no usage → acceptance line 'an interrupted wake's reserve is written off'
- An input deleted, renamed or removed: an agent that died with escrow outstanding → acceptance line 'a death settles the escrow before the account closes'
- A value changed: the user cuts the supply below what income would draw → acceptance line 'income stops when the supply runs dry'
- Every path into a guarded state (zero balance): debit, usage charge, upkeep → acceptance lines 'a debit the balance can't cover changes nothing', 'usage beyond the escrow draws the balance down to zero, never below', 'upkeep takes an agent to zero and reports its death'
- Run from a linked worktree and from the main checkout: n/a: pure module
- Each target that already exists: opening an account twice → acceptance line 'opening an existing account throws'

## Implementation Steps
### Step 1: Write the tests, one per acceptance line
### Step 2: Run `node --test test/economy.test.mjs` — Expected: every test FAILS with `not implemented`
### Step 3: Commit
```bash
git add test/economy.test.mjs src/economy.mjs
git commit -m "Pin the hive's ledger, escrow and pay rules in tests"
```

## Acceptance Criteria
- [ ] `open` from the supply moves the endowment out of the supply → test 'an endowment comes out of the supply'
- [ ] `open` from a parent moves it out of the parent's balance, and returns false moving nothing when the parent can't cover it → test 'a child is endowed by its parent'
- [ ] Opening an existing account throws → test 'opening an existing account throws'
- [ ] `price` returns each tool's table price, `source` by bytes per KB, usage by the four usage weights → test 'prices come from the table and the usage weights'
- [ ] A debit within the balance spends it; one the balance can't cover returns false and changes nothing → test 'a debit the balance can't cover changes nothing'
- [ ] `escrow` moves balance to escrow, or returns false → test 'escrow reserves from the balance'
- [ ] `chargeUsage` draws escrow first, then balance, down to zero, and returns the unpaid remainder → test 'usage beyond the escrow draws the balance down to zero, never below'
- [ ] `release` returns escrow to the balance → test 'release returns the unused reserve'
- [ ] `writeOff` moves escrow to writtenOff → test 'an interrupted wake's reserve is written off'
- [ ] `close` releases the escrow to the balance and marks the account closed; a closed account can't be debited and earns no income or pay → test 'a death settles the escrow before the account closes'
- [ ] `settleTick` closes every agent it reports in `deaths` → test 'upkeep takes an agent to zero and reports its death'
- [ ] `settleTick` pays `income_rate × strength × relevance` to a living author of a standing claim with `tested: true` → test 'a tested standing claim earns income'
- [ ] No income for a claim below standing_threshold, with `tested: false`, or by a dead or closed author → test 'untested, fallen or orphaned claims earn nothing'
- [ ] Income stops when the supply reaches zero → test 'income stops when the supply runs dry'
- [ ] `settleTick` charges `upkeep × upkeep_factor` to every living agent → test 'upkeep drains every living agent'
- [ ] Upkeep that takes an agent to zero lists it in `deaths` → test 'upkeep takes an agent to zero and reports its death'
- [ ] An agent at `budding_threshold × budding_factor` with fewer than `max_buds` buds is listed in `buds`; one at `max_buds` is not → test 'rich agents bud until their bud cap'
- [ ] `payNovelty` pays `novelty × relevance × temperature × weight × novelty_rate` from the supply → test 'novelty is paid by relevance, temperature and the thermostat's weight'
- [ ] `payCritic` pays the strength removed × target relevance × critic_rate → test 'a critic is paid for the strength its attack removes'
- [ ] `payCritic` pays nothing when the target was weaker than weak_ratio × the attacker's best → test 'attacking a much weaker claim pays nothing'
- [ ] `feed` adds to the supply; a negative feed cuts it, never below zero → test 'the user's levers grow or cut the supply'
- [ ] 500 random operations keep the books balanced and nothing negative → test 'the books balance under random operations'
- [ ] No files outside Scope were modified
