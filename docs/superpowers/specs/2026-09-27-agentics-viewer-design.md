# agentics viewer: a live board for efforts

Date: 2026-09-27 · Path: architectural (vf-superpowers brainstorming, frontend-design for the look) ·
Status: approved by the user · Supersedes the tree-viewer effort
(`docs/agentics/designs/2026-09-25-vscode-tree-viewer/root.md`, deleted with this spec).

Reference mockup: `2026-09-27-agentics-viewer-mockup.html` beside this file. It is a picture of
the look, hand-positioned and static. It is not product code.

## 1. Goal

A local web app that shows an agentics effort's tree live. You open a project folder, pick an
effort, and watch its nodes appear and change state as design and develop write to
`.agentics/`. When a node starts waiting on you, the page lights it up and Windows tells you. It
opens in the Claude desktop app's Browser pane, beside the chat, or in any browser.

## 2. Decisions

The user's rulings from the design conversation. They bind the plan.

| id | decision |
|---|---|
| D1 | A local web app with a rendered tree ("A local web app with a rendered tree is great"). |
| D2 | A separate tool, navigated to any local project folder, with an Open project button. |
| D3 | The tool gets status from agentics' CLI: agentics gains a read-only `snapshot` command and stays the only code that derives status. |
| D4 | The tree is a node-link tree diagram, left to right, with an outline list beside it. "After" edges show only for the selected node. |
| D5 | Open project lists projects found under configured roots, recent projects, and a Browse button that opens the native Windows folder dialog. |
| D6 | Clicking a node opens a detail panel with its details, and links that open its files in VS Code. |
| D7 | A node that newly parks or escalates is highlighted on the page and raises a Windows toast. |
| D8 | Beyond status, the page shows commits in running tasks and the effort's cost so far. It does not show the executions list or the Next line. |
| D9 | The page is built with Vite + Preact. |
| D10 | The look in §7 and the mockup ("Nice!"). |
| D11 | This replaces the VS Code tree viewer, and its design doc is deleted ("kill it. The web app is better"). |
| D12 | Carried from the tree-viewer effort: watch only; the viewer never writes under `.agentics/`. |
| D13 | Carried: the board redraws within about a second of a write. |
| D14 | Carried: an effort picker that defaults to the most recently active effort, finished efforts included. |
| D15 | Carried: runs alongside develop's todo list and changes nothing about it. |

### Defaults

Choices made during the design that are cheap to reverse and that nothing else consumes. The
user ruled on them together by approving this spec.

- The tool lives in a new top-level folder `agentics-viewer/` in the vanillafairy repository. It
  is not a plugin, and the marketplace manifest does not list it. The README gains a short
  "Tools" section naming it.
- TypeScript throughout. The server runs as `.ts` directly on Node 26 (type stripping), so it
  needs no build. The page is built by Vite.
- It listens on `127.0.0.1:5181`, changeable in the state file.
- Its own state lives in `~/.agentics-viewer/state.json`.
- Discovery scans `C:\work` four levels deep; eight recent projects are kept.
- Refresh timings: 300 ms quiet period, 1 s cap, 5 s commit poll, 10 s snapshot timeout.
- A project is watched only while a page is connected to it. A toast covers a hidden page, not a
  closed one.
- Windows only. The toast and the folder dialog use `powershell.exe`, and the typefaces are
  Windows system fonts with generic fallbacks.
- vanillafairy's `.gitignore` changes from `.claude/` to `.claude/*` plus
  `!.claude/launch.json`, so the launch entry is committed.

## 3. Scope

In scope:

- `snapshot` in agentics' `lib/status.mjs`, and a `store` field on `status.mjs list`, with their
  data-contract entry and tests.
- The viewer: server, page, tests, README, launch entry.

Out of scope:

- Any action that changes an effort: starting develop, answering a park, re-running a task.
- Changes to how or when agentics writes its state.
- The develop todo list.
- The Next line and the executions list (D8).
- macOS and Linux.
- Publishing the viewer anywhere.
- Watching a project no page is connected to.

## 4. Architecture

```
 project folder                     viewer server (Node 26)                 page (Vite + Preact)
 .agentics/ ──fs.watch────────────► watch → refresh ─── SSE: snapshot ────► header, annunciator,
 git branches ◄─poll while active── │        │                               outline, board, detail
                                    │        └─ diff → alert → powershell.exe toast
                                    └─ node <agentics>/lib/status.mjs snapshot --json
                                              │ reads .agentics/ and git, derives status
                                              ▼
                                         {payload, payload_digest}
```

There are two parts, and one contract between them:

