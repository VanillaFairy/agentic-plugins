# T11: Page shell: styles, stream client, header, Open project, layout

rigor: tdd
size: ~32 turns (10 edit sites, 12 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | the app's state flow and the responsive shell are laid out here |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Page components, § HTTP and SSE and § View model (page)
- Spec § 7.1, § 7.2, § 7.4, § 7.5 (Header, Open project), § 7.6 and § 8
- Mockup: `docs/superpowers/specs/2026-09-27-agentics-viewer-mockup.html`. Its `<style>` block is
  the starting point for `styles.css`.

## Dependencies
- Depends on: T10b
- Depended on by: T12, T13, T14

**Files:**
- Create: `agentics-viewer/web/styles.css`
- Create: `agentics-viewer/web/stream.ts`
- Create: `agentics-viewer/web/App.tsx`, `agentics-viewer/web/Header.tsx`, `agentics-viewer/web/OpenProject.tsx`
- Create (stubs with final props): `agentics-viewer/web/Annunciator.tsx`, `agentics-viewer/web/Outline.tsx`, `agentics-viewer/web/Board.tsx`, `agentics-viewer/web/Detail.tsx`
- Modify: `agentics-viewer/web/main.tsx`, `agentics-viewer/web/index.html`
- Create: `agentics-viewer/test/stream.test.ts`

**Scope / Negative Constraints:**
- Every sentence the page shows comes from `web/model.ts` (`problemText`, `tabTitle`, …) or from
  the spec's §8 table copied into `App.tsx` for the page-only states: no project, no efforts,
  lost server, the malformed bar and the stale bar.
- The stubs render a placeholder `<div>` with a class name, and export exactly the props in
  interfaces § Page components. T12, T13 and T14 fill them.
- `styles.css` defines every token of spec § 7.2 under `:root`. The dark values sit under
  `@media (prefers-color-scheme: dark)`. `body` has an explicit background.
- No test imports a `.tsx` file.

**Interfaces:**
- Consumes: `web/model.ts` (T10b), the routes and events of interfaces § HTTP and SSE.
- Produces: `readUrlState`, `urlFor`, `openStream`, `StreamHandlers` and `UrlState`, plus the stub
  components with final props.

## Behaviour
- **`App`** holds: `url: UrlState`, `list`, `snapshot`, `problem`, `stale`, `connected`,
  `receivedAt`, `selected`, `narrow` (`matchMedia('(max-width: 899px)')`) and `listOpen`
  (narrow only).
  - When `url.project` is null, it fetches `/api/projects` and uses `last`. When that's null
    too, it shows the no-project state.
  - `efforts.selected` is written into the URL with `history.replaceState(null, '', urlFor(...))`,
    and so are selection changes.
  - `document.title = tabTitle(model.tiles)`.
- **Layout** (spec § 7.4): header, then annunciator, then the main grid of outline, board and
  detail. Below 900 px the grid is one column: a List button in the header toggles the outline
  drawer, and the detail panel becomes a bottom sheet of 52% height, shown only when a node is
  selected.
- **Bars** above the board:
  - stale: "Showing the board from `<hh:mm>`. The last refresh failed: `<detail>`.";
  - malformed: "`<n>` lines in the logs couldn't be read, so the board may be missing nodes.";
  - lost server: "Lost the viewer server. Reconnecting."
- **In place of the board:** a `problem` (via `problemText`), the no-project state ("Open a
  project to watch its efforts.", with the Open project button), or no efforts ("No efforts in
  `<name>` yet. Start one with /agentics:design.").
- **Header:**
  - project picker: shows the project name and opens Open project;
  - effort picker: a native `<select>` over `list.efforts`, sorted as the server's `efforts` event
    gives them, showing `about` or the name;
  - cost via `costText`, hidden when narrow;
  - an Open project button (the only filled button).
- **OpenProject:** a modal `<dialog>` with Found and Recent lists from `/api/projects`, and a
  Browse… button that `POST`s `/api/browse`. While it waits, it shows "The folder dialog is open.
  It may be behind this window." A chosen path navigates to `urlFor({project: path, effort: null,
  node: null})`. On `{error}` it shows "Couldn't open the folder dialog: `<error>`."
- **`openStream`** uses `EventSource`, maps the four events to the handlers, and calls
  `connection(false)` on `error` and `connection(true)` on `open`. It returns a close function.

- [ ] **Step 1: Write the failing tests** for `readUrlState` and `urlFor` in `test/stream.test.ts`,
  one per acceptance line marked "test".
- [ ] **Step 2: Run**: `npx vitest run test/stream.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `stream.ts`, then the components and styles.
- [ ] **Step 4: Run** `npm test` and `npx vite build`. Expected: both pass.
- [ ] **Step 5: Commit**

```bash
git add agentics-viewer/web agentics-viewer/test/stream.test.ts
git commit -m "feat(agentics-viewer): page shell, stream client, header and Open project"
```

## Acceptance
- [ ] `readUrlState('?project=C%3A%5Cwork%5Cx&effort=e&node=a%2Fb')` gives the decoded three values → test 'url state decodes'
- [ ] Missing params read as null → test 'missing params are null'
- [ ] `urlFor` omits nulls and round-trips through `readUrlState` → test 'urlFor round-trips and omits nulls'
- [ ] `npm test` and `npx vite build` pass.
- [ ] `styles.css` carries every token of spec § 7.2, in light and dark.
- [ ] The stub components export the props of interfaces § Page components exactly (tsc checks
      `App.tsx`'s use of them).
