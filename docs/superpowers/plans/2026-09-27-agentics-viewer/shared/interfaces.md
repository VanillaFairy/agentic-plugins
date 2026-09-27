# Shared interfaces

Every name here is exact. A task that produces one implements it as written; a task that
consumes one uses it as written.

## Snapshot contract (agentics ↔ viewer)

**Produced by:** T02b (`lib/status.mjs` in agentics) and T04 (the TypeScript copy).
**Consumed by:** T05, T08, T09, T10a/b, T11–T14.

`node <agentics>/lib/status.mjs snapshot --repo <path> --effort <name> --json` prints one line,
`{"payload": <Snapshot>, "payload_digest": "<8 hex>"}`, and exits 0.
`node <agentics>/lib/status.mjs list --repo <path> --json` prints
`{"payload": <EffortsList>, "payload_digest": ...}`.
Either prints `{"error": "<message>"}` and exits 1 when the program fails. An unknown command's
message starts `unknown command "snapshot"`.

```ts
// agentics-viewer/shared/snapshot.ts
export const FORMAT = 1

export type Approval = 'none' | 'approved' | 'prepared' | 'edited'

export interface SnapshotEvent {
  kind: string
  seq: number
  reason?: string
  detail?: string
  return?: string
  question?: string
}

export interface SnapshotFolder {
  id: string                      // '.' for the root folder
  title: string
  approval: Approval
  blocking: number
  spec: { path: string }
}

export interface SnapshotNode {
  id: string
  parent: string | null           // null only for the root '.'
  kind: string                    // 'design' | 'composite' | 'leaf', passed through
  title: string
  intent: string
  context: string
  rigor: string
  role: string
  locus: string[]
  deps: string[]
  acceptance: Array<{ text: string; check: string }>
  status: string
  event: SnapshotEvent | null
  stage: string | null
  branch: string
  worktree: string | null
  commits: { count: number; last_subject: string; last_at: string } | null
  files: { spec: { path: string; line: number | null }; briefs: string[]; reports: string[] }
}

export interface Snapshot {
  format: number
  store: string
  effort: string
  about: string
  seq_max: number
  malformed: number
  folders: SnapshotFolder[]
  nodes: SnapshotNode[]
  cost: {
    dispatches: number
    tokens: number
    tokens_unreported: number
    per_leaf: Record<string, { dispatches: number; tokens: number; tokens_unreported: number }>
  }
}

export interface EffortListing {
  effort: string
  about: string
  root_status: string
  seq_max: number
  malformed: number
}

export interface EffortsList {
  repo: string
  store: string                   // present whether or not the store exists
  store_present: boolean
  efforts: EffortListing[]        // agentics sends more fields; the viewer reads these
  notes: string
}

export type ProblemCode =
  | 'agentics_missing' | 'agentics_too_old' | 'format_mismatch' | 'snapshot_failed' | 'project_gone'

export interface Problem {
  code: ProblemCode
  path?: string                   // agentics path, or the project path for project_gone
  version?: string                // agentics version, when known
  format?: number                 // the format agentics wrote, for format_mismatch
  detail?: string                 // the error text, for snapshot_failed
}
```

## Clock

**Produced by:** T04. **Consumed by:** T06, T07a/b, T09.

```ts
// agentics-viewer/server/clock.ts
export type TimerHandle = { readonly id: number }
export interface Clock {
  now(): number                                    // ms since epoch
  setTimeout(fn: () => void, ms: number): TimerHandle
  clearTimeout(h: TimerHandle): void
}
export const realClock: Clock
```

```ts
// agentics-viewer/test/fake-clock.ts (T04): a hand-driven clock for tests
export interface FakeClock extends Clock {
  advance(ms: number): void        // runs every due timer in due-time order, including timers they schedule
  pending(): number                // timers not yet run
}
export function fakeClock(start?: number): FakeClock
```

## State file

**Produced by:** T05. **Consumed by:** T06, T09.

