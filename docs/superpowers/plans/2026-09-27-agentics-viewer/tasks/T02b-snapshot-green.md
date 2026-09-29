# T02b: agentics `snapshot`: implementation and contract

rigor: pair
role: green
size: ~30 turns (8 edit sites, 10 files)

**Repository:** agentics (`C:/work/claude/vanillafairy/agentics`), branch `master` (agentics
4.0.0, released 2026-09-27; `design-loop` is merged and closed).

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | composes six modules and must avoid an import cycle |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Snapshot contract
- Read: `../knowledge/run-checks-agentics.md`
- Spec § 5
- In the agentics repository: `lib/status.mjs`, `lib/store.mjs`, `lib/approval.mjs`,
  `lib/spec.mjs`, `lib/tree.mjs`, `lib/ledger.mjs`, `lib/effort.mjs` (`executionsOf`),
  `docs/DESIGN.md` § Progress and § Data contracts, and the agentics `CLAUDE.md`

## Dependencies
- Depends on: T02a
- Depended on by: T15b

**Files:**
- Modify: `lib/status.mjs`
- Modify: `docs/DESIGN.md`

**Scope / Negative Constraints:**
- Do NOT modify `test/snapshot.test.mjs`. T02a wrote and locked it. If a test is wrong, escalate;
  never edit it.
- Read-only: `snapshotOf` writes no file, no lock and no `seq`.
- Don't duplicate a derivation that already exists. Call `readTree`, `todoFor`, `costOf`,
  `approvalState`, `parseSpec`, and the path helpers in `lib/store.mjs`.
- If importing `approval.mjs` or `spec.mjs` into `status.mjs` makes an import cycle (`next.mjs`
  already imports `status.mjs`), check that the cycle is harmless at load time, or move the call
  so it isn't a cycle. Say which you did in the commit message.
- Git calls use the existing `git()` helper in `lib/store.mjs`. Leaves that aren't active make no
  git call.

**Interfaces:**
- Consumes: the locked tests of T02a.
- Produces: `snapshotOf(repo, effort)`, `efforts(repo).store`, and the `snapshot` CLI command
  (interfaces § Snapshot contract).

- [ ] **Step 1: Read the locked tests**

Run: `node --test test/snapshot.test.mjs`. Every test fails.

- [ ] **Step 2: Implement `snapshotOf` and the CLI command**

In `lib/status.mjs`:
- `export function snapshotOf(repo, effort)` builds the payload of spec § 5.2 by the rules of
  § 5.3. Nodes come in `subtreeOf(tree.nodes, ROOT_ID)` order, plus any live node not reachable
  from the root.
  - Folders are every folder holding a spec, walked as `next.mjs`'s `foldersOf` does. Reuse it by
    moving that walk into `status.mjs` or `store.mjs` if that's the cleanest home; otherwise
    duplicate nothing.
  - `blocking` counts `spec.questions` whose grade is `blocking`.
  - A task's spec line is the `line` of the parent spec's entry named after the task.
  - `commits` runs `git log --format=%s%x1f%cI <parentBranch>..<leafBranch>` with the main
    checkout as `cwd`. It's null when either `revParse` is empty.
- `efforts(repo)` adds `store: posix(agenticsRoot(repo))` to both of its returns.
- The CLI gains `snapshot`: `needEffort()`, then
  `print(snapshotOf(repo, effort), (p) => renderTree(...) || '(no nodes)')`. Update the
  unknown-command message to list `snapshot`.

- [ ] **Step 3: Run the tests and the suite**

Run: `node --test test/snapshot.test.mjs` and expect PASS. Then run the full check from
`knowledge/run-checks-agentics.md` and expect it green.

- [ ] **Step 4: Register the contract in DESIGN.md**

In `docs/DESIGN.md` § Data contracts, add a `### Snapshot` entry after `### Node record and
events`:
- **Owner:** `snapshotOf` in `lib/status.mjs`.
- **Restated in:** `agentics-viewer/shared/snapshot.ts` in the vanillafairy repository (a
  reader).
- Then list the fields and rules of spec § 5.2 and § 5.3 in the entry's own style, including
  `format: 1` and the rule that any field change bumps it.
- Also add `store` to the entry that describes `status.mjs list`, if one exists. Otherwise put
  one sentence under Snapshot.

In § Progress, add one paragraph: "The agentics viewer (vanillafairy's `agentics-viewer/`) draws
an effort live from `lib/status.mjs snapshot`. It reads, and never writes, the effort store."
Run the full check again; `test/design-doc.test.mjs` must stay green.

- [ ] **Step 5: Commit**

```bash
git add lib/status.mjs docs/DESIGN.md
git commit -m "feat(status): snapshot, a read-only payload for the agentics viewer"
```

## Acceptance
- [ ] Every test in `test/snapshot.test.mjs` passes, unmodified.
- [ ] `node tools/lint.mjs && node --test` is green.
- [ ] `docs/DESIGN.md` has the Snapshot contract entry and the Progress paragraph.
- [ ] `node lib/status.mjs snapshot --repo C:/work/eva-plays-2 --effort 2026-09-26-reshape-pets-onto-entities-action-queues --json`
      prints an envelope whose payload has `format: 1`, and nothing under eva-plays-2's
      `.agentics/` changes (compare `git status` in eva-plays-2 and the files' mtimes before and
      after).
