# T15: Integration with the user, README, launch entry

rigor: verify
size: ~28 turns (6 edit sites, 6 files)

**Repository:** vanillafairy. **Runs inline in the main session**: every check below needs the
user's eyes, the Browser pane or Windows.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | inherit | inherit | inline in the main session with the user |
| review | opus | medium | |
| fix | inherit | inherit | inline |
| re-review | opus | low | scoped to the findings list |

## References
- Spec § 2 (Defaults), § 6.2, § 10 steps 5–6, § 12 and § 13
- Mockup: `docs/superpowers/specs/2026-09-27-agentics-viewer-mockup.html`
- Read: `../knowledge/run-checks-viewer.md`

## Dependencies
- Depends on: T02b, T09, T12, T13, T14
- Depended on by: —

**Files:**
- Modify: `.gitignore` (repository root): `.claude/` becomes `.claude/*` and `!.claude/launch.json`
- Create: `.claude/launch.json`
- Modify: `README.md` (repository root): a short "Tools" section
- Create: `agentics-viewer/README.md`
- Modify: `docs/superpowers/specs/2026-09-27-agentics-viewer-design.md` § 12: answer the two
  lookups

**Scope / Negative Constraints:**
- Fixes that the checks turn up go in their own commits, each naming the file and the check it
  failed. They're scoped to the viewer.
- Don't point the viewer at anything but the `design-loop` checkout until agentics 4.0.0 is
  installed.

- [ ] **Step 1: Repo chores**

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "agentics-viewer", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "agentics-viewer", "start"], "port": 4747 }
  ]
}
```

- Root `README.md`: a `## Tools` section with one paragraph. `agentics-viewer/` is a local web app
  that shows an agentics effort's tree live; it isn't a plugin; see its README.
- `agentics-viewer/README.md`: what it is, `npm install` then `npm start`, the URL, the state file
  and its keys, how `agentics_path` points at a dev checkout, and that it's Windows only.

Commit: `docs(agentics-viewer): README, launch entry and a tracked .claude/launch.json`.

- [ ] **Step 2: Run it against real efforts**

- Set `agentics_path` in `~/.agentics-viewer/state.json` to `C:/work/claude/vanillafairy/agentics`.
- Run `npm start` in `agentics-viewer/`, and open `http://127.0.0.1:4747` in the Browser pane
  with `preview_start` and that URL.
- Open eva-plays-2 through Open project, first from Found, then through Browse….

- [ ] **Step 3: The user checks each success criterion (spec § 13)**

Walk the user through each item, and record pass or fail with a note:
1. Open project: Found lists eva-plays-2, Recent keeps it, Browse opens the folder dialog, and
   the latest effort opens.
2. The board and outline show reshape-pets' nodes with the right lamps and wording.
3. Liveness: append a harmless event to a **copy** of the effort, never the real one. Copy
   eva-plays-2's effort into a scratch git repo, open that as a project, then append a `parked`
   event there. The board changes within about a second.
4. That same append lights a flashing tile and raises exactly one toast. Reopening the effort
   raises none.
5. Clicking nodes shows the detail panel. A `vscode://` link opens VS Code from the Browser pane
   (this answers the § 12 lookup), and copy-path works.
6. Nothing under eva-plays-2's `.agentics/` changed: compare file hashes before and after the
   session.
7. Stop the server with the page open: the lost-server bar shows, and restarting reconnects.
   Point `agentics_path` at a folder without agentics: the `agentics_missing` sentence shows.
8. The narrow pane, the wide pane, both themes, keyboard only, and reduced motion (the pane's
   emulation) all compared with the mockup.
- Also check that a spec text containing `<img src=x onerror=alert(1)>` renders as text, not as
  an image. Put it in the scratch copy's task context.

- [ ] **Step 4: Answer the lookups**

In spec § 12, replace each lookup with its answer (the `vscode://` link and `fs.watch`), dated.

Commit: `spec(agentics-viewer): the integration lookups answered`.

## Acceptance
- [ ] `.claude/launch.json` is tracked, and a session in vanillafairy can start the viewer by
      name.
- [ ] Both READMEs are written.
- [ ] Each success criterion in spec § 13 is recorded as passed by the user. A failure gets a fix
      commit and a re-check.
- [ ] Spec § 12's lookups are answered.