```ts
// agentics-viewer/server/state.ts
export interface ViewerState {
  port: number
  roots: string[]
  depth: number
  agentics_path: string | null
  recent: string[]
  last: { project: string; effort: string } | null
  alerted: Record<string, Record<string, number>>   // project key → effort → seq
}
export const DEFAULT_STATE: ViewerState  // { port: 4747, roots: ['C:\\work'], depth: 4, agentics_path: null, recent: [], last: null, alerted: {} }
export function statePath(home: string): string   // join(home, '.agentics-viewer', 'state.json')
export function readState(file: string): { state: ViewerState; problem: string | null }
export function writeState(file: string, state: ViewerState): void
export function addRecent(state: ViewerState, project: string): ViewerState
export function projectKey(project: string): string  // forward slashes, no trailing slash, lower-case drive letter
```

- `readState`:
  - a missing file gives `DEFAULT_STATE` with problem `null`;
  - an unreadable or malformed file gives `DEFAULT_STATE` with a problem naming the file;
  - a key that is missing or has the wrong type takes its default;
  - unknown keys are dropped.
- `writeState` creates the directory, writes `<file>.tmp`, then renames it over `file`.
- `addRecent` is pure: it puts the project first, removes an earlier entry with the same
  `projectKey`, and keeps at most eight.

## agentics locator and runner

**Produced by:** T05. **Consumed by:** T09.

```ts
// agentics-viewer/server/agentics.ts
import type { Snapshot, EffortsList, Problem } from '../shared/snapshot.ts'
export interface AgenticsLocation { path: string; version: string }
export function locateAgentics(opts: { override: string | null; installedPlugins: string }): AgenticsLocation | Problem
export type RunResult<T> = { ok: true; payload: T; digest: string } | { ok: false; problem: Problem }
export function runSnapshot(loc: AgenticsLocation, project: string, effort: string, opts?: { timeoutMs?: number }): Promise<RunResult<Snapshot>>
export function runList(loc: AgenticsLocation, project: string, opts?: { timeoutMs?: number }): Promise<RunResult<EffortsList>>
```

- `locateAgentics`:
  - `override` wins when non-null;
  - otherwise it reads `installedPlugins` (a path to `installed_plugins.json`) and takes
    `plugins["agentics@vanillafairy"][0].installPath`;
  - the result is `agentics_missing` with the tried `path` when neither gives a directory
    holding `lib/status.mjs`;
  - `version` is read from `<path>/.claude-plugin/plugin.json`, and is `''` when unreadable.
- The runners use `execFile(process.execPath, [<path>/lib/status.mjs, cmd, '--repo', project, …, '--json'])`
  with a default timeout of 10 000 ms. Arguments are an array, so paths with spaces pass
  through intact.
- Problems from the runners:
  - `agentics_too_old` when the error text starts `unknown command "snapshot"`;
  - `format_mismatch` (carrying `format`) when `payload.format !== FORMAT`;
  - `snapshot_failed` (carrying `detail`) for exit 1 with `{error}`, a timeout, or output that
    isn't the envelope.
  - Every problem carries `path` and `version`.
- `runList` has no format check. The list has no `format` field.

## Projects

**Produced by:** T06. **Consumed by:** T09.

```ts
// agentics-viewer/server/projects.ts
import type { Clock } from './clock.ts'
export interface ProjectRef { path: string; name: string }   // name = the folder's base name
export function discoverProjects(roots: string[], depth: number): ProjectRef[]
export function createDiscovery(clock: Clock, ttlMs?: number): { list(roots: string[], depth: number): ProjectRef[] }
export function recentProjects(recent: string[]): ProjectRef[]
export function latestEffort(store: string, efforts: string[]): string | null
```

- `discoverProjects` returns every directory at most `depth` levels below a root that contains an
  `.agentics` directory, including the root itself. It doesn't descend into `node_modules`,
  `.git`, `.claude` or `.agentics`, and skips directories it can't read. Results are sorted by
  path.
- `createDiscovery` caches by roots and depth for `ttlMs`, 60 000 by default.
- `recentProjects` maps paths to refs, dropping paths that no longer exist.
- `latestEffort` picks the effort with the newest mtime among `<store>/<effort>/.state/*.jsonl`
  and every `DESIGN.md` under `<store>/<effort>/`. Ties go to the larger name. It returns `null`
  for an empty list.

## Windows side effects

**Produced by:** T06. **Consumed by:** T09.

