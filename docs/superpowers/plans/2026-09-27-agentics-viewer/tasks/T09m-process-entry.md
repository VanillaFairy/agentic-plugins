# T09m: The process entry: start decisions and main

rigor: tdd
size: ~18 turns (3 edit sites, 6 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § HTTP and SSE, § State file and § agentics locator and runner
- Spec § 6.2

## Dependencies
- Depends on: T09
- Depended on by: T15b

**Files:**
- Create: `agentics-viewer/server/start.ts`
- Create: `agentics-viewer/server/main.ts`
- Create: `agentics-viewer/test/start.test.ts`

**Scope / Negative Constraints:**
- `start.ts` is pure. `main.ts` does the I/O and holds no decision of its own.
- The health probe comes before any build, so a second start never builds.

**Interfaces:**
- Consumes: `createApp` (T09), `readState` and `statePath` (T04), `locateAgentics` (T05),
  `showToast` and `pickFolder` (T06), `realClock` (T03).
- Produces: `StartDecision`, `startDecision`, `needsBuild`, and `server/main.ts`.

## Behaviour of `main.ts`
1. Read state from `statePath(os.homedir())`, and log a `readState` problem if there is one.
2. `GET http://127.0.0.1:<port>/api/health` with a 1 s timeout, and check whether the port is
   free by trying to listen on it.
3. Act on `startDecision`:
   - `already-running`: print `agentics viewer is already running at http://127.0.0.1:<port>`
     and exit 0;
   - `port-taken`: print `port <port> is in use; set "port" in ~/.agentics-viewer/state.json`
     and exit 1.
4. When `needsBuild(newest mtime under web/, mtime of dist/index.html or null)` is true, run
   `npx vite build` in `agentics-viewer/` and wait. A failed build exits 1 with its output.
5. Start `createApp` with:
   - `realClock`;
   - `locate: () => locateAgentics({ override: state.agentics_path, installedPlugins: join(homedir(), '.claude', 'plugins', 'installed_plugins.json') })`;
   - `toast: showToast`, `pickFolder`, `log: console.log`;
   - `distDir: <agentics-viewer>/dist`.
   Listen on `127.0.0.1:<port>`, and print `agentics viewer at http://127.0.0.1:<port>`.
6. On SIGINT, close the app and exit 0.

- [ ] **Step 1: Write the failing tests**, one per acceptance line. The last one spawns
  `node server/main.ts` with `USERPROFILE` and `HOME` pointed at a temp home. Its `state.json`
  names the port of a `createApp` instance the test started.
- [ ] **Step 2: Run**: `npx vitest run test/start.test.ts`. Expected: FAIL (no module).
- [ ] **Step 3: Implement** `server/start.ts` and `server/main.ts`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add agentics-viewer/server/start.ts agentics-viewer/server/main.ts agentics-viewer/test/start.test.ts
git commit -m "feat(agentics-viewer): start once, build when stale"
```

## Acceptance
- [ ] A health body with `app: 'agentics-viewer'` gives `already-running` → test 'a running viewer is recognised'
- [ ] No health answer and a free port gives `run` → test 'a free port runs'
- [ ] No health answer and a taken port gives `port-taken` → test 'a port held by something else is taken'
- [ ] A health body from another app and a taken port gives `port-taken` → test 'another app on the port is taken'
- [ ] `needsBuild(t, null)` is true → test 'no dist means build'
- [ ] `needsBuild(20, 10)` is true, and `needsBuild(10, 20)` is false → test 'build only when web is newer'
- [ ] Spawning `node server/main.ts` against a running viewer exits 0 and prints the
      already-running line → test 'a second start against a running viewer exits 0'
