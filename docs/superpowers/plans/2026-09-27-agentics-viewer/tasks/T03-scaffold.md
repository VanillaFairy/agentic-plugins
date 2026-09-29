# T03: Viewer scaffold, pinned dependencies, shared types

rigor: tdd
size: ~26 turns (11 edit sites, 11 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | toolchain wiring with a new TypeScript major |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Snapshot contract and § Clock
- Read: `../shared/architecture.md` § Module boundaries
- Spec § 6.1 and § 11

## Dependencies
- Depends on: —
- Depended on by: T04, T05, T06, T07a, T08, T10a, T11

**Files:**
- Create: `agentics-viewer/package.json`, `agentics-viewer/package-lock.json` (by `npm install`)
- Create: `agentics-viewer/tsconfig.json`, `agentics-viewer/vite.config.ts`, `agentics-viewer/vitest.config.ts`
- Create: `agentics-viewer/.gitignore`
- Create: `agentics-viewer/shared/snapshot.ts`
- Create: `agentics-viewer/server/clock.ts`
- Create: `agentics-viewer/test/fake-clock.ts`
- Create: `agentics-viewer/test/fake-clock.test.ts`
- Create: `agentics-viewer/web/index.html`, `agentics-viewer/web/main.tsx`

**Scope / Negative Constraints:**
- Versions are exact, from spec § 11. No `^`, no `~`.
- No component or server logic beyond what's listed. `main.tsx` renders one placeholder line.
- `shared/snapshot.ts` is copied exactly from interfaces § Snapshot contract.

- [ ] **Step 1: package.json**

```json
{
  "name": "agentics-viewer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=26" },
  "scripts": {
    "test": "tsc --noEmit && vitest run --passWithNoTests",
    "build": "vite build",
    "start": "node server/main.ts"
  },
  "dependencies": {
    "d3-hierarchy": "3.1.2",
    "d3-selection": "3.0.0",
    "d3-transition": "3.0.1",
    "d3-zoom": "3.0.0",
    "dompurify": "3.4.16",
    "marked": "18.0.14",
    "preact": "10.29.8"
  },
  "devDependencies": {
    "@preact/preset-vite": "2.10.6",
    "@types/d3-hierarchy": "3.1.7",
    "@types/d3-selection": "3.0.12",
    "@types/d3-transition": "3.0.9",
    "@types/d3-zoom": "3.0.8",
    "@types/node": "26.6.3",
    "typescript": "7.0.2",
    "vite": "8.3.1",
    "vitest": "5.0.2"
  }
}
```

Run `npm install --save-exact` inside `agentics-viewer/`, then confirm that `package.json` still
has no range characters.

- [ ] **Step 2: Configs**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["shared", "server", "web", "test", "vite.config.ts", "vitest.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
export default defineConfig({ root: 'web', plugins: [preact()], build: { outDir: '../dist', emptyOutDir: true } })
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } })
```

`.gitignore`: `node_modules/` and `dist/`.

If TypeScript 7 rejects an option, change the smallest thing that makes `tsc --noEmit` pass, and
record why in the commit message.

- [ ] **Step 3: Shared types, clock and fake clock**

- `shared/snapshot.ts`: exactly interfaces § Snapshot contract.
- `server/clock.ts`: `Clock`, `TimerHandle` and `realClock`, wrapping `Date.now`, `setTimeout`
  and `clearTimeout` (a counter gives each handle its `id`).
- `test/fake-clock.ts`: `fakeClock(start = 0)` holding a list of `{ id, due, fn }`.
  - `advance(ms)` repeatedly takes the earliest timer due at or before `now + ms`, sets `now` to
    its due time and runs it, until none is due. Then it sets `now` to `start + total advanced`.
  - `pending()` counts timers not yet run.
  - `clearTimeout` removes a timer by id.

- [ ] **Step 4: Page placeholder**

`web/index.html` loads `/main.tsx` into `<div id="app">`, with `<title>agentics viewer</title>`.
`web/main.tsx` renders `<p>agentics viewer</p>` with `render` from `preact`.

- [ ] **Step 5: Test the fake clock**

T06's and T07a's tests rest on `fakeClock`, so it gets its own tests in `test/fake-clock.test.ts`,
one per acceptance line marked "test" below. Write them before finishing `fake-clock.ts`, and
see them fail first.

- [ ] **Step 6: Verify**

Run inside `agentics-viewer/`:
- `npm test`: tsc passes, and vitest passes with no tests.
- `npx vite build`: `dist/index.html` exists.
- `node -e "import('./server/clock.ts').then(m => console.log(typeof m.realClock.now()))"`:
  prints `number`, which proves Node runs the `.ts` file directly.

- [ ] **Step 7: Commit**

```bash
git add agentics-viewer
git commit -m "feat(agentics-viewer): scaffold with pinned dependencies and the snapshot types"
```

## Acceptance
- [ ] Every dependency version in `package.json` is exact and matches spec § 11.
- [ ] `npm test` passes; `npx vite build` writes `dist/index.html`.
- [ ] Node imports `server/clock.ts` with no build step.
- [ ] `shared/snapshot.ts` matches interfaces § Snapshot contract.
- [ ] `node_modules/` and `dist/` are not committed.
- [ ] Timers run in due-time order, whatever order they were set in → test 'timers run in due order'
- [ ] A timer set by a running timer, and due inside the same `advance`, also runs → test 'timers set by timers run in the same advance'
- [ ] After `advance(ms)`, `now()` is the start plus everything advanced → test 'now lands at the end of the advance'
- [ ] A cleared timer never runs → test 'clearTimeout cancels'
- [ ] `pending()` counts timers not yet run → test 'pending counts waiting timers'