1. **agentics** owns every derivation. `status.mjs snapshot` composes functions it already has:
   `readTree`, `deriveStatus`'s `last` event, `todoFor`'s stage, `approvalState` and the spec's
   blocking questions, `costOf`, and the store's path helpers.
2. **The viewer** runs that command and draws what it prints. It parses no agentics file itself,
   so a change in agentics' formats cannot make it lie. The server does read file modification
   times under the store, to pick the most recently active effort (D14). That is metadata, not
   content.

## 5. The snapshot contract (agentics)

### 5.1 Command

`node lib/status.mjs snapshot --repo <path> --effort <name> --json` prints agentics' usual
envelope `{payload, payload_digest}` and exits 0. `{error}` with exit 1 means the program failed.
Without `--json` it prints `renderTree`'s text, so the command is useful by hand too.

`status.mjs list --json` gains one field, `store`: the absolute, forward-slashed path of the
`.agentics/` directory agentics resolved (the main checkout's, even when `--repo` is a worktree or
a submodule). `snapshot` carries the same field.

### 5.2 Payload

```ts
{
  format: 1,
  store: string,                        // absolute .agentics/ path agentics read
  effort: string, about: string, seq_max: number, malformed: number,
  folders: Array<{
    id: string,                         // '.' for the root folder
    title: string,
    approval: 'none' | 'approved' | 'prepared' | 'edited',
    blocking: number,                   // open questions graded blocking
    spec: { path: string }
  }>,
  nodes: Array<{
    id: string, parent: string | null,  // parent null only for the root
    kind: string,                       // design | composite | leaf, passed through
    title: string, intent: string, context: string,
    rigor: string, role: string,
    locus: string[], deps: string[],    // deps = the compiled "after" edges
    acceptance: Array<{ text: string, check: string }>,
    status: string,                     // deriveStatus, passed through unchanged
    event: null | { kind: string, seq: number, reason?: string, detail?: string, return?: string, question?: string },
    stage: string | null,               // todoFor's activeForm for in-progress items, else null
    branch: string,
    worktree: string | null,            // only when the directory exists
    commits: null | { count: number, last_subject: string, last_at: string },
    files: { spec: { path: string, line: number | null }, briefs: string[], reports: string[] }
  }>,
  cost: {
    dispatches: number, tokens: number, tokens_unreported: number,
    per_leaf: Record<string, { dispatches: number, tokens: number, tokens_unreported: number }>
  }
}
```

### 5.3 Rules

- **Status** is whatever `deriveStatus` returns. The payload does not map, rename or filter it.
- **`event`** is `deriveStatus`'s `last` event for the node, with the payload fields of its kind
  (`escalated {reason, detail}`, `parked {return, question}`, and the others as DESIGN.md lists).
- **`commits`** is filled only for leaves whose status is `active`: `git log` from the parent
  folder's integration branch (`branchOf(effort, parentOf(id))`) to the leaf's branch, giving the
  count, the last subject and the last committer date (ISO). It is null when either branch is
  missing. Commit times are the only timestamps in the payload, since agentics orders by `seq`.
- **`files.spec`** is the folder's own `DESIGN.md` for a folder node, with a null line. For a task
  it is the parent folder's `DESIGN.md` at the task entry's line from `parseSpec`.
- **`files.briefs` / `files.reports`** list only files that exist, found by agentics' own naming
  (`briefPath`, `reportPath`) across the effort's executions.
- **`format`** is a single integer. Any change to the payload's field list bumps it, updates the
  contract entry, and updates the viewer in the same vanillafairy commit that moves the submodule
  pointer.
- **Read-only.** `snapshot` writes nothing: no lock file, no log line, no `seq`.

### 5.4 In agentics' repository

- The code lands on the `design-loop` branch, after the redesign's own changes to
  `lib/status.mjs` have merged, and ships in 4.0.0.
- `docs/DESIGN.md#data-contracts` gains a **Snapshot** entry: owner `lib/status.mjs`, restated in
  vanillafairy's `agentics-viewer/shared/snapshot.ts`. `docs/DESIGN.md#progress` gains a sentence
  saying the viewer reads it.
- Tests in agentics' suite, built on real-git fixtures like the store tests:
  - status, stage and event pass through unchanged, including a status `todoFor` does not know;
  - commits appear only for active leaves and count from the parent's integration branch;
  - `files` lists only briefs and reports that exist, and a task's spec line is its entry's line;
  - folder approval and blocking counts match `approvalState` and the spec's questions;
  - `store` names the main checkout's `.agentics/` when `--repo` is a linked worktree;
  - running `snapshot` leaves every file under `.agentics/` byte-identical.

## 6. The viewer server

### 6.1 Layout

