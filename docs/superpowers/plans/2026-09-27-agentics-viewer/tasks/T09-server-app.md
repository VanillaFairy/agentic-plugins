# T09: The server: routes, SSE, wiring and start

rigor: tdd
size: ~40 turns (6 edit sites, 14 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | wires six modules with per-project, per-connection state |
| review | opus | medium | |
| fix | sonnet | high | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § HTTP and SSE, § State file, § agentics locator and runner, § Projects, § Windows side effects, § Refresh scheduler and store watcher and § Alerts
- Read: `../shared/architecture.md` § Design decisions made while planning
- Spec § 6.2, § 6.4, § 6.5, § 6.6 and § 6.7

## Dependencies
- Depends on: T04, T05, T06, T07b, T08
- Depended on by: T15

**Files:**
- Create: `agentics-viewer/server/app.ts`
- Create: `agentics-viewer/server/main.ts`
- Create: `agentics-viewer/test/app.test.ts`
- Create: `agentics-viewer/test/wiring.test.ts`

**Scope / Negative Constraints:**
- Node built-ins only (`node:http`, `node:fs`, `node:path`, `node:child_process`, `node:os`).
- No route reads or serves a file from a project. Static files come from `distDir` only, with
  `..` segments refused.
- `app.ts` takes every side effect through `AppDeps`. `main.ts` is the only file that builds real
  deps.
- A watcher and its schedulers exist only while at least one stream is connected to that project.

**Interfaces:**
- Consumes: T04, T05, T06, T07b and T08, exactly as in interfaces.
- Produces: `AppDeps`, `hostAllowed`, `createApp`, and the routes and SSE events of interfaces
  § HTTP and SSE.

## Behaviour

- **Connections.** Each stream is keyed by `projectKey(project)` and an effort.
  - If the project directory doesn't exist, send `problem {code:'project_gone', path}` and keep
    the stream open.
  - Otherwise run `runList`. The effort is the query's `effort`, or `latestEffort(list.store,
    names)` when absent. Send `efforts {list, selected}`.
  - Then send the cached snapshot for (project, effort) if there is one, and trigger a refresh
    with `notify()`.
- **Per project:** one `watchStore(list.store, …)` while any stream is connected. It feeds
  `notify()` on every scheduler of that project.
- **Per (project, effort):** one scheduler whose run does `runList` then `runSnapshot`:
  - when the list's digest changed, send `efforts` to that pair's streams;
  - on snapshot ok with a new digest: cache it, send `snapshot` to that pair's streams, and call
    `setActive(nodes.some(n => n.status === 'active'))`;
  - then `diffAlerts` against `state.alerted[projectKey][effort]`, save the new watermark through
    `writeState`, and call `deps.toast` for each alert;
  - on failure, send `stale` to streams that already had a snapshot and `problem` to the rest.
    When `locate()` returns a problem, that problem is the failure;
  - on connect and in each run, a missing project directory sends `problem project_gone`.
- **Opening a project** (the first stream for it) runs `addRecent`, and sets `last` to that
  project and effort. Both are saved with `writeState`.
- **Heartbeat:** a `: ping` comment every 15 000 ms on each stream, through the clock.
- **Closing** a stream removes it. The last stream of a pair disposes its scheduler. The last
  stream of a project closes its watcher.
- **`hostAllowed`** compares against the port the server is actually listening on.
- **`main.ts`**:
  - reads state from `statePath(os.homedir())`;
  - if `GET http://127.0.0.1:<port>/api/health` answers `app: 'agentics-viewer'`, prints
    `agentics viewer is already running at http://127.0.0.1:<port>` and exits 0;
  - if the port is held by anything else, prints `port <port> is in use; set "port" in
    ~/.agentics-viewer/state.json` and exits 1;
  - rebuilds the page with `npx vite build` when any file under `web/` is newer than
    `dist/index.html`, or `dist/` is missing;
  - starts `createApp` with `realClock`, `locateAgentics({ override: state.agentics_path,
    installedPlugins: join(homedir(), '.claude', 'plugins', 'installed_plugins.json') })`,
    `showToast`, `pickFolder` and `console.log`, then prints
    `agentics viewer at http://127.0.0.1:<port>`.

