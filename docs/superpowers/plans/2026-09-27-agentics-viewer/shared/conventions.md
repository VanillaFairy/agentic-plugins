---
roles: implementer, test-author, auditor, reviewer
---
# Conventions

## TypeScript (viewer)

- Strict mode. `erasableSyntaxOnly` and `verbatimModuleSyntax` are on: no `enum`, no
  `namespace`, no parameter properties, and `import type` for types.
- Relative imports carry the `.ts` or `.tsx` extension (`import { FORMAT } from '../shared/snapshot.ts'`).
  Node runs the server files directly and resolves nothing else.
- Server files import only `node:` built-ins and each other. Web files may import the pinned
  libraries, but only `layout.ts`, `zoom.ts` and `markdown.ts` import d3 or marked or DOMPurify.
- File names are lower-case with dashes for modules (`model.ts`), PascalCase for components
  (`Board.tsx`).

## Tests

- Vitest, in `agentics-viewer/test/`, one file per module under test (`test/alerts.test.ts`).
- Test behaviour through the module's exported functions. Never assert on source text.
- Compute expected values from the fixture instead of typing literals where the fixture decides
  them. Assert the keys you need; never `toEqual` a whole object a correct implementation could
  extend.
- Fakes are a few lines of plain code (`test/fake-clock.ts`, fake agentics scripts). No
  `vi.mock`, no `vi.useFakeTimers`: time comes from the injected `Clock`.
- No test needs a DOM, and no test imports a `.tsx` file.
- Temporary directories come from `fs.mkdtempSync(join(os.tmpdir(), 'agentics-viewer-'))`.

## agentics tasks

Follow the agentics repository's own `CLAUDE.md`: docs land with the code in the same commit, and
data contracts are registered in `docs/DESIGN.md#data-contracts`. There are no dependencies and
no hooks.

## Copy

- Sentence case everywhere. No all-caps, no middle-dot-joined meta strings, and no `→` in
  buttons.
- The exact wording in the spec's §7.3, §7.5 and §8 tables is the wording. Copy it; don't
  paraphrase it.

## Commits

- One commit per task. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `ERROR: Failed to parse repository information` printed by `git commit` is noise from global
  hooks. Confirm a commit with `git log -1`.
