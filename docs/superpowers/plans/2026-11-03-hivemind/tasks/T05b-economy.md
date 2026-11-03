# Task T05b: Economy — implementation

rigor: triad
role: green
size: ~17 turns (2 edit sites, 6 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | xhigh | the ledger is the hive's money: a miss leaks energy silently |
| review | opus | medium | |
| fix | sonnet | high | ledger fixes |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Economy

## Dependencies
- Depends on: T05a
- Depended on by: T05c

## Scope
**Files:**
- Modify: `src/economy.mjs` (replace the stubs)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Every operation mutates the ledger it is given and keeps the invariant in `interfaces.md` §
  Economy. Draws from the supply are `Math.min(amount, supply)`.
- Accounts: `ledger.accounts[id] = { balance, escrow, closed: false }`. `close` releases escrow to
  balance and sets `closed`; the leftover balance stays in the account; the ledger never deletes one.

## Negative Constraints (DO NOT)
- Do NOT modify `test/economy.test.mjs`: authored by T05a and locked.

## Implementation Steps
### Step 1: Read the locked tests
### Step 2: Implement `src/economy.mjs`
### Step 3: Run `node --test test/` — Expected: PASS
### Step 4: Commit
```bash
git add src/economy.mjs
git commit -m "Keep the hive's books: endowments, escrow, income, upkeep and pay"
```

## Acceptance Criteria
- [ ] Every test in `test/economy.test.mjs` passes, unmodified
- [ ] The full suite is green
- [ ] No files outside Scope were modified