- [ ] **Step 1: Write the failing tests**

- `app.test.ts` uses `createApp` with fakes:
  - `locate` returns a fake agentics path whose `lib/status.mjs` prints canned payloads;
  - `toast` records its calls;
  - `pickFolder` returns `{path:'C:/x'}`;
  - the state file is in a temp home;
  - the clock is `realClock`, because SSE needs real sockets. Keep waits under 2 s.
  The server listens on port 0. Read the port from `server.address()`.
- `wiring.test.ts` builds a fixture project: a temp directory with
  `.agentics/eff/.state/events.jsonl`. Its fake `lib/status.mjs`:
  - for `list`, prints `{store:<fixture>/.agentics, store_present:true, efforts:[{effort:'eff', about:'', root_status:'planned', seq_max:0, malformed:0}]}`;
  - for `snapshot`, prints a minimal format-1 snapshot whose `seq_max` is the number of lines in
    `events.jsonl`, with `payload_digest` set to that number as a string.
- A small SSE reader in the tests: `fetch` the stream and split `response.body` text on blank
  lines.

- [ ] **Step 2: Run**: `npx vitest run test/app.test.ts test/wiring.test.ts`. Expected: FAIL (no
  module).

- [ ] **Step 3: Implement `server/app.ts` and `server/main.ts`** per Behaviour.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agentics-viewer/server/app.ts agentics-viewer/server/main.ts agentics-viewer/test/app.test.ts agentics-viewer/test/wiring.test.ts
git commit -m "feat(agentics-viewer): server routes, SSE stream, alerts and start"
```

## Acceptance
- [ ] `/api/health` answers `{app:'agentics-viewer', version}` → test 'health identifies the viewer'
- [ ] A foreign `Host` gets 403 → test 'a foreign host is refused'
- [ ] A foreign `Origin` gets 403, including on `POST /api/browse` → test 'a foreign origin is refused'
- [ ] `localhost:<port>` and `127.0.0.1:<port>` are both allowed → test 'both local host names are allowed'
- [ ] `/api/projects` returns found, recent and last → test 'projects lists found, recent and last'
- [ ] `POST /api/browse` returns `pickFolder`'s result → test 'browse returns the picked folder'
- [ ] `/api/stream` without `project` gets 400, and with only `effort` too → test 'a stream needs a project'
- [ ] A stream without `effort` gets `efforts` with `selected` set to the latest effort → test 'the latest effort is selected'
- [ ] A new stream receives the cached snapshot at once, before any change → test 'a new stream gets the latest snapshot without waiting' (Review Focus 3)
- [ ] With two streams on one project, closing one keeps the other receiving snapshots → test 'closing one of two streams keeps the other updating' (Review Focus 2)
- [ ] A failing snapshot sends `problem` to a stream with no snapshot yet → test 'a first failure is a problem'
- [ ] A failing snapshot after a good one sends `stale` → test 'a later failure is stale'
- [ ] A `locate()` problem reaches the stream as `problem` with its code → test 'a missing agentics reaches the page'
- [ ] Deleting the project directory sends `problem project_gone` → test 'deleting the project folder sends project_gone' (Review Focus 4)
- [ ] A new park calls `toast` once and saves the watermark in the state file; the first open
      calls it zero times → test 'a new park toasts once and saves the watermark'
- [ ] Opening a project adds it to `recent` and sets `last` in the state file → test 'opening a project records it'
- [ ] Static files are served from `distDir`; an unknown path gets `index.html`; a `..` path is
      refused → test 'static files come only from dist'
- [ ] In the wiring test, appending a line to `events.jsonl` delivers a new `snapshot` event over
      SSE within 1.5 s → test 'a write reaches the page within a second and a half'
- [ ] After the wiring test, every file under the fixture's `.agentics/` has the bytes it had
      before the server started → test 'the viewer writes nothing under .agentics'
- [ ] Closing the last stream closes the project's watcher: a later write triggers no agentics run
      (the fake counts its runs in a temp file) → test 'the last stream closing stops watching'
