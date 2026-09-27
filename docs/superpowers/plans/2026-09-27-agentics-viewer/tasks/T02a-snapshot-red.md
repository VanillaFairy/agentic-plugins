# T02a: agentics `snapshot`: tests

rigor: pair
role: red
size: ~30 turns (6 edit sites, 11 files)

**Repository:** agentics (`C:/work/claude/vanillafairy/agentics`), branch `design-loop`.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | high | real-git fixtures across branches, worktrees, specs and the ledger |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Snapshot contract
- Read: `../knowledge/run-checks-agentics.md`
- Spec § 5 (the whole section)
- In the agentics repository, read for patterns:
  - `test/status.test.mjs`: `effortWith`, `ev`, `dispatched`, and appending node records straight
    into the ledger;
  - `test/evidence-anchors.test.mjs` around line 96: a linked-worktree helper;
  - `test/next.test.mjs`: specs and approval ledger lines in a temp effort;
  - `lib/store.mjs`: `branchOf`, `worktreeOf`, `briefPath`, `reportPath`, `specPath`,
    `agenticsRoot`, `parentOf`;
  - `lib/approval.mjs` `approvalState`, `lib/spec.mjs` `parseSpec` and `hashSpec`,
    `lib/status.mjs` `todoFor` and `costOf`, `lib/plan-digest.mjs` `canonical` and `fnv1a`.

## Dependencies
- Depends on: —
- Depended on by: T02b

**Files:**
- Create: `test/snapshot.test.mjs`

**Scope / Negative Constraints:**
- Tests only. Don't touch `lib/`.
- Build every fixture in a temp directory inside the test, with real `git`. Commit nothing into
  `test/fixtures/`.
- Expected values come from agentics' own functions run on the same fixture (`approvalState`,
  `todoFor`, `costOf`, `parseSpec`, `branchOf`, …) or from the fixture text (`lineOf`), never
  typed as literals the fixture decides.
- Assert the keys each test needs. Don't `deepEqual` a whole payload.
- Where the spec leaves something open, assert the invariant and escalate the question. Don't
  pin a guess.

**Interfaces:**
- Consumes: nothing new.
- Produces: the locked tests for T02b. They pin:
  - `snapshotOf(repo, effort)`, exported from `lib/status.mjs`, returns the `Snapshot` payload
    (interfaces § Snapshot contract);
  - `efforts(repo)` returns a `store` field, and so does its early return when `.agentics/` is
    absent;
  - the CLI: `node lib/status.mjs snapshot --repo <r> --effort <e> --json` prints
    `{payload, payload_digest}` with `payload_digest === fnv1a(canonical(payload))`, and without
    `--json` prints `renderTree`'s text.

- [ ] **Step 1: Write the fixture builder**

One helper, `effortFixture()`, that:
- `git init`s a temp repo with one commit on the default branch;
- writes `.agentics/eff/DESIGN.md` (root spec) and `.agentics/eff/a/DESIGN.md` in the final spec
  grammar (spec § 5.3 of the redesign: copy the shape from `test/fixtures/spec/`). The root plan
  has a `sub-effort` entry `a` and a `task` entry `c`. The `a` plan has task entries `impl`,
  `fix` and `wait`, and one `- **blocking:** …` open question;
- appends an `approved` ledger line for `.` whose hash is `hashSpec` of the root spec text. `a`
  stays unapproved;
- appends node records for `.`, `a`, `a/impl`, `a/fix`, `a/wait` and `c`, straight into the
  ledger as `test/status.test.mjs` does. `a/fix` lists `a/impl` in `deps`;
- creates the branches `branchOf('eff','a')` and `branchOf('eff','a/impl')` (the latter from the
  former) with two commits on the leaf branch, and runs `git worktree add` for `a/impl` at
  `worktreeOf(repo,'eff','a/impl')`;
- appends events: `a/impl` dispatched (implementer, round 1); `a/fix` dispatched then `escalated
  {reason, detail}`; `a/wait` `parked {return:'needs_decision', question}`;
- writes one brief file at `briefPath(... 'a/impl', 'implementer', 1)` and one report at
  `reportPath(...)` for the same dispatch, under an execution stamp with an `execution.json`.

