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

`cardOf` in `lib/status.mjs` builds a node's card from the tree, the events, the journals and git.
Nothing stores it; GP5 stands. The snapshot's `status`, `stage` and `event` stay where they are
(`event` gains `said`, its author's file); the card is what is new beside them.

| field | holds | from |
|---|---|---|
| `next` | for an unmerged leaf: `{action, why}`, the resume ladder's row. Null otherwise | `resumeLeaves` in `lib/resume.mjs` |
| `behind` | how many commits the folder's branch has that the leaf's lacks; null unless the leaf is unmerged and both branches exist | `git rev-list --count leaf..folder` |
| `report` | `{path, lead}`: the report of the node's latest dispatch that left one, and its first paragraph of prose | `.state/reports/` |
| `notes` | every `noted` event of the node, newest first: `{seq, by, text}` | events |
| `relaunch` | `{execution, root, retry_escalated}`: the latest open execution whose root is the node or above it, and the node's id in `retry_escalated` when it escalated itself. Null when none holds it | `executionSummary` |

Two readers, one shape:

- `node lib/status.mjs node --repo <r> --effort <e> --node <id> [--json]` prints one node's entry
  of the snapshot. The text form ends with the relaunch arguments.
- `snapshotOf` carries `card` on every node; the format is 3.

The resume ladder is asked once for all the unfinished leaves of a read, never once per node.

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

A stop the workflow decides rides to disk in the next `schedule` or in `postflight`. When the
couriers fail at the end of a run, the stop stayed in the workflow's result and reached no disk:
the node read `planned` and the viewer drew it queued while nothing ran.

The workflow has no filesystem, but the session that launched it has a shell. So:

- records a boundary refused, or that no courier carried, go back on the pending list;
- when postflight cannot be carried, the result holds its command whole, in
  `coverage.resumable.postflight`, and develop's step 4 runs it first, as it stands. The records
  land under the same digest and the same ids.

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
- Snapshot: `card`, `event.said`, the format number; `agentics-viewer/shared/snapshot.ts`.
- Boundary payloads: `note`. Coverage block: `resumable.postflight`.
- GP5's text gains one sentence: a note is an observation, recorded by its actor.
- `skills/develop/SKILL.md` within its size budget.

## Landed

agentics 4.9.0 and agentics-viewer 3.0.0. `fix/leaf-follows-parent` (worktree
`agentics-leaf-follows`) is separate and still unmerged: `behind` makes the condition it fixes
visible, and does not replace the fix.

## Tests

- `cardOf`, pure, over built event lists: each status yields the stop and next action the table
  says; a `noted` event never changes `deriveStatus`'s answer.
- Real git: `behind` counts the parent's commits a leaf lacks, and is null without a branch.
- Scenario harness: a run whose postflight fails still leaves its stops in `events.jsonl`.
- Viewer: `claudePrompt` for an escalated leaf carries the next action, the notes and the relaunch
  arguments.