```ts
// agentics-viewer/server/windows.ts
export function toastScript(title: string, body: string): string
export function folderDialogScript(): string
export function showToast(title: string, body: string): Promise<void>
export type FolderPick = { path: string } | { cancelled: true } | { error: string }
export function pickFolder(): Promise<FolderPick>
```

- The scripts are the ones T01 proved, recorded in `knowledge/windows-powershell.md`.
- `toastScript` embeds `title` and `body` so that no value can break out of the script or the
  toast XML: single quotes doubled for PowerShell, and `& < > " '` escaped for XML.
- `showToast` and `pickFolder` spawn `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -`
  (plus `-STA` for the dialog) and write the script to stdin. `showToast` never rejects. It logs
  and resolves.

## Refresh scheduler and store watcher

**Produced by:** T07b (tests by T07a). **Consumed by:** T09.

```ts
// agentics-viewer/server/watch.ts
import type { Clock } from './clock.ts'
export interface SchedulerOptions { quietMs?: number; capMs?: number; pollMs?: number }  // 300, 1000, 5000
export interface Scheduler {
  notify(): void
  setActive(active: boolean): void
  dispose(): void
}
export function createScheduler(run: () => Promise<void>, clock: Clock, opts?: SchedulerOptions): Scheduler
export function isIgnored(relativePath: string): boolean
export function watchStore(store: string, onChange: () => void, opts: { clock: Clock; log: (m: string) => void; fallbackPollMs?: number }): { close(): void }
```

Scheduler rules:

1. `notify()` starts or restarts a `quietMs` timer. When it fires, `run` is called.
2. The first `notify()` after the last run started (the first unserved one) also starts a
   `capMs` timer. If it fires first, `run` is called. Both timers are cleared whenever `run`
   starts.
3. Only one `run` is in flight at a time. A `notify()` while `run` is in flight marks exactly one
   follow-up. When the in-flight `run` settles, the follow-up is served by rules 1 and 2 from
   that moment, never started twice.
4. `setActive(true)` starts a `pollMs` repeat that calls `run` (still under rule 3).
   `setActive(false)` stops it. Calling it with the current value changes nothing.
5. `dispose()` clears every timer. Nothing runs after it.
6. A `run` that rejects counts as settled.

