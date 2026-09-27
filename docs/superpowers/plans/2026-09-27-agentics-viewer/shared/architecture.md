# Architecture

The spec is `docs/superpowers/specs/2026-09-27-agentics-viewer-design.md` in the vanillafairy
repository. The mockup beside it is the reference for the look.

## Two repositories

| repository | path | branch | what lands there |
|---|---|---|---|
| agentics | `C:/work/claude/vanillafairy/agentics` (the vanillafairy submodule) | `design-loop` | `status.mjs snapshot`, `store` on `status.mjs list`, their tests and DESIGN.md entries (T02a, T02b) |
| vanillafairy | `C:/work/claude/vanillafairy/.claude/worktrees/agentics-tasks-observability-f37843` | `claude/agentics-tasks-observability-f37843` | everything under `agentics-viewer/`, and the repo chores (T15) |

Every task file names its repository on its **Repository:** line. A task's worktree is cut from
that repository's branch.

## Module boundaries (the viewer)

- `agentics-viewer/shared/snapshot.ts`: the contract types and `FORMAT`. Types only, plus one
  constant. Both halves import it.
- `agentics-viewer/server/`: Node 26 runs these `.ts` files directly. Node built-ins only, no npm
  runtime dependency. Every side effect (clock, file system roots, child processes, the state
  file path) is passed in, so tests drive them with small fakes.
  - `clock.ts`: `Clock`, `realClock`.
  - `state.ts`: the state file.
  - `agentics.ts`: finds agentics, runs `status.mjs`, and turns failures into `Problem`s.
  - `projects.ts`: discovery, recent projects, the most recently active effort.
  - `windows.ts`: toast and folder dialog through `powershell.exe`.
  - `watch.ts`: the refresh scheduler and the store watcher.
  - `alerts.ts`: the watermark diff. Pure.
  - `app.ts`: HTTP routes, SSE and wiring. `main.ts`: the process entry.
- `agentics-viewer/web/`: the page, built by Vite with Preact.
  - `model.ts`: pure. Snapshot → view model, all wording, and all problem text. Every piece of
    copy the page shows lives here or in `styles.css` content, never inline in a component.
  - `layout.ts`, `zoom.ts`, `markdown.ts`: one module per library (d3-hierarchy; d3-zoom,
    d3-selection and d3-transition; marked and DOMPurify).
  - `stream.ts`: the EventSource client and URL state.
  - Components (`App.tsx`, `Header.tsx`, `OpenProject.tsx`, `Annunciator.tsx`, `Outline.tsx`,
    `Board.tsx`, `Detail.tsx`): thin. They render the model and call back. They hold no rules.
- `agentics-viewer/test/`: vitest suites and fixtures. No test imports a component or needs a
  DOM.

## Design decisions made while planning

The spec leaves these open. Each is cheap to reverse.

- **Return wording** (§7.5 "the `return` in words"):
  - `needs_decision` → "needs a decision"
  - `needs_design` → "needs design"
  - `needs_respec`, `spec_defect`, `premise_mismatch`, `contract_changed`, `contract_drift` →
    "needs the spec fixed"
  - `cant_tell` → "can't tell from the evidence"
  - `integration_critical` → "needs a decision on the merged work"
  - anything else: the raw value with `_` replaced by spaces
- **Counts** in the annunciator are over leaves and design nodes only:
  - working: leaves `active` or `approved`;
  - merged: leaves `merged`, `integrated` or `landed`;
  - queued: leaves `planned`;
  - need design: design nodes `open`.
- **Children order** on the board and in the outline: by id, ascending.
- **Stream selection.** When the page asks for a project without an effort, the server picks
  the most recently active effort and names it in the `efforts` event. The page then writes it
  into the URL.
- **`stale` vs `problem`.** A refresh that fails before the connection has received any snapshot
  sends `problem`. One that fails later sends `stale`, and the page keeps its board.
- **Problem text lives on the page** (`model.ts` `problemText`). The server sends codes and
  facts, never sentences.
