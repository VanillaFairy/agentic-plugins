# Execution tree viewer for VS Code

Effort `2026-09-25-vscode-tree-viewer`, node `.`, level `context`.

## Intent

**Who it's for.** Victor, watching his own agentics efforts from VS Code. It's a personal tool
that lives in this repo and gets installed locally as a `.vsix`.

**The outcome.** A graph of an effort's execution tree in an editor tab. It grows as the planner
adds nodes, recolours as nodes change status, and flags escalations and parks when they happen.
The Claude Code desktop app can't host a custom pane, so VS Code is where this view lives.

**Success criteria.**

1. Opening the viewer shows the most recently active effort among the workspace's repos. A picker
   switches to any other effort, finished ones included.
2. The tree is drawn as a node-link graph, each node coloured by its derived status.
3. Within about a second of any write to the effort's logs, the graph shows the new nodes and
   statuses without being reopened.
4. An escalated or parked node is highlighted in the graph. The first time a node enters either
   state, a VS Code notification says so.
5. Clicking a node opens a detail panel with its intent, kind, rigor, locus, acceptance criteria and
   the event that set its status (reason, detail or question). From there you can open its design
   doc, briefs, reports and worktree.
6. The viewer never writes anything under `.claude/agentics/`.

**Boundaries.** It reads the effort store as agentics writes it today: append-only
`nodes.jsonl` and `events.jsonl` in the main checkout's `.claude/agentics/efforts/<effort>/`, with
status derived on read. It has to cope with torn last lines and with status values it doesn't
recognise.

**Out of scope.**

- Any action that changes the effort, such as starting develop or re-running a leaf.
- Changes to how or when agentics writes its state.
- Replacing or changing the todo list develop keeps in Claude Code.
- Publishing to a marketplace.

## Level

`context`. This is the root, so no level is skipped.

## Decisions

| id | decision | why |
|---|---|---|
| D1 | Watch only. | It can't corrupt a running develop, and it's the smallest thing that gives the missing dashboard. |
| D2 | Me, in this repo: a new top-level folder in vanillafairy, installed locally as a `.vsix`. | No marketplace work, and it versions together with the agentics state format it reads. |
| D3 | Graph in an editor tab: a webview that draws the tree as a node-link diagram. | A picture shows shape and parallelism that an outline hides. |
| D4 | A picker, defaulting to the latest effort. | Covers watching the run in progress without losing access to finished runs. |
| D5 | Mirror the disk: redraw within about a second of a write, and accept that develop writes status in batches. | Keeps the viewer read-only and leaves agentics untouched. |
| D6 | Clicking a node opens a detail panel with links to its design doc, briefs, reports and worktree. | The status alone doesn't say why a node is stuck. The deciding event and the files do. |
| D7 | Graph plus notification: highlight escalated and parked nodes, and notify when one first appears. | That's when a run is waiting on you. |
| D8 | Runs alongside the todo list. | Nothing in agentics changes. The extension is an extra view. |

## The design

At `context` this is the intent above. The next level, `container`, is written just in time as the
child design node `viewer`. It has to decide how the extension gets the tree (reuse
`agentics/lib/tree.mjs`'s `readTree`/`deriveStatus`, or reimplement them against the on-disk
format), and what contract ties the extension to that format.

## Approaches

Skipped at this level. Context states the intent, and there's no design space to draw approaches
from until `container`.

## Open questions

- **lookup:** Do the boundary couriers for leaves running in worktrees always pass the main repo as
  `--repo`? If any passes the worktree, the viewer would have to watch there too. To answer at
  `container` from `agentics/workflows` and `agentics/lib/boundary.mjs`.
- **lookup:** Status values are string literals in `deriveStatus` with no enum. At `container`,
  decide whether reuse removes the drift or the viewer falls back to a generic style.
- **parked (reopens at `component`):** Node records carry no timestamps, and ordering is by `seq`
  only. Any "when" the detail panel shows has to come from file mtimes or the execution stamp.
- **parked (reopens at `component`):** Which graph layout and rendering library the webview uses.
  An outward search runs at that level, because this is a capability we'd otherwise build.
- **compost:** Publishing to the VS Code Marketplace or Open VSX.

## Evidence

Survey `20260925-162517-survey.json`, anchored at `e4713bf`, ground `agentics/lib`,
`agentics/workflows`, `agentics/skills`.

Coverage: `complete: false`, with `node-schema` incomplete because its scout marked the search
non-exhaustive. Nothing at this level depends on the gap. The survey read `deriveStatus`,
`normalizeNode` and `nodeProblems` in full, and those cover every status and enum literal. The
survey also left these unread, and the `container` level has to settle them:

- which boundary action writes each `dispatched`, `approved` and `merged` event, and when;
- the event payload fields, checked only against `DESIGN.md`;
- the `--repo` value that worktree-side couriers pass.

The outward search wasn't run at this level. It belongs to `component`, where rendering gets
chosen.

Probe: not earned. The document is short and this level provides no contract other nodes consume.
