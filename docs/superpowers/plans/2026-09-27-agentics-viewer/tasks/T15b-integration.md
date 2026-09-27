# T15b: Integration with the user

rigor: verify
size: ~22 turns (2 edit sites, 4 files)

**Repository:** vanillafairy. **Runs inline in the main session**: every check needs the user's
eyes, the Browser pane or Windows.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | inherit | inherit | inline in the main session with the user |
| review | opus | medium | |
| fix | inherit | inherit | inline |
| re-review | opus | low | scoped to the findings list |

## References
- Spec § 10 step 5, § 12 and § 13
- Mockup: `docs/superpowers/specs/2026-09-27-agentics-viewer-mockup.html`
- Read: `../knowledge/run-checks-viewer.md`

## Dependencies
- Depends on: T02b, T09m, T12, T13, T14, T15a
- Depended on by: —

**Files:**
- Modify: `docs/superpowers/specs/2026-09-27-agentics-viewer-design.md` § 12: answer the two lookups

**Scope / Negative Constraints:**
- Fixes the checks turn up go in their own commits, each naming the file and the check it failed.
- Point `agentics_path` at the `design-loop` checkout until agentics 4.0.0 is installed.
- Never write into eva-plays-2's real `.agentics/`. Liveness is tested on a scratch copy.

- [ ] **Step 1: Run it against real efforts**

- Set `agentics_path` in `~/.agentics-viewer/state.json` to `C:/work/claude/vanillafairy/agentics`.
- Hash every file under eva-plays-2's `.agentics/`, and save the list in the scratchpad.
- Start the viewer by name (`preview_start` with `agentics-viewer`), which opens it in the Browser
  pane.
- Open eva-plays-2 through Open project, first from Found, then through Browse….

- [ ] **Step 2: The user checks each success criterion (spec § 13)**

Walk the user through each item. Record pass or fail with a note:
1. Open project: Found lists eva-plays-2, Recent keeps it, Browse opens the folder dialog, and
   the latest effort opens.
2. The board and outline show reshape-pets' nodes with the right lamps and wording.
3. Liveness: copy eva-plays-2's effort into a scratch git repo, open that as a project, and
   append a `parked` event there. The board changes within about a second.
4. That append lights a flashing tile and raises exactly one toast. Reopening the effort raises
   none.
5. Clicking nodes shows the detail panel. A `vscode://` link opens VS Code from the Browser pane
   (this answers a § 12 lookup), and copy-path works.
6. Nothing under eva-plays-2's `.agentics/` changed: re-hash and compare with Step 1.
7. Stop the server with the page open: the lost-server bar shows, and restarting reconnects.
   Point `agentics_path` at an empty folder: the `agentics_missing` sentence shows.
8. Compare with the mockup in the narrow pane, the wide pane, both themes, keyboard only, and
   reduced motion (the pane's emulation). Also check that pan and zoom are kept across a refresh
   (append another event while zoomed in).
- Put `<img src=x onerror=alert(1)>` in a task's context in the scratch copy. It must render as
  text.

- [ ] **Step 3: Answer the lookups**

In spec § 12, replace each lookup (`vscode://` in the pane, `fs.watch` promptness) with its dated
answer, then commit:

```bash
git add docs/superpowers/specs/2026-09-27-agentics-viewer-design.md
git commit -m "spec(agentics-viewer): the integration lookups answered"
```

## Acceptance
- [ ] The user records each § 13 criterion as passed. A failure gets a fix commit and a re-check.
- [ ] Spec § 12's lookups are answered.