```
agentics-viewer/
  package.json  package-lock.json  tsconfig.json  vite.config.ts  README.md
  shared/snapshot.ts        the payload type and FORMAT = 1; imported by server and page
  server/main.ts            start, health, routes, static files
  server/agentics.ts        find agentics, run status.mjs, check the envelope and format
  server/projects.ts        discovery, recent projects, the Browse dialog
  server/watch.ts           per-project watcher and the refresh scheduler
  server/alerts.ts          the watermark diff
  server/windows.ts         toast and folder dialog through powershell.exe
  server/state.ts           ~/.agentics-viewer/state.json
  web/index.html  web/main.tsx  web/styles.css
  web/model.ts              snapshot → view model (pure)
  web/*.tsx                 Header, Annunciator, Outline, Board, Detail, OpenProject
  test/                     vitest suites and fixtures
```

`tsconfig.json` sets `erasableSyntaxOnly` and `verbatimModuleSyntax`, and imports use `.ts`
extensions, so Node can run the server without a build.

### 6.2 Start

- `npm start` builds the page with Vite when `web/` is newer than `dist/`, then runs
  `node server/main.ts`.
- `agentics-viewer.cmd`, or `npm run app`, runs it with `--open`: the page also opens in the
  default browser, and when the viewer already runs, only the page opens. Opened from Explorer or
  a file manager (cmd started it with the file's own path), the `.cmd` reopens itself in a console
  of its own with `cmd /k`, so the console and any error stay on screen after the server stops;
  run from an existing console, it runs there and holds it.
- The server binds `127.0.0.1:<port>` (default 5181). `GET /api/health` answers
  `{app: 'agentics-viewer', version}`.
- If the port is taken and `/api/health` answers as the viewer, the new process prints the URL
  and exits 0. If something else holds the port, it exits 1 naming the port and the `port`
  setting.
- `.claude/launch.json` in vanillafairy gets an `agentics-viewer` entry (`npm start`, port 5181),
  so a session in vanillafairy can open it by name. Sessions in other projects open
  `http://127.0.0.1:5181` in the Browser pane.
- The page URL carries its state: `?project=<path>&effort=<name>&node=<id>`. A reopened tab lands
  where it was. With no `project`, the page opens the last project from the state file.

### 6.3 Finding agentics

In order:

1. `agentics_path` in the state file, if set.
2. Otherwise `installPath` of the first entry for `agentics@vanillafairy` in
   `~/.claude/plugins/installed_plugins.json`.

The server runs `node <path>/lib/status.mjs …` with `execFile` and a 10 s timeout. It checks the
result and turns each failure into a typed problem the page shows (§8):

- `agentics_missing`: no path, or no `lib/status.mjs` at it;
- `agentics_too_old`: the command reports an unknown command `snapshot`;
- `format_mismatch`: the payload's `format` differs from `FORMAT`;
- `snapshot_failed`: exit 1 with `{error}`, a timeout, or output that isn't the envelope.

The agentics version a message names is read from `<path>/.claude-plugin/plugin.json`.

During development `agentics_path` points at the `design-loop` checkout
(`C:/work/claude/vanillafairy/agentics`).

### 6.4 Projects

- **Found.** Folders under the configured roots (default `C:\work`, depth 4) that contain an
  `.agentics/` directory. The scan skips `node_modules`, `.git` and `.claude`. It runs when the
  Open project dialog asks for it, and the result is cached for 60 s.
- **Recent.** The last eight projects opened, newest first, in the state file.
- **Browse.** `POST /api/browse` runs `powershell.exe -NoProfile -STA` with
  `System.Windows.Forms.FolderBrowserDialog` and returns `{path}` or `{cancelled: true}`. The
  dialog is a desktop window and can open behind the app; the page says so while it waits.
- **Opening** a folder runs `status.mjs list --json` in it. The `store` field is what gets
  watched. The effort picker lists `list`'s efforts, showing `about` (or the effort name when
  `about` is empty) with the name beneath. It defaults to the effort whose files under
  `<store>/<effort>/` were modified most recently (D14).

### 6.5 Watching and refresh

- One watcher per project with at least one connected page: `fs.watch(store, {recursive: true})`,
  ignoring paths under `.state/context/` and files named `.lock`.
- **Scheduler**, per (project, effort):
  - a change starts a 300 ms quiet timer, and each further change restarts it;
  - a run is forced once 1 s has passed since the first unserved change, so a steady stream of
    writes still refreshes about once a second (D13);
  - one run at a time. A change during a run queues exactly one more run;
  - while any node in the last snapshot is `active`, a run also happens every 5 s, for commits;
  - the scheduler takes an injected clock, so tests drive time by hand.