`isIgnored(rel)` is true for any path with a segment sequence `.state/context/`, and for any path
whose base name is `.lock`. Separators may be `\` or `/`.

`watchStore` calls `fs.watch(store, { recursive: true })` and calls `onChange` for each event
whose relative path is not ignored. On a watcher error it recreates the watcher once. If that
fails, it calls `onChange` every `fallbackPollMs` (2000) and logs
`watching <store> by polling every 2 s`.

## Alerts

**Produced by:** T08. **Consumed by:** T09.

```ts
// agentics-viewer/server/alerts.ts
import type { Snapshot } from '../shared/snapshot.ts'
export interface Alert { node: string; kind: 'parked' | 'escalated'; seq: number; title: string; body: string }
export function diffAlerts(s: Snapshot, watermark: number | undefined): { alerts: Alert[]; watermark: number }
```

- An `undefined` watermark gives `{ alerts: [], watermark: s.seq_max }`.
- Otherwise there is one alert per node whose `status` is `parked` or `escalated`, whose `event`
  is non-null with `event.kind === status`, and whose `event.seq > watermark`. Alerts are ordered
  by `seq` ascending.
- The returned watermark is the largest of `watermark` and every alerted `seq`.
- Wording:
  - title: `<name> is waiting on you` or `<name> escalated`, where `name` is the id's last
    segment (the effort name for `.`);
  - body: `question`, else `return`, else `''` for a park; `reason`, else `detail`, else `''` for
    an escalation.

## HTTP and SSE

**Produced by:** T09. **Consumed by:** T11 (the page's client).

| route | response |
|---|---|
| `GET /api/health` | `{ "app": "agentics-viewer", "version": "<package.json version>" }` |
| `GET /api/projects` | `{ found: ProjectRef[], recent: ProjectRef[], last: { project, effort } \| null }` |
| `POST /api/browse` | `FolderPick` |
| `GET /api/stream?project=<path>[&effort=<name>]` | `text/event-stream` |
| `GET /*` | files from `agentics-viewer/dist/`; unknown paths get `index.html` |

SSE events (`event:` name, `data:` JSON):

- `efforts`: `{ list: EffortsList, selected: string | null }`. Sent on connect and whenever the
  list's digest changes.
- `snapshot`: `Snapshot`. Sent on connect (the latest one for that effort) and whenever the digest
  changes.
- `problem`: `Problem`. A refresh failed before this connection had any snapshot, or the project
  is gone.
- `stale`: `Problem`. A refresh failed after this connection had a snapshot.
- A `: ping` comment every 15 000 ms.

```ts
// agentics-viewer/server/app.ts
import type http from 'node:http'
import type { Clock } from './clock.ts'
import type { AgenticsLocation } from './agentics.ts'
import type { Problem } from '../shared/snapshot.ts'
import type { FolderPick } from './windows.ts'
export interface AppDeps {
  port: number
  stateFile: string
  distDir: string
  clock: Clock
  locate: () => AgenticsLocation | Problem
  toast: (title: string, body: string) => Promise<void>
  pickFolder: () => Promise<FolderPick>
  log: (m: string) => void
}
export function hostAllowed(headers: http.IncomingHttpHeaders, port: number): boolean
export function createApp(deps: AppDeps): { server: http.Server; close(): Promise<void> }
```

`hostAllowed`:
- `Host` must be `127.0.0.1:<port>` or `localhost:<port>`;
- when `Origin` is present it must be `http://127.0.0.1:<port>` or `http://localhost:<port>`.

## View model (page)

**Produced by:** T10b (tests by T10a). **Consumed by:** T11–T14.

```ts
// agentics-viewer/web/model.ts
import type { Snapshot, SnapshotNode, SnapshotFolder, Problem } from '../shared/snapshot.ts'
export type Lamp = 'work' | 'hold' | 'stop' | 'done' | 'idle' | 'open' | 'unknown' | 'orphan'
export interface NodeView {
  id: string
  name: string                 // last id segment; the effort name for '.'
  parent: string | null        // the drawn parent ('.' for an orphan)
  depth: number
  children: string[]           // sorted by id
  lamp: Lamp
  wording: string
  orphan: boolean
  node: SnapshotNode
  folder: SnapshotFolder | null   // the folder whose id equals the node id, if any
}
export interface Tile { node: string; kind: 'hold' | 'stop'; seq: number; title: string; why: string }
export interface Counts { working: number; merged: number; queued: number; needDesign: number }
export interface BoardModel {
  root: string                 // '.'
  nodes: Map<string, NodeView>
  order: string[]              // depth-first, parents before children, siblings by id
  tiles: Tile[]
  counts: Counts
}
export function buildModel(s: Snapshot): BoardModel
export function lampAndWording(n: SnapshotNode, folder: SnapshotFolder | null, childStatuses: string[]): { lamp: Lamp; wording: string }
export function afterEdges(s: Snapshot, id: string): { incoming: string[]; outgoing: string[] }
export function returnInWords(ret: string): string
export function problemText(p: Problem): string
export function ago(iso: string, now: number): string
export function vscodeLink(path: string, line?: number | null): string
export function costText(c: Snapshot['cost']): string
export function spendText(c: Snapshot['cost'], id: string): string | null
export function tileKey(project: string, effort: string, t: Tile): string
export function tabTitle(tiles: Tile[]): string
```

Rules (spec §7.3, §7.5, §8 and `architecture.md` § Design decisions):

- `lampAndWording`, by `n.status`:
  - `active`: lamp `work`.
    - Leaf: `stage` (or `working` when null), plus `, 1 commit` or `, <n> commits` when
      `commits.count > 0`.
    - Otherwise: `<merged> of <m> merged` over `childStatuses`, where merged means
      `merged | integrated | landed`.
  - `approved`: lamp `work`; wording `stage`, or `awaiting merge` when null.
  - `parked`: lamp `hold`; wording `waiting on you`.
  - `escalated`: lamp `stop`; wording `escalated`.
  - `merged`, `integrated`, `landed`: lamp `done`; wording is the status itself.
  - `planned`: lamp `idle`.
    - Leaf: wording `queued`.
    - Otherwise: `<merged> of <m> merged` when it has children, else `queued`.
  - `open`: lamp `open`. Wording `needs design`, then `, <b> blocking` when `folder.blocking > 0`,
    then `, not approved` when `folder.approval` is `none` or `, edited since approval` when it's
    `edited`. Without a folder, just `needs design`.
  - Anything else: lamp `unknown`; wording is the raw status.
- `buildModel`:
  - a node whose `parent` is non-null and absent from the snapshot is drawn under `.`, with
    `orphan: true`, lamp `orphan` and wording `parent missing: <parent>`;
  - tiles: one per node with status `parked` (kind `hold`) or `escalated` (kind `stop`) and a
    non-null event. `stop` tiles come first, then `hold`, each group by `seq` descending.
    - Title: `<name> is waiting on you` or `<name> escalated`.
    - `why`: the `question` (else `returnInWords(return)`) for `hold`; the `reason` (else
      `detail`) for `stop`.
  - counts as in `architecture.md`.
- `afterEdges(s, id)`: `incoming` is the node's `deps` that exist in the snapshot; `outgoing` is
  the ids of nodes whose `deps` include `id`. Both are sorted.
- `returnInWords` as in `architecture.md`.
- `problemText` gives exactly the §8 sentences:
  - `agentics_missing` → "The viewer can't find agentics. It looked at `<path>`. Install
    agentics, or set agentics_path in ~/.agentics-viewer/state.json."
  - `agentics_too_old` → "agentics `<version>` at `<path>` has no snapshot command. It arrives in
    agentics 4.0.0."
  - `format_mismatch` → "This viewer reads snapshot format 1. agentics at `<path>` writes format
    `<format>`. Update agentics-viewer."
  - `snapshot_failed` → "The last refresh failed: `<detail>`."
  - `project_gone` → "This project folder is gone: `<path>`."
  - Placeholders are filled without backticks; the backticks above only mark them.
- `ago(iso, now)`:
  - under 60 s, or in the future: `just now`;
  - under 60 min: `<m> min ago`;
  - under 24 h: `<h> h ago`;
  - otherwise `<d> d ago`.
  - All values are floored.
- `vscodeLink(path, line)`: `vscode://file/` + the path with `\` turned to `/`. Each segment is
  encoded with `encodeURIComponent`, except that a leading drive segment like `C:` stays as it is.
  When `line` is a number, `:<line>` is appended.
- `costText`: `<k>k tokens over <n> dispatches`, where `k` is tokens / 1000 rounded. Tokens under
  1000 print as a plain number (`800 tokens`). A single dispatch reads `1 dispatch`. When
  `tokens_unreported > 0`, `, and <u> unreported` is appended.
- `spendText(c, id)`: `null` when `per_leaf[id]` is absent. Otherwise the same format for that
  leaf.
- `tileKey`: `` `${project}|${effort}|${t.node}|${t.seq}` ``.
- `tabTitle`: `agentics viewer` when there are no tiles, else `(<n>) agentics viewer`.

## Page components

**Produced by:** T11 (stubs with these props) and T12–T14 (bodies). **Consumed by:** T11's `App.tsx`.

```tsx
// agentics-viewer/web/Annunciator.tsx
export function Annunciator(props: { tiles: Tile[]; counts: Counts; project: string; effort: string; onSelect: (id: string) => void; selected: string | null }): JSX.Element
// agentics-viewer/web/Outline.tsx
export function Outline(props: { model: BoardModel; selected: string | null; onSelect: (id: string) => void }): JSX.Element
// agentics-viewer/web/Board.tsx
export function Board(props: { model: BoardModel; snapshot: Snapshot; selected: string | null; onSelect: (id: string) => void; narrow: boolean }): JSX.Element
// agentics-viewer/web/Detail.tsx
export function Detail(props: { view: NodeView; snapshot: Snapshot; now: number }): JSX.Element
```

```ts
// agentics-viewer/web/stream.ts (T11)
export interface UrlState { project: string | null; effort: string | null; node: string | null }
export function readUrlState(search: string): UrlState
export function urlFor(state: UrlState): string            // '?project=…&effort=…&node=…', omitting nulls
export interface StreamHandlers {
  efforts(e: { list: EffortsList; selected: string | null }): void
  snapshot(s: Snapshot): void
  problem(p: Problem): void
  stale(p: Problem): void
  connection(up: boolean): void
}
export function openStream(project: string, effort: string | null, h: StreamHandlers): () => void
```
