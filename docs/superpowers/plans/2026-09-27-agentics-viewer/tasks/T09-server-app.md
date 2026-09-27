# T09: The server app: routes, SSE, wiring and alerts

rigor: tdd
size: ~40 turns (5 edit sites, 12 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | wires six modules with per-project, per-connection state |
| review | opus | medium | |
| fix | sonnet | high | the same cross-module state as implement |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § HTTP and SSE, § State file, § agentics locator and runner, § Projects, § Windows side effects, § Refresh scheduler and store watcher and § Alerts
- Read: `../shared/architecture.md` § Design decisions made while planning
- Spec § 6.4, § 6.5, § 6.6 and § 6.7

## Dependencies
- Depends on: T04, T05, T06, T07b, T08
- Depended on by: T09m, T15a, T15b

**Files:**
- Create: `agentics-viewer/server/app.ts`
- Create: `agentics-viewer/test/app.test.ts`
- Create: `agentics-viewer/test/wiring.test.ts`

**Scope / Negative Constraints:**
- Node built-ins only (`node:http`, `node:fs`, `node:path`).
- No route reads or serves a file from a project. Static files come only from `distDir`, and
  `..` segments are refused.
- `app.ts` takes every side effect through `AppDeps`. `main.ts` is T09m's.
- A watcher and its schedulers exist only while at least one stream is connected to that
  project.

**Interfaces:**
- Consumes: T04, T05, T06, T07b and T08, exactly as in interfaces.
- Produces: `AppDeps`, `hostAllowed`, `createApp`, and the routes and SSE events of interfaces
  § HTTP and SSE.

## Behaviour

- **Connections.**
  - If the project directory doesn't exist, send `problem {code:'project_gone', path}` and keep
    the stream open.
  - Otherwise run `runList`. `key = projectKey(dirname(list.store))`. The effort is the query's
    `effort`, or `latestEffort(list.store, names)` when absent. Send `efforts {list, selected}`.
  - Then send the cached snapshot for (key, effort) if there is one, and call `notify()`.
- **Per key:** one `watchStore(list.store, …)` while any stream is connected. It feeds `notify()`
  on every scheduler of that key.
- **Per (key, effort):** one scheduler built with `deps.timings`. Its run does `runList`, then
  `runSnapshot`:
  - when the list's digest changed since the last run, send `efforts` to that pair's streams;
  - on snapshot ok with a new digest: cache it, send `snapshot` to that pair's streams, and call
    `setActive(nodes.some(n => n.status === 'active'))`. The same digest sends nothing;
  - then `diffAlerts` against the in-memory `alerted[key][effort]`. Store the new watermark,
    **write the state file, then** call `deps.toast` for each alert;
  - on failure, send `stale` to streams that already had a snapshot and `problem` to the rest. A
    `locate()` problem is a failure;
  - a missing project directory in a run sends `problem project_gone`.
- **Opening a project** (the first stream for a key) applies `addRecent` with the path as the
  user sent it, sets `last`, and writes the state file.
- **The state** is one in-memory `ViewerState`, read once by `createApp`. Every change writes the
  whole object.
- **Heartbeat:** a `: ping` comment every `heartbeatMs` (default 15 000) on each stream, through
  the clock.
- **Closing** a stream removes it. The last stream of a pair disposes its scheduler. The last
  stream of a key closes its watcher.
- **`hostAllowed`** compares against the port the server actually listens on.

## Failure Modes
- Interrupted mid-write, then run again: the watermark is written before the toast, so a crash
  between them never repeats a toast on restart → acceptance line 'the watermark is saved before the toast'
- An input deleted, renamed or removed: the project folder deleted while watched → acceptance line 'deleting the project folder sends project_gone'
- A value changed: the settings in the state file are read once at start, and a change made
  while the server runs is overwritten by the next write → acceptance line 'the app's state is the one it read at start'
- Every path into a guarded state (the watermark only rises): first open, a new alert and a
  reopen → acceptance lines 'the first open raises no toast', 'a new park toasts once and saves the watermark' and 'reopening an effort keeps its watermark'
- Run from a linked worktree and from the main checkout: both paths share one watcher and one
  watermark → acceptance line 'a linked worktree and its main checkout share a watermark'
- Each target that already exists: the state file absent, identical, different or malformed at
  start is T04's `readState` (tested there). Here, two efforts alerting in the same second both
  keep their watermarks → acceptance line 'two efforts keep their own watermarks'

- [ ] **Step 1: Write the failing tests**

- `app.test.ts` uses `createApp` with fakes:
  - `locate` returns a fake agentics whose `lib/status.mjs` prints canned payloads chosen through
    a temp control file the test rewrites;
  - `toast` records its calls, and also reads the state file at call time (for the save-before-toast
    line);
  - `pickFolder` returns `{path:'C:/x'}`;
  - the state file is in a temp home;
  - the clock is `realClock` with `heartbeatMs: 100` and
    `timings: { quietMs: 20, capMs: 60, pollMs: 150 }`. Keep every wait under 2 s.
  The server listens on port 0. Read the port from `server.address()`.
- `wiring.test.ts` builds a fixture project: a temp directory with
  `.agentics/eff/.state/events.jsonl`. Its fake `lib/status.mjs`:
  - for `list`, prints `{store:<fixture>/.agentics, store_present:true, efforts:[{effort:'eff', about:'', root_status:'planned', seq_max:0, malformed:0}]}`;
  - for `snapshot`, prints a minimal format-1 snapshot whose `seq_max` is the number of lines in
    `events.jsonl`, with `payload_digest` set to that number as a string;
  - counts its runs by appending to a temp file outside `.agentics/`.
- A small SSE reader: `fetch` the stream and split the `response.body` text on blank lines.

- [ ] **Step 2: Run**: `npx vitest run test/app.test.ts test/wiring.test.ts`. Expected: FAIL (no
  module).

- [ ] **Step 3: Implement `server/app.ts`** per Behaviour.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agentics-viewer/server/app.ts agentics-viewer/test/app.test.ts agentics-viewer/test/wiring.test.ts
git commit -m "feat(agentics-viewer): server routes, SSE stream and alerts"
```

## Acceptance
- [ ] `/api/health` answers `{app:'agentics-viewer', version}` → test 'health identifies the viewer'
- [ ] A foreign `Host` gets 403 → test 'a foreign host is refused'
- [ ] A foreign `Origin` on `GET /api/stream` gets 403 → test 'a foreign origin cannot read the stream'
- [ ] A foreign `Origin` on `POST /api/browse` gets 403, and `pickFolder` isn't called → test 'a foreign origin cannot open the dialog'
- [ ] `localhost:<port>` and `127.0.0.1:<port>` are both allowed → test 'both local host names are allowed'
- [ ] `/api/projects` returns found, recent and last → test 'projects lists found, recent and last'
- [ ] `POST /api/browse` returns `pickFolder`'s result → test 'browse returns the picked folder'
- [ ] `/api/stream` without `project` gets 400 → test 'a stream needs a project'
- [ ] `/api/stream` with only `effort` gets 400 → test 'an effort alone is not enough'
- [ ] A stream without `effort` gets `efforts` with `selected` set to the latest effort → test 'the latest effort is selected'
- [ ] A new stream receives the cached snapshot at once, before any change → test 'a new stream gets the latest snapshot without waiting' (Review Focus 3)
- [ ] With two streams on one project, closing one keeps the other receiving snapshots → test 'closing one of two streams keeps the other updating' (Review Focus 2)
- [ ] A changed efforts list is resent as `efforts` → test 'a changed list resends efforts'
- [ ] A run whose snapshot digest didn't change sends no `snapshot` → test 'an unchanged digest sends nothing'
- [ ] A snapshot with an active node makes runs repeat every `pollMs` with no writes; one with
      none doesn't → test 'active nodes turn on polling'
- [ ] A `: ping` arrives within `heartbeatMs` → test 'streams get a heartbeat'
- [ ] A failing snapshot sends `problem` to a stream with no snapshot yet → test 'a first failure is a problem'
- [ ] A failing snapshot after a good one sends `stale` → test 'a later failure is stale'
- [ ] A `locate()` problem reaches the stream as `problem` with its code → test 'a missing agentics reaches the page'
- [ ] Deleting the project directory sends `problem project_gone` → test 'deleting the project folder sends project_gone' (Review Focus 4)
- [ ] The first open of an effort calls `toast` zero times → test 'the first open raises no toast'
- [ ] A new park calls `toast` once and saves the watermark → test 'a new park toasts once and saves the watermark'
- [ ] When `toast` is called, the state file already holds the new watermark → test 'the watermark is saved before the toast'
- [ ] Closing and reopening a stream on an effort raises no toast for parks it already alerted → test 'reopening an effort keeps its watermark'
- [ ] Two efforts of one project alerting in the same run window both keep their watermarks in the file → test 'two efforts keep their own watermarks'
- [ ] Streams opened with a linked worktree path and with its main checkout (the fake returns one
      `store` for both) share one watcher, and a park toasts once → test 'a linked worktree and its main checkout share a watermark'
- [ ] Opening a project adds it to `recent` and sets `last` in the state file → test 'opening a project records it'
- [ ] A value written into the state file by hand while the app runs is replaced by the app's next
      write → test 'the app\'s state is the one it read at start'
- [ ] A file in `distDir` is served → test 'dist files are served'
- [ ] An unknown path gets `index.html` → test 'unknown paths get the page'
- [ ] A path with `..` is refused → test 'paths cannot climb out of dist'
- [ ] In the wiring test, appending a line to `events.jsonl` delivers a new `snapshot` event over
      SSE within 1.5 s → test 'a write reaches the page within a second and a half'
- [ ] After the wiring test, every file under the fixture's `.agentics/` has the bytes it had
      before the server started → test 'the viewer writes nothing under .agentics'
- [ ] Closing the last stream closes the watcher: a later write triggers no agentics run → test 'the last stream closing stops watching'