- Each run executes `snapshot` for the effort and `list` for the picker. A result whose
  `payload_digest` equals the last one pushed is dropped.
- If the watcher errors, it is recreated. If recreating fails, the project falls back to a run
  every 2 s, and the server logs that it did.
- The last connected page leaving closes the watcher.

### 6.6 Alerts

- The state file keeps, per project and effort, `alerted_seq`: the highest park or escalation
  event `seq` already alerted.
- The first time an effort is opened, `alerted_seq` is set to the snapshot's `seq_max`. History
  raises no toast, though those nodes are still highlighted on the page.
- After each snapshot, every node whose status is `parked` or `escalated`, and whose `event.seq`
  is above `alerted_seq`, raises one toast. Then `alerted_seq` moves to the highest such `seq` and
  is saved.
- Toast wording: title "`<node name>` is waiting on you" with the question as the body, or
  "`<node name>` escalated" with the reason. The node name is the id's last segment.
- The toast runs through `powershell.exe` (Windows PowerShell 5.1, which can load WinRT types)
  using `Windows.UI.Notifications.ToastNotificationManager` under PowerShell's AppUserModelID. A
  failure is logged and never blocks a refresh.
- Alerts run only while the project is watched, meaning a page is connected (see Defaults).

### 6.7 API

| route | does |
|---|---|
| `GET /api/health` | `{app, version}` |
| `GET /api/projects` | `{found: [{path, name}], recent: [{path, name}]}` |
| `POST /api/browse` | `{path}` or `{cancelled: true}` or `{problem}` |
| `GET /api/stream?project=<path>&effort=<name>` | SSE: `efforts`, `snapshot`, `problem` and `stale` events; a comment heartbeat every 15 s |
| `GET /*` | the built page from `dist/` |

- There is no route that reads or serves a file from a project. The detail panel's text comes from
  the snapshot. File links are `vscode://file/<path>[:<line>]` links the browser hands to VS Code.
- Every request must carry `Host` equal to `127.0.0.1:<port>` or `localhost:<port>`. A request
  with an `Origin` header must carry the same origin. Anything else gets 403, so a website in
  another tab cannot pop dialogs or read the stream.
- `effort` without `project` is a 400. A `project` that doesn't exist sends a `problem` event
  (`project_gone`).

### 6.8 State file

`~/.agentics-viewer/state.json`, written atomically (write a temp file, then rename):

```json
{ "port": 5181, "roots": ["C:\\work"], "depth": 4, "agentics_path": null,
  "recent": ["C:\\work\\eva-plays-2"], "last": {"project": "...", "effort": "..."},
  "alerted": {"C:/work/eva-plays-2": {"<effort>": 108}} }
```

A missing or unreadable file means defaults, and the server logs it.

## 7. The page

### 7.1 Direction

The board borrows from control-room mimic panels and annunciators. High-performance HMI practice
(ISA-101) says grey is normal and colour is reserved for what needs a person. Alarms that nobody
has acknowledged flash until someone looks. Done is the normal end state, so merged work goes
quiet grey, not green. The page's first job is "does anything need me, and what's moving?" at a
glance. Its second job is "why is this node where it is?".

The one loud element is the annunciator strip. Everything else stays quiet.

### 7.2 Tokens

| token | light | dark | used for |
|---|---|---|---|
| `--board` | `#D6D9D2` | `#1D2124` | page background, the board |
| `--panel` | `#EEF0EB` | `#262B2F` | header, outline, detail |
| `--ink` | `#2B3035` | `#DADFD8` | text, live tracks |
| `--ink-2` | `#5E655F` | `#9AA29A` | secondary text |
| `--rule` | `#B9BEB6` | `#3A4146` | borders |
| `--quiet` | `#8C928A` | `#6E766F` | done borders and badges, quiet tracks and arrows |
| `--work` | `#2F6DB5` | `#6FA6E6` | working borders and badges, links, focus ring |
| `--hold` | `#D48A00` | `#F2B63A` | what needs you: borders, fills and badges |
| `--hold-lit` / `--hold-ink` | `#F2C14E` / `#3A2A00` | `#E8A92A` / `#3A2A00` | a lit waiting tile |
| `--stop` / `--stop-ink` | `#C2203A` / `#FFFFFF` | `#E0564C` / `#FFFFFF` | escalated borders, fills and badges, a lit escalation tile |
| `--good` | `#3E7D1F` | `#7FC75A` | a done status word, a copied path |
| `--dep` | `#6B4FC8` | `#A992F2` | the selected node's dependency arrows, a highlighted blocker |

The page follows `prefers-color-scheme`, and gives `body` an explicit background.

