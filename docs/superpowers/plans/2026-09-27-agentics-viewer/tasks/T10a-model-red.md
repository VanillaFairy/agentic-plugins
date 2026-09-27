# T10a: View model: tests

rigor: pair
role: red
size: ~34 turns (3 edit sites, 6 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | high | many wording rules with edge cases the spec states exactly |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § View model (page) and § Snapshot contract
- Read: `../shared/architecture.md` § Design decisions made while planning
- Spec § 7.3, § 7.5 and § 8

## Dependencies
- Depends on: T03
- Depended on by: T10b

**Files:**
- Create: `agentics-viewer/test/model.test.ts`
- Create: `agentics-viewer/test/snapshot-fixture.ts` (a builder for test snapshots)

**Scope / Negative Constraints:**
- Tests only. No `web/` file.
- `snapshot-fixture.ts` exports `snap(nodes, extra?)` and `node(id, partial)`. `node` fills every
  `SnapshotNode` field, deriving `parent` from the id unless it's given. Expected names, parents
  and orders are computed from the fixture's ids, never typed out twice.
- The exact strings in interfaces § View model are the spec's wording. Assert them as written.

**Interfaces:**
- Consumes: `shared/snapshot.ts` (T03).
- Produces: the locked tests for T10b.

- [ ] **Step 1: Write the fixture builder and the tests**, one per acceptance line.
- [ ] **Step 2: Run**: `npx vitest run test/model.test.ts`. Expected: FAIL with
  `web/model.ts` not found.
- [ ] **Step 3: Commit**

```bash
git add agentics-viewer/test/model.test.ts agentics-viewer/test/snapshot-fixture.ts
git commit -m "test(agentics-viewer): the view model's lamps, wording and problems"
```

## Acceptance

Lamps and wording (`lampAndWording`):
- [ ] An active leaf with stage `fix round 2` and 3 commits reads `fix round 2, 3 commits`, lamp `work` → test 'active leaf shows stage and commits'
- [ ] An active leaf with 1 commit reads `…, 1 commit` → test 'one commit is singular'
- [ ] An active leaf with a null stage and no commits reads `working` → test 'active leaf without a stage reads working'
- [ ] An active composite with children merged, active and planned reads `1 of 3 merged` → test 'active folder counts merged children'
- [ ] `integrated` and `landed` children count as merged → test 'integrated and landed count as merged'
- [ ] `approved` with stage `held` reads `held`; with a null stage, `awaiting merge` → test 'approved reads its stage or awaiting merge'
- [ ] `parked` is lamp `hold`, `waiting on you` → test 'parked waits on you'
- [ ] `escalated` is lamp `stop`, `escalated` → test 'escalated is stop'
- [ ] `merged`, `integrated` and `landed` are lamp `done`, worded as themselves → test 'finished states are quiet'
- [ ] A planned leaf reads `queued`, lamp `idle` → test 'planned leaf is queued'
- [ ] A planned composite with children reads `0 of 2 merged` → test 'planned folder counts children'
- [ ] `open` with a folder, `blocking` 1 and approval `none` reads `needs design, 1 blocking, not approved` → test 'open design shows blocking and approval'
- [ ] `open` with approval `edited` reads `needs design, edited since approval` → test 'edited spec is named'
- [ ] `open` with approval `approved` and no blocking reads `needs design` → test 'approved design needs only design'
- [ ] `open` with no folder reads `needs design` → test 'open without a folder'
- [ ] An unknown status `paused` is lamp `unknown`, worded `paused` → test 'unknown status shows its raw name'

Model (`buildModel`):
- [ ] `order` is depth-first, parents before children, siblings by id → test 'order is depth-first by id'
- [ ] `name` is the last id segment, and the effort name for `.` → test 'names are last segments'
- [ ] `depth` counts from 0 at the root → test 'depth counts from the root'
- [ ] A node whose parent is missing sits under `.` with `orphan: true`, lamp `orphan`, wording
      `parent missing: <parent>` → test 'an orphan is drawn under the root'
- [ ] `folder` is the folder whose id equals the node id, else null → test 'nodes find their folders'
- [ ] Tiles: stop tiles come before hold tiles, each group by seq descending → test 'escalations lead the tiles'
- [ ] A hold tile's `why` is the question, else `returnInWords(return)` → test 'hold tiles explain the question'
- [ ] A stop tile's `why` is the reason, else the detail → test 'stop tiles explain the reason'
- [ ] A parked node with a null event gets no tile → test 'no event, no tile'
- [ ] Counts: working = active and approved leaves, merged = merged, integrated and landed leaves,
      queued = planned leaves, need design = open design nodes → test 'counts cover leaves and design nodes'

Edges, words, text:
- [ ] `afterEdges` gives the node's existing deps as incoming, and its dependants as outgoing,
      both sorted → test 'after edges in and out'
- [ ] A dep naming a missing node is left out of incoming → test 'missing deps are dropped'
- [ ] `returnInWords('needs_decision')` is `needs a decision` → test 'needs_decision in words'
- [ ] `returnInWords('needs_design')` is `needs design` → test 'needs_design in words'
- [ ] `returnInWords` gives `needs the spec fixed` for `needs_respec` → test 'needs_respec in words'
- [ ] … for `spec_defect` → test 'spec_defect in words'
- [ ] … for `premise_mismatch` → test 'premise_mismatch in words'
- [ ] … for `contract_changed` → test 'contract_changed in words'
- [ ] … for `contract_drift` → test 'contract_drift in words'
- [ ] `returnInWords('cant_tell')` is `can't tell from the evidence` → test 'cant_tell in words'
- [ ] `returnInWords('integration_critical')` is `needs a decision on the merged work` → test 'integration_critical in words'
- [ ] `returnInWords('some_thing')` is `some thing` → test 'an unknown return reads as words'
- [ ] `problemText` for `agentics_missing` is the § View model sentence, with the path filled in → test 'agentics_missing sentence'
- [ ] … for `agentics_too_old`, with version and path → test 'agentics_too_old sentence'
- [ ] … for `format_mismatch`, with path and format → test 'format_mismatch sentence'
- [ ] … for `snapshot_failed`: "The first refresh failed: <detail>." → test 'snapshot_failed sentence'
- [ ] … for `project_gone`, with the path → test 'project_gone sentence'
- [ ] `staleText` for a `Date` at 14:02 local time and detail `boom` is "Showing the board from 14:02. The last refresh failed: boom." → test 'stale text'
- [ ] `staleText` with an empty detail ends "The last refresh failed." → test 'stale text without detail'
- [ ] `malformedText(3)` and `malformedText(1)` give the plural and singular sentences → test 'malformed text'
- [ ] `noEffortsText('eva-plays-2')` is "No efforts in eva-plays-2 yet. Start one with /agentics:design." → test 'no efforts text'
- [ ] `browseErrorText('x')` is "Couldn't open the folder dialog: x." → test 'browse error text'
- [ ] `TEXT` holds the three fixed sentences exactly → test 'fixed page sentences'
- [ ] `kindWord` maps `leaf` → `task`, `composite` → `folder` and `design` → `design`, and passes others through → test 'kind words'
- [ ] `fileLabel('…/briefs/a.impl-implementer-r1.md', 'brief')` is `Brief, implementer round 1` → test 'a brief is labelled'
- [ ] `fileLabel('…/reports/20260927-101500-a.impl-test-author-r2.md', 'report')` is `Report, test-author round 2` → test 'a report with a dashed role is labelled'
- [ ] `fileLabel` of a node part with dashes (`x-y.z-w-reviewer-r3.md`) finds `reviewer` round 3 → test 'dashes in the node part do not confuse the role'
- [ ] `fileLabel('odd.md', 'brief')` is `Brief, odd.md` → test 'an unparsable name falls back to the base name'
- [ ] `addAck` appends newest last → test 'acks append newest last'
- [ ] `addAck` moves an existing key to the end without duplicating it → test 'an ack is never duplicated'
- [ ] `addAck` with `cap` 3 keeps the last three → test 'acks are capped'
- [ ] `visibleRows` with an empty filter hides rows below a collapsed id and keeps the collapsed row → test 'collapse hides descendants'
- [ ] `visibleRows` with filter `QUEUE` keeps `action-queue` and its ancestors, and nothing else → test 'the filter keeps matches and their ancestors'
- [ ] `visibleRows` matches titles as well as names → test 'the filter matches titles'
- [ ] `visibleRows` ignores collapse while a filter is set → test 'filtering ignores collapse'
- [ ] `moveSelection` moves down and up through the rows → test 'selection moves through rows'
- [ ] `moveSelection` stays at the first and last rows → test 'selection stops at the ends'
- [ ] `moveSelection` from null goes to the first row down and the last row up → test 'selection starts at an end'
- [ ] `moveSelection([], …)` is null → test 'no rows, no selection'
- [ ] `subtreeDone` is true for a folder whose leaves are all done → test 'a finished folder is done'
- [ ] `subtreeDone` is false with one leaf not done → test 'one unfinished leaf keeps a folder live'
- [ ] `subtreeDone` is false for a folder with no leaves → test 'an empty folder is not done'
- [ ] `ago`: 30 s → `just now`, 5 min → `5 min ago`, 3 h → `3 h ago`, 2 d → `2 d ago` → test 'ago buckets'
- [ ] `ago` for a time in the future is `just now` → test 'a future commit time reads just now' (Review Focus 5)
- [ ] `vscodeLink('C:\\My Work\\a b\\DESIGN.md', 12)` is `vscode://file/C:/My%20Work/a%20b/DESIGN.md:12` → test 'vscode links encode spaces and keep the drive' (Review Focus 1)
- [ ] `vscodeLink(path)` with a null line has no `:line` → test 'no line, no suffix'
- [ ] `costText` for 412 345 tokens over 23 dispatches is `412k tokens over 23 dispatches` → test 'cost in thousands'
- [ ] `costText` under 1000 tokens and one dispatch is `800 tokens over 1 dispatch` → test 'small cost and one dispatch'
- [ ] `costText` with 2 unreported appends `, and 2 unreported` → test 'unreported dispatches are named'
- [ ] `spendText` is null for a node absent from `per_leaf` → test 'no spend for unmeasured nodes'
- [ ] `tabTitle([])` is `agentics viewer`; with two tiles, `(2) agentics viewer` → test 'tab title counts tiles'
- [ ] `tileKey` joins project, effort, node and seq with `|` → test 'tile key'