- [ ] **Step 2: Write the tests**

Each test's name is the one in the acceptance list below.

- [ ] **Step 3: Run them and see them fail for the right reason**

Run: `node --test test/snapshot.test.mjs`
Expected: FAIL. Tests calling `snapshotOf` fail with `does not provide an export named 'snapshotOf'`,
the `store` test fails on `undefined`, and the CLI tests fail on `unknown command "snapshot"`. No
failure may come from the fixture builder itself. Confirm it by printing the fixture's `git log`
once while writing.

- [ ] **Step 4: Commit**

```bash
git add test/snapshot.test.mjs
git commit -m "test(status): snapshot, the viewer's read contract"
```

## Acceptance
- [ ] `format` is 1 → test 'snapshot carries format 1'
- [ ] `store` is the main checkout's `.agentics/` path, forward-slashed → test 'store names the main checkout's .agentics'
- [ ] Called with the linked worktree as `repo`, `store` and every node are the same as from the
      main checkout → test 'a snapshot taken from a linked worktree reads the main checkout's store'
- [ ] `efforts(repo).store` is set when the store exists → test 'list carries store'
- [ ] `efforts(repo).store` is set when `.agentics/` is absent → test 'list carries store with no store present'
- [ ] Every live node appears once, with `parent` from `parentOf` and `null` for `.` → test 'every live node appears once with its parent'
- [ ] `status` equals `readTree(...).status.get(id).status` for every node → test 'status passes through from deriveStatus'
- [ ] The escalated node's `event` has `kind`, `seq`, `reason` and `detail`; the parked node's has
      `return` and `question` → test 'event carries its kind\'s payload fields'
- [ ] `stage` equals `todoFor(...).activeForm` for in-progress items and is null for the others
      → test 'stage is todoFor\'s activeForm only while in progress'
- [ ] A design node with no children passes through as `open` with a null stage → test 'an open design node passes through'
- [ ] A folder whose children have all merged passes through as `integrated` → test 'an integrated folder passes through'
- [ ] Status is never mapped: the test swaps in an events log producing every status the fixture
      can reach (`planned`, `active`, `approved`, `merged`, `integrated`, `parked`, `escalated`,
      `open`), and each appears unchanged → test 'every reachable status passes through unchanged'
- [ ] `commits` for the active `a/impl` has `count` 2, the second commit's subject, and its ISO
      committer date → test 'commits count from the parent integration branch'
- [ ] `commits` is null for every node that isn't an active leaf → test 'commits only for active leaves'
- [ ] `commits` is null for an active leaf whose branch doesn't exist → test 'commits null when a branch is missing'
- [ ] `worktree` is set for `a/impl` and null for `a/fix` → test 'worktree only when it exists'
- [ ] `files.spec` for folder `a` is its own `DESIGN.md` with line null → test 'a folder links its own spec'
- [ ] `files.spec` for task `a/impl` is `a/DESIGN.md` at the line of its `- **impl**` entry,
      computed from the fixture text → test 'a task links its parent spec at its entry line'
- [ ] `files.briefs` and `files.reports` list the files written, and nothing for a dispatch
      without files → test 'briefs and reports list only files that exist'
- [ ] `folders` holds `.` and `a`. `approval` matches `approvalState` (`approved` for `.`, `none`
      for `a`), and `blocking` is 1 for `a` and 0 for `.` → test 'folders carry approval and blocking counts'
- [ ] `cost` matches `costOf`'s `dispatches`, `tokens`, `tokens_unreported` and `per_leaf` →
      test 'cost matches costOf'
- [ ] `deps`, `acceptance`, `locus`, `rigor` and `role` pass through from the node record → test
      'node fields pass through'
- [ ] Every file under `.agentics/` has identical bytes after `snapshotOf` and after the CLI →
      test 'snapshot writes nothing'
- [ ] The CLI's `--json` output is the envelope with a matching digest → test 'CLI prints the envelope'
- [ ] The CLI without `--json` prints `renderTree`'s text → test 'CLI prints the tree for a person'
