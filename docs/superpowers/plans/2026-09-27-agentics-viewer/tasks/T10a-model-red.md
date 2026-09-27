# T10a: View model: tests

rigor: pair
role: red
size: ~26 turns (3 edit sites, 6 files)

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
- [ ] `returnInWords` maps each value in architecture § Design decisions, and an unknown
      `some_thing` to `some thing` → test 'returns in words'
- [ ] `problemText` gives the exact sentence for each of the five codes → test 'problem sentences'
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
