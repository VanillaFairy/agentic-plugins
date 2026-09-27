# T08: Alerts: the watermark diff

rigor: tdd
size: ~13 turns (2 edit sites, 3 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Alerts and § Snapshot contract
- Spec § 6.6

## Dependencies
- Depends on: T03
- Depended on by: T09

**Files:**
- Create: `agentics-viewer/server/alerts.ts`
- Create: `agentics-viewer/test/alerts.test.ts`

**Scope / Negative Constraints:**
- Pure: no I/O. T09 saves the watermark and calls the toast.
- Build snapshots in the test with a small `node(id, status, event)` helper over a base
  `Snapshot`. Compute expected titles from the helper's ids.

**Interfaces:**
- Consumes: `Snapshot` (T03).
- Produces: `Alert`, `diffAlerts`.

- [ ] **Step 1: Write the failing tests**, one per acceptance line.
- [ ] **Step 2: Run**: `npx vitest run test/alerts.test.ts`. Expected: FAIL (no module).
- [ ] **Step 3: Implement** `server/alerts.ts` per interfaces § Alerts.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add agentics-viewer/server/alerts.ts agentics-viewer/test/alerts.test.ts
git commit -m "feat(agentics-viewer): alert once per new park or escalation"
```

## Acceptance
- [ ] With no watermark there are no alerts, and the watermark becomes `seq_max` → test 'the first open alerts nothing'
- [ ] A park with `event.seq` above the watermark gives one alert, and the watermark moves to its
      seq → test 'a new park alerts once'
- [ ] The same snapshot diffed again with the returned watermark gives none → test 'the same snapshot twice alerts nothing'
- [ ] An escalation at or below the watermark gives none → test 'history does not alert'
- [ ] An escalation cleared and raised again at a higher seq alerts again → test 'a re-escalation alerts again'
- [ ] A node whose status is `parked` but whose event kind differs is skipped → test 'the event must match the status'
- [ ] Alerts are ordered by seq ascending → test 'alerts come in seq order'
- [ ] The park title is `<name> is waiting on you` with the question as body, falling back to
      `return`, then `''` → test 'park wording'
- [ ] The escalation title is `<name> escalated` with the reason as body, falling back to
      `detail`, then `''` → test 'escalation wording'
- [ ] The root's name is the effort name → test 'the root is named after the effort'
- [ ] The returned watermark never goes below the one passed in → test 'the watermark never goes back'
