# T04: The viewer's state file

rigor: tdd
size: ~16 turns (3 edit sites, 4 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § State file
- Spec § 6.8

## Dependencies
- Depends on: T03
- Depended on by: T09

**Files:**
- Create: `agentics-viewer/server/state.ts`
- Create: `agentics-viewer/test/state.test.ts`

**Scope / Negative Constraints:**
- Node built-ins only.
- The file is written only through `writeState`, which writes `<file>.tmp` and then renames it.

**Interfaces:**
- Consumes: —
- Produces: `ViewerState`, `DEFAULT_STATE`, `statePath`, `readState`, `writeState`,
  `addRecent`, `projectKey` (interfaces § State file).

## Failure Modes
- Interrupted mid-write, then run again: a leftover `<file>.tmp` next to a good file doesn't
  change what `readState` returns, and the next `writeState` replaces it → test 'a leftover temp file is ignored and replaced'
- An input deleted, renamed or removed: a missing file reads as defaults with no problem → test 'a missing file reads as defaults'
- A value changed: the file's value wins over the default key by key → test 'a partial file keeps its values and fills the rest from defaults'
- Every path into a guarded state: n/a: there's no guarded state; every key is plain data
- Run from a linked worktree and from the main checkout: n/a: never reads the git layout
- Each target that already exists:
  - absent: the directory is created → test 'writeState creates the directory'
  - identical: rewriting gives the same content → test 'writing what was read round-trips'
  - different: it's overwritten → test 'writeState replaces an older file'
  - malformed: defaults plus a problem naming the file → test 'malformed JSON reads as defaults with a problem'
- A key with the wrong type takes its default → test 'a wrong-typed key takes its default'

- [ ] **Step 1: Write the failing tests** in `test/state.test.ts`, one per acceptance line below,
  using a temp directory as the home.

- [ ] **Step 2: Run them**: `npx vitest run test/state.test.ts`. Expected: FAIL, because
  `server/state.ts` doesn't exist.

- [ ] **Step 3: Implement `server/state.ts`**

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
export interface ViewerState { /* as interfaces § State file */ }
export const DEFAULT_STATE: ViewerState = { port: 4747, roots: ['C:\\work'], depth: 4, agentics_path: null, recent: [], last: null, alerted: {} }
export const statePath = (home: string) => join(home, '.agentics-viewer', 'state.json')
export function projectKey(project: string): string {
  const p = project.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:/.test(p) ? p[0].toLowerCase() + p.slice(1) : p
}
// readState: JSON.parse inside try; each key checked with a small guard (number, string[],
// string|null, {project,effort}|null, Record<string, Record<string, number>>), else default.
// writeState: mkdirSync(dirname(file), { recursive: true }); write file + '.tmp'; renameSync.
// addRecent: [project, ...recent.filter(p => projectKey(p) !== projectKey(project))].slice(0, 8)
```

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agentics-viewer/server/state.ts agentics-viewer/test/state.test.ts
git commit -m "feat(agentics-viewer): the state file, read with defaults and written atomically"
```

## Acceptance
- [ ] `statePath(home)` is `<home>/.agentics-viewer/state.json` → test 'statePath is under .agentics-viewer'
- [ ] A missing file reads as `DEFAULT_STATE` with problem null → test 'a missing file reads as defaults'
- [ ] Malformed JSON reads as defaults with a problem naming the file → test 'malformed JSON reads as defaults with a problem'
- [ ] A partial file keeps its values and takes defaults for the rest → test 'a partial file keeps its values and fills the rest from defaults'
- [ ] A wrong-typed key takes its default → test 'a wrong-typed key takes its default'
- [ ] Unknown keys are dropped → test 'unknown keys are dropped'
- [ ] `writeState` creates the directory → test 'writeState creates the directory'
- [ ] `writeState` replaces an older file → test 'writeState replaces an older file'
- [ ] Writing what was read gives the same state back → test 'writing what was read round-trips'
- [ ] A leftover `.tmp` file is ignored by `readState` and replaced by the next write → test 'a leftover temp file is ignored and replaced'
- [ ] `addRecent` puts the project first, removes an earlier entry with the same key (for
      example `C:\work\x` and `c:/work/x/`), and keeps eight → test 'addRecent dedupes by key and keeps eight'
- [ ] `projectKey` gives forward slashes, no trailing slash and a lower-case drive letter → test 'projectKey normalises separators, trailing slash and drive case'