**Type**

- **Bahnschrift** (Windows' DIN 1451 face) for everything the system states: names, states,
  counts, controls. Tabular numerals. Node names use its semi-condensed width
  (`font-stretch: 87.5%`) at weight 600.
- **Sitka Text** (Windows' screen serif) for what people wrote: the task's title, the question,
  the reason, context, criteria. Size 15 px, line-height 1.55 to 1.6, measure at most 62ch.
- **Cascadia Mono** only for check commands, which are code.
- Fallbacks: Bahnschrift → `system-ui`; Sitka Text → Georgia, `serif`; Cascadia Mono → Consolas,
  `monospace`.
- Scale: 12.5 px secondary, 14 px base, 15 px prose and folder names, 20 px the detail panel's
  name.
- Sentence case everywhere. No all-caps labels, no dot-joined meta strings.

### 7.3 Status and facts

Status comes from the snapshot. The page words it from your side: a status badge, tinted and
outlined in the block's colour, then one line per fact. The raw agentics status stays visible in
the detail panel's first line. Hovering a block or row shows status and facts in one phrase.

| status | block | badge | facts |
|---|---|---|---|
| `active` | `--work` border | the stage: "implementing", "writing tests", "in review", "fix round 2"; "working" for a folder | "3 commits" when there are commits; "`n` of `m` merged" for a folder |
| `approved` | `--work` border | "awaiting merge" or "held" (from `stage`) | none |
| `parked`, with its own event | `--hold` border and a 16 % `--hold` fill | "waiting on you" | none |
| `escalated`, with its own event | `--stop` border and a 16 % `--stop` fill | "escalated" | none |
| `parked` or `escalated` with no event (agentics rolls a descendant's status up to every ancestor) | `--rule` border | none: the border says it | what is below: "1 escalated", "2 waiting on you", "4 need design" |
| `merged`, `integrated`, `landed` | recessed: `--board` fill, `--quiet` border, name in `--ink-2` | "merged", "integrated", "landed" | none |
| `planned` | `--rule` border | "queued" | "`n` of `m` merged" for a folder |
| `open` (a design node) | dashed `--hold` border and a 16 % `--hold` fill: it needs you to design it | "needs design" | "`n` blocking questions" from its folder's DESIGN.md; "not approved" or "edited since approval"; "design not started" when it has no folder of its own yet |
| anything else | `--rule` border | the raw status | none |

Amber and red mean the node itself needs you: it is parked with its own event, escalated with its own event, or a design node. Every ancestor of such a node gets a 1.5 px border
in the same colour and no fill (red wins when both are below), so the path to it is traceable.

A node with unmet `deps` shows a waits-on badge: an hourglass and the count of unmet
dependencies, the same size for any count, at the top right of its block and at the end of its
outline row. Being blocked is not a call for attention, so the badge is `--ink-2`.

A folder whose whole subtree is merged draws its tracks in `--quiet` at 1.5 px. Live tracks are `--ink` at
2 px.

### 7.4 Layout

Wide (at least 900 px):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Project eva-plays-2] [Effort Reshape pets onto…]   412k tokens [Open project] │ header
├──────────────────────────────────────────────────────────────────────────┤
│ [● idle-rules is waiting on you ] [● features escalated ]   ● 2 working …  │ annunciator
│ [  What idleness is exactly: …  ] [  Verify failed after… ]                │
├────────────┬─────────────────────────────────────────┬───────────────────┤
│ Find a node│                                         │ foundations/idle-  │
│ ● reshape  │      board: tree, left to right,        │ rules, task, …     │
│  ● found…  │      pan and zoom, [+][−][fit]          │ idle-rules         │
│   ● entity │                                         │ title (serif)      │
│   ● action │                                         │ ▌Waiting on you    │
│ 250 px     │                                         │ 360 px             │
└────────────┴─────────────────────────────────────────┴───────────────────┘
```

Narrow (under 900 px, the usual size of the pane beside the chat):

```
┌──────────────────────────────────┐
│ [List] [eva-plays-2] [Reshape…] [Open project] │
│ [● idle-rules…     ] [● features…]  │
│                                  │
│        board (full width)        │
│                                  │
├──────────────────────────────────┤
│ detail as a bottom sheet, 52 %   │
└──────────────────────────────────┘
```

In wide mode the outline's right edge is a drag handle. The outline starts at 250 px and can be
dragged between 160 and 560 px. The arrow keys move the focused handle 16 px at a time, and Home
or a double-click resets it. The width is remembered per browser in `localStorage`, like the theme.

In narrow mode the outline opens as a drawer from the List button, the pickers drop their
"Project" and "Effort" prefixes, and the cost and the counts line are hidden. Long picker labels
end with an ellipsis.

### 7.5 Components

**Header.** Project picker (opens Open project), effort picker (a list of the project's efforts,
most recently active first), cost ("412k tokens over 23 dispatches", with "and 2 unreported" when
`tokens_unreported > 0`), and the Open project button (the only filled button).

**Annunciator.**

- One tile per node whose status is `parked` or `escalated`: escalations first, then parks, each
  group by `event.seq` descending.
- A tile's first line is "`<name>` is waiting on you" or "`<name>` escalated". Its second line is
  the question or the reason, cut to one line.
- A tile is lit: `--hold-lit` with `--hold-ink`, or `--stop` with `--stop-ink`.
- A tile flashes (a 1.1 s step animation) until you open its node. After that it stays lit and
  steady. Acknowledged tiles are remembered per browser in `localStorage`, keyed by project,
  effort, node and `event.seq`. The code wraps storage in try/catch, and without storage a tile
  simply flashes until it clears.
- With `prefers-reduced-motion: reduce` a tile doesn't flash. It gets an inset 2 px outline
  until you open it.
- Clicking a tile selects its node.
- To the right, on wide screens: counts ("2 working", "1 merged", "1 queued", "3 need design").
- With no tiles, only the counts line shows.
- The tab title names the effort and carries the count of lit tiles: "(2) Agentics Viewer:
  <effort>"; with no effort chosen it is "Agentics Viewer".

**Outline.**

- A "Find a node" field filters by name and title.
- Rows are the tree in depth-first order, indented by depth, each with the name and the status
  badge, or the facts for a node with no badge. Folder rows collapse.
- The selected row has a 3 px `--ink` inset bar.
- Up and Down move the selection, Left and Right collapse and expand, Enter opens the detail
  panel.

**Board.**

- Layout: `d3-hierarchy` `tree()` with a fixed node size (about 170 by 48 px blocks, 60 px
  between rows, 230 px between depths), left to right. Tracks are orthogonal elbows, drawn in
  SVG by Preact.
- Scale: 1:1 by default, centered. The fit button fits the whole tree and never scales above 1.
  Zoom and pan use `d3-zoom` on the SVG.
- Blocks: an 8 px radius, the name, the status badge, then the facts, one per line.
- Selecting a node (click, outline, tile or URL):
  - it gets a thicker border, in `--ink`, or in its own amber or red;
  - its dependency arrows turn `--dep` (violet) and draw over the rest;
  - the board pans the node, and the rail gap beside it, into the visible area: the strip above
    the bottom sheet in narrow mode, and the area between the outline and the detail panel in
    wide mode. The pan animates over 250 ms, or jumps with reduced motion.
- Dependencies: every `deps` edge is always drawn, blocker to blocked, as a solid arrow in the
  track colour (`--quiet` once the blocker is done), its head on the blocked end. It leaves the
  blocker's right side from the lower half and enters the blocked node's right side in the upper
  half, each edge at its own point, and runs on a rail in the gap right of the rightmost column it
  touches. In one gap, edges that overlap vertically take separate rails, a contained edge inside
  the one containing it, so edges nest; edges that don't overlap share the innermost rail they
  fit; many rails squeeze to fit the gap.
  Dashes on the board mean "needs design" and nothing else.
- Hovering a waits-on badge, or a row of the detail panel's relation lists, rings the nodes it
  names with a 2.5 px `--dep` border.
- New nodes appear without animation. The tree keeps the current zoom and pan across
  refreshes.
- Orphans: a node whose `parent` is not in the snapshot sits under the root with a `--stop`
  badge: "parent missing: `<parent id>`".

**Detail panel.**

- First line (12.5 px, `--ink-2`): the node id, the kind, the rigor, and the raw status. For
  example: "foundations/idle-rules, task, tdd-pair, parked".
- The name (20 px), then the title in Sitka Text.
- The status word is amber when the node itself waits on you, red when it escalated, green when
  done, `--ink` otherwise. A node parked or escalated only through its descendants shows its
  summary wording there instead of the raw status.
- "Waits on `n`" and "Holds up `n`": the unmet dependencies and the nodes this one still blocks,
  one row each with the name and the status badge. A row selects that node. Past five rows the rest
  fold behind "and `n` more".
- A state block for a node that itself is parked or escalated: a 4 px left bar in `--hold` or
  `--stop`, and a 7 % tint of that colour on `--panel`.
  - Parked: heading "Waiting on you" with the `return` in words ("needs a decision",
    "needs design", "needs the spec fixed", "can't tell from the evidence"), then the question in
    full, in serif.
  - Escalated: heading "Escalated" and the reason, with the detail beneath.
- For active tasks, a line with the stage and "3 commits, last 4 min ago: `<subject>`". The
  "ago" is computed on the page from `last_at` and refreshes every 30 s.
- **Context**, in serif. Intent and context are rendered as inline markdown through `marked`, then
  sanitised by DOMPurify.
- **Criteria**: a checklist. Each item's `check` command is shown in Cascadia Mono beneath it.
  `HUMAN:` items drop the prefix and carry a "You decide" tag.
- **Files**, each a `vscode://file/` link with a copy-path button beside it:
  - "Spec in `<folder>/DESIGN.md`" with its line number;
  - "Brief, `<role>` round `<n>`" and "Report, `<role>` round `<n>`";
  - "Worktree".
  - I'm not sure the desktop app's Browser pane hands `vscode://` links to VS Code. The copy
    button is the fallback.
- **Writes**: the locus paths.
- **Spend**: the node's tokens and dispatches from `cost.per_leaf`, with "and `n` unreported" when
  some dispatches didn't report tokens.
- Folder nodes also show their spec's approval state in words, and the count of blocking
  questions.

**Open project.**

- A dialog with three groups: **Found**, **Recent** and a **Browse…** button.
- Each project row shows its folder name, with the full path beneath.
- While Browse waits: "The folder dialog is open. It may be behind this window."

### 7.6 Quality floor

- Keyboard reachable throughout, with a visible 2 px `--work` focus ring.
- Contrast: text on lit tiles uses the paired ink colours above.
- Reduced motion respected (tiles, board pan).
- Usable from 360 px wide up.
- The page never renders spec text as raw HTML.

## 8. Errors and empty states

A partial result never looks whole.

| situation | what the page shows |
|---|---|
| `agentics_missing` | In place of the board: "The viewer can't find agentics. It looked at `<path>`. Install agentics, or set `agentics_path` in `~/.agentics-viewer/state.json`." |
| `agentics_too_old` | "agentics `<version>` at `<path>` has no snapshot command. It arrives in agentics 4.0.0." |
| `format_mismatch` | "This viewer reads snapshot format 1. agentics at `<path>` writes format `<n>`. Update agentics-viewer." |
| `snapshot_failed` with a board already shown | The board stays, with a slim bar above it: "Showing the board from `<hh:mm>`. The last refresh failed: `<error>`." The next change retries. |
| `snapshot_failed` with no board yet | In place of the board: "The first refresh failed: `<error>`." |
| `malformed > 0` | A slim bar: "`<n>` lines in the logs couldn't be read, so the board may be missing nodes." It clears when a later snapshot reads clean. |
| server unreachable | A slim bar: "Lost the viewer server. Reconnecting." The board is marked stale until EventSource reconnects. |
| `project_gone` | "This project folder is gone: `<path>`", with Open project. |
| no project yet | "Open a project to watch its efforts.", with Open project. |
| project without efforts | "No efforts in `<project name>` yet. Start one with /agentics:design." |
| an effort with no nodes (still in design, nothing compiled) | In place of the board, with no outline: "This effort has no tasks yet. They appear once its design is approved." |
| an effort with only its root | The root block, worded from its folder's approval state. |
| Browse fails | In the dialog: "Couldn't open the folder dialog: `<reason>`." |
| toast fails | Nothing on the page. The server logs it. |

## 9. Testing

`npm test` in `agentics-viewer/` runs `tsc --noEmit && vitest run`. Each test is named by the
mistake it catches. Logic sits in pure modules (`web/model.ts`, `server/alerts.ts`, the
scheduler), so no unit test needs a DOM. Fakes are a few lines of plain code, not mocks, and time
is driven by hand through an injected clock.

- **Alerts:**
  - a park above the watermark raises exactly one alert and moves the watermark;
  - the first open raises none;
  - the same snapshot twice raises none;
  - an escalation cleared and re-raised at a higher `seq` alerts again.
- **Scheduler:**
  - one change runs once after the 300 ms quiet period;
  - steady changes run at least once a second;
  - a change during a run queues exactly one run;
  - the 5 s poll runs only while something is active.
- **Locator:**
  - the override wins;
  - `installed_plugins.json` resolves `agentics@vanillafairy`;
  - each of `agentics_missing`, `agentics_too_old`, `format_mismatch` and `snapshot_failed` comes
    out of its trigger.
- **Discovery** (temp directory tree): it finds `.agentics/`, skips `node_modules`, `.git` and
  `.claude`, and stops at the depth limit.
- **HTTP:** a foreign `Host` or `Origin` gets 403; `/api/health` identifies the viewer; a second
  start against a running viewer exits 0.
- **State file:** a corrupt file falls back to defaults; a write is atomic.
- **View model:**
  - every status in §7.3 maps to its badge and facts, and an unknown status shows its raw name;
  - tile order and counts are right;
  - the selected node's incoming and outgoing `deps` are right;
  - an orphan is placed under the root with its marker;
  - folder "n of m merged" is right.
  Expected values are computed from fixture snapshots, not pinned literals.
- **Wiring:** the server runs against a fixture project and a fake agentics, a short script
  printing a snapshot built from the fixture's files. Appending a line to the fixture's
  `events.jsonl` delivers a new `snapshot` event over SSE within 1.5 s.
- **Watch only (D12):** after the wiring test, every file under the fixture's `.agentics/` is
  byte-identical to before.
- **Checked by the user:** the look narrow and wide, in both themes, against the mockup; a real
  toast appearing; the folder dialog opening; a `vscode://` link opening VS Code.

## 10. Delivery

1. **Spike, first:** prove on this machine that `powershell.exe` raises a WinRT toast and opens
   `FolderBrowserDialog` when spawned from Node. If either fails, stop and bring the user the
   alternative. For toasts that means page-only alerts; for the dialog, a path field. Don't
   build on a broken assumption.
2. **agentics:** `snapshot`, the `store` field on `list`, the contract entry and the tests, on
   `design-loop` (§5.4).
3. **Viewer server:** state, locator, projects, scheduler, alerts, windows, HTTP and SSE, all
   against the fake agentics.
4. **Page:** view model first, then the components, following the mockup.
5. **Integration:** point `agentics_path` at the `design-loop` checkout, open eva-plays-2, and run
   the user checks.
6. **Repo chores:** the README "Tools" section, the `.gitignore` change and `.claude/launch.json`.

## 11. Dependencies

Pinned exact, no ranges. Versions checked against npm on 2026-09-27.

| package | version | licence | why |
|---|---|---|---|
| preact | 10.29.8 | MIT | UI (D9) |
| d3-hierarchy | 3.1.2 | ISC | tree layout |
| d3-zoom | 3.0.0 | ISC | pan and zoom |
| d3-selection | 3.0.0 | ISC | d3-zoom's binding to the SVG |
| d3-transition | 3.0.1 | ISC | the animated pan to a selected node |
| marked | 18.0.14 | MIT | inline markdown in intent and context |
| dompurify | 3.4.16 | MPL-2.0 or Apache-2.0 | sanitising that markdown |
| vite (dev) | 8.3.1 | MIT | build |
| @preact/preset-vite (dev) | 2.10.6 | MIT | Preact in Vite |
| typescript (dev) | 7.0.2 | Apache-2.0 | typecheck |
| vitest (dev) | 5.0.2 | MIT | tests |
| @types/node (dev) | 26.6.3 | MIT | types |
| @types/d3-hierarchy, -zoom, -selection, -transition (dev) | 3.1.7, 3.0.8, 3.0.12, 3.0.9 | MIT | types |

The server has no runtime dependencies. Each library sits behind one module of ours:
`web/layout.ts` for d3-hierarchy, `web/zoom.ts` for d3-zoom, d3-selection and d3-transition, and
`web/markdown.ts` for marked and DOMPurify. Swapping one is a one-file change.

## 12. Open questions

- **lookup:** Does the desktop app's Browser pane pass `vscode://` links to VS Code? Settled at
  integration (§10.5). The copy-path button covers a no.
- **lookup:** Does Node 26's `fs.watch` with `recursive` report writes inside `.agentics/.state/`
  promptly on this machine? The watch-path probe on 2026-09-27 saw a write to `.state/seq`
  straight away. The 2 s polling fallback covers a no.

## 13. Success criteria

1. Open project lists eva-plays-2 under Found, keeps recent projects, and Browse opens the native
   folder dialog. Choosing a project shows its most recently active effort.
2. The board draws every live node of the effort as a left-to-right tree, each badge and facts
   from its derived status. The outline shows the same nodes in the same states.
3. A write under the effort's `.agentics/` reaches the board within about a second. A commit on a
   running task shows within 5 s.
4. A node that newly parks or escalates lights a flashing tile and raises exactly one Windows
   toast. Opening an effort for the first time raises none.
5. Clicking a node shows its detail panel with the fields in §7.5, and its file links open in VS
   Code or copy their path.
6. Nothing under `.agentics/` changes because of the viewer or `snapshot`.
7. Each situation in §8 shows its message. The page never presents a partial board as whole.
8. The page works from 360 px to wide, in light and dark themes, by keyboard, and with reduced
   motion.
