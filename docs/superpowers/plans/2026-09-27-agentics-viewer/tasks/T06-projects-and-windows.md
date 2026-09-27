# T06: Projects, and the Windows toast and folder dialog

rigor: tdd
size: ~24 turns (4 edit sites, 7 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Projects, § Windows side effects and § Clock
- Read: `../knowledge/windows-powershell.md`
- Spec § 6.4 and § 6.6 (toast)

## Dependencies
- Depends on: T01, T03
- Depended on by: T09

**Files:**
- Create: `agentics-viewer/server/projects.ts`
- Create: `agentics-viewer/server/windows.ts`
- Create: `agentics-viewer/test/projects.test.ts`
- Create: `agentics-viewer/test/windows.test.ts`

**Scope / Negative Constraints:**
- The scripts in `windows.ts` are the ones `knowledge/windows-powershell.md` marks proven. If T01
  recorded a fallback instead, implement that and nothing more.
- Tests never spawn `powershell.exe`. They test `toastScript` and `folderDialogScript` as strings.
  The spawn wrappers are checked by the user in T15.
- `discoverProjects` never follows a symbolic link or junction (check with `lstatSync`), and
  never throws on an unreadable directory.

**Interfaces:**
- Consumes: `Clock` (T03), `test/fake-clock.ts` (T03).
- Produces: `ProjectRef`, `discoverProjects`, `createDiscovery`, `recentProjects`, `latestEffort`,
  `toastScript`, `folderDialogScript`, `showToast`, `FolderPick`, `pickFolder`.

- [ ] **Step 1: Write the failing tests**

- `projects.test.ts` builds a temp tree:

  ```
  root/
    a/.agentics/                 found (depth 1)
    b/c/.agentics/               found (depth 2)
    d/e/f/g/h/.agentics/         not found at depth 4 (depth 5)
    node_modules/x/.agentics/    skipped
    .claude/worktrees/w/.agentics/   skipped
    plain/                       not a project
  ```

  For `latestEffort`, it writes files under `<store>/one/.state/nodes.jsonl` and
  `<store>/two/DESIGN.md`, and sets their mtimes with `utimesSync`.
- `windows.test.ts` checks the scripts as strings.

- [ ] **Step 2: Run**: `npx vitest run test/projects.test.ts test/windows.test.ts`. Expected:
  FAIL (no modules).

- [ ] **Step 3: Implement** both modules per interfaces. `showToast` and `pickFolder` spawn
  `powershell.exe` as `knowledge/windows-powershell.md` shows.
  - `pickFolder` maps stdout `::cancelled::` to `{cancelled: true}`, other non-empty stdout to
    `{path}`, and a non-zero exit or empty output to `{error}` carrying stderr.
  - `showToast` resolves on close and on error. It never rejects.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agentics-viewer/server/projects.ts agentics-viewer/server/windows.ts agentics-viewer/test/projects.test.ts agentics-viewer/test/windows.test.ts
git commit -m "feat(agentics-viewer): project discovery, recent projects, toast and folder dialog"
```

## Acceptance
- [ ] Projects at depth 1 and 2 are found → test 'finds projects holding .agentics'
- [ ] A project deeper than `depth` is not found → test 'stops at the depth limit'
- [ ] Projects under `node_modules` and `.claude` are not found → test 'skips node_modules, .git and .claude'
- [ ] A root that itself holds `.agentics` is found → test 'a root can be a project'
- [ ] An unreadable directory is skipped without throwing → test 'unreadable directories are skipped' (simulate with a path that disappears between listing and reading, or a missing root)
- [ ] Results are sorted by path, and `name` is the base name → test 'results are sorted with base names'
- [ ] `createDiscovery` returns the cached list within `ttlMs` and rescans after it, driven by
      `fakeClock` → test 'discovery is cached for its ttl'
- [ ] `recentProjects` drops paths that no longer exist and keeps the order → test 'recent drops missing folders'
- [ ] `latestEffort` picks the effort with the newest `.state/*.jsonl` or `DESIGN.md` → test 'latest effort is the most recently written'
- [ ] `latestEffort` breaks an mtime tie by the larger name → test 'a tie goes to the larger name'
- [ ] `latestEffort([])` is null → test 'no efforts gives null'
- [ ] `toastScript` puts title and body into the XML with `& < > " '` escaped, and every `'`
      doubled for PowerShell → test 'toast text cannot break out of the script'
- [ ] `toastScript` uses the AppUserModelID recorded in the knowledge file → test 'toast uses the proven app id'
- [ ] `folderDialogScript` prints `::cancelled::` on cancel → test 'the dialog script reports cancel'
