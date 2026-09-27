# T15a: README, launch entry and a tracked launch.json

rigor: verify
size: ~15 turns (5 edit sites, 5 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | low | the task dictates each file |
| review | opus | medium | |
| fix | sonnet | low | |
| re-review | opus | low | scoped to the findings list |

## References
- Spec § 2 (Defaults), § 6.2, § 6.3 and § 6.8

## Dependencies
- Depends on: T09
- Depended on by: T15b

**Files:**
- Modify: `.gitignore` (repository root): `.claude/` becomes the two lines `.claude/*` and `!.claude/launch.json`
- Create: `.claude/launch.json`
- Modify: `README.md` (repository root)
- Create: `agentics-viewer/README.md`

**Scope / Negative Constraints:**
- Documentation and config only. No code.
- After the `.gitignore` change, `git status` must show `.claude/launch.json` as new and no other
  file under `.claude/`.

- [ ] **Step 1: Write the files**

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "agentics-viewer", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "agentics-viewer", "start"], "port": 4747 }
  ]
}
```

- Root `README.md`: add a `## Tools` section after the plugin table. One paragraph:
  `agentics-viewer/` is a local web app that shows an agentics effort's tree live. It is not a
  plugin and isn't listed in the marketplace. See its README.
- `agentics-viewer/README.md`, in plain sentences:
  - what it shows;
  - `npm install`, then `npm start`, then open `http://127.0.0.1:4747` (in the Claude desktop
    app's Browser pane or any browser);
  - the state file `~/.agentics-viewer/state.json` and its keys (`port`, `roots`, `depth`,
    `agentics_path`, `recent`, `last`, `alerted`), with settings read at start;
  - how `agentics_path` points at a dev checkout;
  - that it needs agentics 4.0.0 or later, and runs on Windows only;
  - that it never writes under a project's `.agentics/`.

- [ ] **Step 2: Verify**: `git status --short` shows the four paths and nothing else under `.claude/`.

- [ ] **Step 3: Commit**

```bash
git add .gitignore .claude/launch.json README.md agentics-viewer/README.md
git commit -m "docs(agentics-viewer): README, launch entry and a tracked .claude/launch.json"
```

## Acceptance
- [ ] `.claude/launch.json` is tracked, and nothing else under `.claude/` is.
- [ ] Both READMEs carry the content listed in Step 1.
