# Node card — design

Approved 2026-09-30. Covers the agentics plugin (`agentics/`) and the viewer (`agentics-viewer/`).

## Problem

A session started on one node spends 5–16 tool calls finding out where the node stands before it
does anything: `status list`, `next`, `status checkpoint`, `status show | grep`, then greps through
`events.jsonl`, `journal.jsonl`, `jobs/`, `closes/`, `reports/`, `said/` and git. What it works out
about a stop (the cause, the remedy that worked, the user's ruling) is written nowhere, so the next
session works it out again or relaunches without it.

Measured on `foundations/fences` in eva-plays-2, execution `20260929-075434`: four sessions, 17–29k
tokens of orientation each, one diagnosis made three times, one failure hit twice.

## What is built

Three things, in this order.

### 1. The card, computed

One pure function, `cardOf`, in `lib/status.mjs`, builds a node's card from the tree, the events,
the execution's journal and git. Nothing stores it; GP5 stands.

| field | holds | from |
|---|---|---|
| `status`, `stage` | as the snapshot has them today | `deriveStatus`, `todoFor` |
| `stop` | the last `escalated` or `parked` event while the node is in that status: `{kind, seq, reason or return, text, said}` — `text` through `saidOf`, `said` the file's path | events |
| `next` | for a leaf: `{action, why}`, `action` one of resume's `ACTIONS`, `why` the row of the resume table that matched. Null for anything that is not a leaf | `nextActionFor` in `lib/resume.mjs` |
| `behind` | how many commits the parent's integration branch has that the leaf's branch lacks; null when either branch is missing | `git rev-list --count leaf..parent` |
| `report` | `{path, lead}`: the latest implementer report of the node and its first paragraph; null when there is none | `.state/reports/` |
| `notes` | every `noted` event of the node, newest first: `{seq, by, text}` | events |
| `relaunch` | `{execution, root, retry_escalated}`: the open execution that holds the node, its root, and the node's id in `retry_escalated` when its status is `escalated`. Null when no open execution holds it | `executionSummary` |

The git parts (`next`, `behind`) are computed only for a leaf that is not merged and has a branch,
the same economy `commitsOf` keeps.

Two readers:

- `node lib/status.mjs node --repo <r> --effort <e> --node <id> [--json]` prints one card. The text
  form is what a session reads; it ends with the relaunch arguments as develop's step 3 takes them.
- `snapshotOf` carries `card` on every node. `event` and `stage` move inside it; the snapshot format
  goes up by one.

`nextActionFor` needs `gitFacts` per leaf. `cardOf` calls `resumeLeaves` once for the snapshot's
unfinished leaves, never once per node.

### 2. Notes, recorded

A note is an observation by the session that made it, so it is recorded, like any other
observation. It is not a status and `deriveStatus` skips it.

- New event kind `noted {node, execution, by: 'session', text, seq}` in `EVENT_KINDS`.
- Written by `node lib/boundary.mjs note --repo <r> --effort <e> --execution <stamp> --node <id>
  --text <t>`, beside `retry`. The ledger mints `seq` as for every event.
- `text` is one paragraph: what stopped the node, what was done or ruled, in plain words.

When a session writes one (develop skill, step 4):

- after it establishes the cause of an escalation or a fault, before it asks or relaunches;
- after the user answers a question about the node, with the ruling;
- after it does anything by hand to the node's branch (a rebase, a cherry-pick), with what it did.

### 3. Every stop reaches the log

Today a stop the workflow decides between two boundaries is carried by the next `schedule` or by
`postflight`. When postflight fails, the stop is lost: the node reads `planned` and the viewer draws
it queued while nothing runs. A card built on that log would say the same wrong thing.

Requirement: a stop the workflow decides is on disk before the workflow returns, whatever channel
fails. The mechanism is settled in the plan, after reading the record-carrying path in
`execute-approved-plan-in-worktrees.workflow.js` (`records`, `CARRIES_RECORDS`, the postflight
catch). It removes the window; it does not add a second place that remembers stops.

## Who uses the card

**develop, step 0.** Words naming a node: run `status.mjs node` first and act from the card. It
replaces the `list`, `checkpoint` and `show` lookups for that case. `behind > 0` on an escalated
leaf is said to the user before a relaunch.

**The viewer.** The detail panel shows the card: the stop, the next action, `behind`, the report's
lead, the notes. `claudePrompt` puts the same lines in the copied prompt, plus the relaunch
arguments, so a session can start without asking the store anything.

## Not in scope

- Running one node alone. A launch still runs the whole folder's execution.
- A stored status, or any file per node.
- Carrying notes into implementer briefs.

## Contracts touched

Each edits its entry in `agentics/docs/DESIGN.md#data-contracts` and every copy the entry names, in
the same commit series:

- Node record and events: `noted`; `EVENT_KINDS`; `deriveStatus` skips it.
- Snapshot: `card`, the format number; `agentics-viewer/shared/snapshot.ts`.
- Boundary payloads: `note`.
- GP5's text gains one sentence: a note is an observation, recorded by its actor.
- `skills/develop/SKILL.md` within its size budget.

## Order of work

`agentics` is on `feat/usage-cost` with uncommitted edits to `lib/status.mjs`, the snapshot tests
and the viewer's `shared/snapshot.ts`, `web/model.ts` and `web/Detail.tsx` — the same files. The
card is built on top of that work once it is committed, not beside it.

`fix/leaf-follows-parent` (worktree `agentics-leaf-follows`) is separate and unmerged. `behind` makes
the condition it fixes visible; it does not replace the fix.

## Tests

- `cardOf`, pure, over built event lists: each status yields the stop and next action the table
  says; a `noted` event never changes `deriveStatus`'s answer.
- Real git: `behind` counts the parent's commits a leaf lacks, and is null without a branch.
- Scenario harness: a run whose postflight fails still leaves its stops in `events.jsonl`.
- Viewer: `claudePrompt` for an escalated leaf carries the next action, the notes and the relaunch
  arguments.
