# T05: Find and run agentics

rigor: tdd
size: ~20 turns (3 edit sites, 5 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Snapshot contract and § agentics locator and runner
- Spec § 6.3

## Dependencies
- Depends on: T03
- Depended on by: T09

**Files:**
- Create: `agentics-viewer/server/agentics.ts`
- Create: `agentics-viewer/test/agentics.test.ts`

**Scope / Negative Constraints:**
- The tests build fake agentics installs in temp directories: `lib/status.mjs` plus
  `.claude-plugin/plugin.json`, each a few lines. Don't commit fixture directories.
- `execFile` with an argument array, never a shell string.

**Interfaces:**
- Consumes: `Snapshot`, `EffortsList`, `Problem`, `FORMAT` from `shared/snapshot.ts`.
- Produces: `AgenticsLocation`, `locateAgentics`, `RunResult`, `runSnapshot`, `runList`.

- [ ] **Step 1: Write the failing tests**

A helper writes a fake install:

```ts
function fakeAgentics(dir: string, body: string, version = '4.0.0') {
  mkdirSync(join(dir, 'lib'), { recursive: true }); mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ version }))
  writeFileSync(join(dir, 'lib', 'status.mjs'), body)
}
// body examples:
// ok:        prints {payload:{format:1,...minimal Snapshot..., echo of argv}, payload_digest:'00000000'}
// too old:   console.log(JSON.stringify({error:'unknown command "snapshot" — expected list, show, todos or cost'})); process.exit(1)
// format 2:  prints an envelope whose payload.format is 2
// broken:    console.log('not json')
// slow:      setTimeout(() => {}, 60000)
```

The ok fake echoes `process.argv.slice(2)` inside the payload, so a test can check that the
arguments arrived intact.

- [ ] **Step 2: Run**: `npx vitest run test/agentics.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: Implement `server/agentics.ts`** following interfaces § agentics locator and
  runner. Parse stdout as JSON. When it has `error`, check for the `unknown command "snapshot"`
  prefix. When it has `payload`, check `format` (snapshot only). Anything else is
  `snapshot_failed` with the text as `detail`.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agentics-viewer/server/agentics.ts agentics-viewer/test/agentics.test.ts
git commit -m "feat(agentics-viewer): find agentics and run its status commands"
```

## Acceptance
- [ ] A non-null `override` wins over `installed_plugins.json` → test 'the override wins'
- [ ] Without an override, `installPath` of `agentics@vanillafairy` is used → test 'installed_plugins.json resolves agentics@vanillafairy'
- [ ] No usable path gives `agentics_missing` carrying the tried path → test 'a missing install is agentics_missing'
- [ ] `version` comes from `.claude-plugin/plugin.json`, and is `''` when unreadable → test 'version is read from plugin.json'
- [ ] A payload with `format` 1 gives `ok` with the payload and digest → test 'a format 1 snapshot is ok'
- [ ] An `unknown command "snapshot"` error gives `agentics_too_old` with path and version → test 'an old agentics is agentics_too_old'
- [ ] A payload with `format` 2 gives `format_mismatch` carrying 2 → test 'another format is format_mismatch'
- [ ] `format_mismatch` carries `path` and `version` → test 'a format mismatch names the install'
- [ ] `snapshot_failed` carries `path` and `version` → test 'a failed snapshot names the install'
- [ ] Non-JSON output gives `snapshot_failed` with the output as detail → test 'garbage output is snapshot_failed'
- [ ] Exit 1 with `{error}` gives `snapshot_failed` with the error as detail → test 'an agentics error is snapshot_failed'
- [ ] A run past `timeoutMs` gives `snapshot_failed` → test 'a slow agentics times out as snapshot_failed' (use `timeoutMs: 300`)
- [ ] An agentics path and a project path that both contain spaces reach the script intact → test 'paths with spaces pass through' (Review Focus 1)
- [ ] `runList` returns the list payload with no format check → test 'runList returns the efforts list'
