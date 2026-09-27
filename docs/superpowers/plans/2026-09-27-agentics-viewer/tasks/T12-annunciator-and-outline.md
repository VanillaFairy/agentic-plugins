# T12: Annunciator and outline

rigor: verify
size: ~18 turns (4 edit sites, 6 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Page components and § View model (page)
- Spec § 7.3 and § 7.5 (Annunciator, Outline), § 7.6
- Mockup: `docs/superpowers/specs/2026-09-27-agentics-viewer-mockup.html` (`.ann`, `.tile`, `.rail`, `.row`, `.lamp`)

## Dependencies
- Depends on: T11
- Depended on by: T15

**Files:**
- Modify: `agentics-viewer/web/Annunciator.tsx`
- Modify: `agentics-viewer/web/Outline.tsx`
- Create: `agentics-viewer/web/annunciator.css`: the annunciator and outline rules, imported by
  `Annunciator.tsx`. Tokens come from `styles.css` (T11), which this task does not modify

**Scope / Negative Constraints:**
- No rules in the components: wording and order come from the model.
- `localStorage` access is wrapped in try/catch. Without it, tiles flash until they clear.
- Don't touch `App.tsx` or the other components.

## Behaviour
- **Annunciator:**
  - One `<button class="tile hold|stop">` per tile, in model order, with a lamp glyph, the title
    and the `why` on a one-line ellipsis.
  - A tile is `unack` (flashing) unless `tileKey(project, effort, tile)` is in `localStorage` under
    `agentics-viewer:ack`. A JSON array holds at most 200 keys, newest last.
  - Clicking a tile, or `selected` becoming its node, adds its key and calls `onSelect`.
  - The flash is a 1.1 s `steps(1, end)` animation. Under reduced motion there's no animation,
    just an inset 2 px outline until acknowledged.
  - Counts show to the right on wide screens: `<n> working`, `<n> merged`, `<n> queued`,
    `<n> need design`, each with its lamp.
  - With no tiles, only the counts line shows.
- **Outline:**
  - A "Find a node" `<input>` filters rows whose name or title contains the text,
    case-insensitively. A match's ancestors stay visible.
  - Rows follow `model.order`, indented 12 px per depth, each with its lamp, name and wording.
    Folder rows (with children) toggle collapsed on click of a chevron.
  - The selected row has a 3 px `--ink` inset bar.
  - Keys: Up and Down move the selection through visible rows, Left collapses, Right expands, and
    Enter selects. The list is a `role="tree"` with `role="treeitem"` rows and `aria-selected`.

- [ ] **Step 1: Implement** both components and their styles.
- [ ] **Step 2: Verify**: `npm test` and `npx vite build` pass.
- [ ] **Step 3: Commit**

```bash
git add agentics-viewer/web/Annunciator.tsx agentics-viewer/web/Outline.tsx agentics-viewer/web/annunciator.css
git commit -m "feat(agentics-viewer): annunciator tiles and the outline"
```

## Acceptance
- [ ] `npm test` and `npx vite build` pass.
- [ ] Tiles render in model order with the classes the mockup uses. Acknowledgement is stored
      under `agentics-viewer:ack` and capped at 200 keys.
- [ ] Reduced motion removes the animation (a `prefers-reduced-motion` rule in `annunciator.css`).
- [ ] The outline has the tree roles, keyboard handling, filter and collapse described above.
