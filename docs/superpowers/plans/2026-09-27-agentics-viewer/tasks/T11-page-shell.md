# T11: Page shell: styles, stream client, header, Open project, layout

rigor: tdd
size: ~34 turns (10 edit sites, 13 files)

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
- Every sentence the page shows comes from `web/model.ts`: `problemText`, `staleText`,
  `malformedText`, `noEffortsText`, `browseErrorText`, `TEXT` and `tabTitle`. No sentence is
  typed into a component.
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
- **Bars** above the board: stale (`staleText(p, receivedAt)`), malformed (`malformedText`), and
  lost server (`TEXT.lostServer`).
- **In place of the board:** a `problem` (`problemText`), the no-project state (`TEXT.noProject`,
  with the Open project button), or no efforts (`noEffortsText`).
- **Header:**
  - project picker: shows the project name and opens Open project;
  - effort picker: a native `<select>` over `list.efforts`, sorted as the server's `efforts` event
    gives them, showing `about` or the name;
  - cost via `costText`, hidden when narrow;
  - an Open project button (the only filled button).
- **OpenProject:** a modal `<dialog>` with Found and Recent lists from `/api/projects`, and a
  Browse… button that `POST`s `/api/browse`. While it waits, it shows `TEXT.browseWaiting`. A
  chosen path navigates to `urlFor({project: path, effort: null, node: null})`. On `{error}` it
  shows `browseErrorText(error)`.
- **`openStream`** per interfaces § Page components: `make` defaults to `new EventSource(url)`.
  The tests pass a ten-line fake `EventSourceLike` that records listeners and lets the test fire
  events.

- [ ] **Step 1: Write the failing tests** for `readUrlState`, `urlFor` and `openStream` in
  `test/stream.test.ts`, one per acceptance line marked "test".
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
- [ ] `urlFor` omits nulls → test 'urlFor omits nulls'
- [ ] `urlFor` output read back by `readUrlState` gives the same state → test 'urlFor round-trips'
- [ ] `openStream('C:\My Work', null, h, make)` opens `/api/stream?project=C%3A%5CMy%20Work` with no effort param → test 'the stream url encodes the project and omits a null effort'
- [ ] With an effort, the url carries `&effort=<encoded>` → test 'the stream url carries the effort'
- [ ] An `efforts` event reaches `h.efforts` parsed → test 'efforts events reach their handler'
- [ ] A `snapshot` event reaches `h.snapshot` parsed → test 'snapshot events reach their handler'
- [ ] A `problem` event reaches `h.problem` parsed → test 'problem events reach their handler'
- [ ] A `stale` event reaches `h.stale` parsed → test 'stale events reach their handler'
- [ ] `open` calls `connection(true)` and `error` calls `connection(false)` → test 'connection state follows the source'
- [ ] The returned function closes the source → test 'the close function closes the source'
- [ ] `npm test` and `npx vite build` pass.
- [ ] `styles.css` carries every token of spec § 7.2, in light and dark.
- [ ] The stub components export the props of interfaces § Page components exactly (tsc checks
      `App.tsx`'s use of them).
