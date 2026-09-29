# T13: The board: tree layout, pan, zoom and selection

rigor: tdd
size: ~30 turns (7 edit sites, 9 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | d3-zoom inside Preact, and keeping the transform across refreshes |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Page components and § View model (page)
- Spec § 7.3 and § 7.5 (Board), § 7.6
- Mockup: `docs/superpowers/specs/2026-09-27-agentics-viewer-mockup.html` (`.blk`, `.track`, `.after`, `.zoom`)

## Dependencies
- Depends on: T11
- Depended on by: T15b

**Files:**
- Create: `agentics-viewer/web/layout.ts`
- Create: `agentics-viewer/test/layout.test.ts` (imports only `layout.ts` and `test/snapshot-fixture.ts`; d3-hierarchy needs no DOM)
- Create: `agentics-viewer/web/zoom.ts`
- Modify: `agentics-viewer/web/Board.tsx`
- Create: `agentics-viewer/web/board.css`: the board rules, imported by `Board.tsx`. Tokens come
  from `styles.css` (T11), which this task does not modify

**Scope / Negative Constraints:**
- Only `layout.ts` imports `d3-hierarchy`. Only `zoom.ts` imports `d3-zoom`, `d3-selection` and
  `d3-transition`.
- Preact renders every block, track and edge. d3 only computes positions and handles the
  pan/zoom transform on a `<g>`.
- Don't touch `App.tsx` or the other components.

**Interfaces (internal to this task):**

```ts
// web/layout.ts
export interface Placed { id: string; x: number; y: number }       // x across depth, y down
export interface Layout { placed: Map<string, Placed>; width: number; height: number }
export const BLOCK = { w: 170, h: 48, rowGap: 12, depthGap: 60 }    // 60 px between rows = h + rowGap; 230 px between depths = w + depthGap
export function layoutTree(model: BoardModel): Layout               // d3-hierarchy tree().nodeSize([BLOCK.h + BLOCK.rowGap, BLOCK.w + BLOCK.depthGap]), children from model
// web/zoom.ts
export interface ZoomControl { zoomIn(): void; zoomOut(): void; fit(): void; panTo(x: number, y: number, visible: DOMRect): void; dispose(): void }
export function attachZoom(svg: SVGSVGElement, layer: SVGGElement, content: () => { width: number; height: number }, reducedMotion: boolean): ZoomControl
```

## Behaviour
- **Blocks:**
  - a `<g class="blk <lamp>">` with a 3 px-radius rect, the lamp circle, the name
    (semi-condensed, weight 600) and the wording line;
  - folders (with children) get `comp` and a 15 px name;
  - `open` blocks are dashed with no fill, `done` blocks recessed, and `hold` and `stop` blocks get
    2.5 px coloured borders;
  - the selected block gets a 2.5 px `--ink` border, except `hold` and `stop`, which keep their
    colour.
- **Tracks:** orthogonal elbows from the parent's right edge to each child's left edge. A folder
  for which `subtreeDone(model, id)` holds draws its tracks `class="track q"`.
- **After edges:** for the selected node, `afterEdges` gives dashed `--work` arrows from each
  incoming node to it, and from it to each outgoing node. They're routed to the right of the
  blocks.
- **Zoom:**
  - scale 1 by default, centered. `fit()` fits the layout and never scales above 1. Zoom limits
    are 0.25 to 2;
  - buttons `+`, `−` and fit sit bottom-right, with `aria-label`s "Zoom in", "Zoom out" and "Fit
    the tree";
  - the transform is kept across refreshes: re-render doesn't reset it.
- **Selection:**
  - clicking a block calls `onSelect`;
  - when `selected` changes, `panTo` brings the block into the visible area. In narrow mode that's
    the strip above the bottom sheet (the top 48% of the board); in wide mode, the board's own
    rect;
  - the pan animates over 250 ms, or jumps with reduced motion.
- Blocks are focusable (`tabindex="0"`, `role="button"`, `aria-label` = `<name>, <wording>`), and
  Enter selects.

- [ ] **Step 1: Write the failing layout tests** in `test/layout.test.ts`, one per acceptance line
  marked "test". Build models with `buildModel(snap(...))`. Compute expectations from `BLOCK`.
- [ ] **Step 2: Run**: `npx vitest run test/layout.test.ts`. Expected: FAIL (no module).
- [ ] **Step 3: Implement** `layout.ts`, then `zoom.ts`, `Board.tsx` and the board styles.
- [ ] **Step 4: Verify**: `npm test` and `npx vite build` pass.
- [ ] **Step 5: Commit**

```bash
git add agentics-viewer/test/layout.test.ts agentics-viewer/web/layout.ts agentics-viewer/web/zoom.ts agentics-viewer/web/Board.tsx agentics-viewer/web/board.css
git commit -m "feat(agentics-viewer): the board, a left-to-right tree with pan, zoom and after edges"
```

## Acceptance
- [ ] `npm test` and `npx vite build` pass.
- [ ] Every node in `model.order` is placed → test 'every node is placed'
- [ ] A child's `x` is its parent's `x` plus `BLOCK.w + BLOCK.depthGap` → test 'children sit one depth to the right'
- [ ] Any two placed nodes at one depth are at least `BLOCK.h + BLOCK.rowGap` apart in `y` → test 'blocks at one depth never overlap'
- [ ] An orphan is placed as a child of the root → test 'orphans hang from the root'
- [ ] All coordinates are shifted so the minimum `x` and `y` are 0, and `width`/`height` cover the
      farthest block edge → test 'the layout starts at the origin and reports its size'
- [ ] Only `layout.ts` and `zoom.ts` import d3 packages (`grep -l "from 'd3-" web/` lists only them).
- [ ] Blocks, tracks and after edges follow the Behaviour list. They're checked against the
      mockup in T15b.
