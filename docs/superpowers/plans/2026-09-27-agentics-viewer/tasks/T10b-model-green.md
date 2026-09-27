# T10b: View model: implementation

rigor: pair
role: green
size: ~18 turns (2 edit sites, 5 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | the rules are fixed by the locked tests |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § View model (page) and § Snapshot contract
- Read: `../shared/architecture.md` § Design decisions made while planning
- Spec § 7.3, § 7.5 and § 8

## Dependencies
- Depends on: T10a
- Depended on by: T11

**Files:**
- Create: `agentics-viewer/web/model.ts`

**Scope / Negative Constraints:**
- Do NOT modify `agentics-viewer/test/model.test.ts` or `agentics-viewer/test/snapshot-fixture.ts`.
  T10a wrote and locked them. If a test is wrong, escalate; never edit it.
- Pure module. No DOM, no imports beyond `../shared/snapshot.ts`.

**Interfaces:**
- Consumes: `shared/snapshot.ts`.
- Produces: everything in interfaces § View model (page).

- [ ] **Step 1: Read the locked tests**: `npx vitest run test/model.test.ts`. All fail.
- [ ] **Step 2: Implement `web/model.ts`** per interfaces.
- [ ] **Step 3: Run** `npm test`. Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add agentics-viewer/web/model.ts
git commit -m "feat(agentics-viewer): the view model"
```

## Acceptance
- [ ] Every test in `test/model.test.ts` passes, unmodified.
- [ ] `npm test` is green.
