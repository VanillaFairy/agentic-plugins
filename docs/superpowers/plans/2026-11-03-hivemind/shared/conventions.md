---
roles: implementer, test-author, auditor, reviewer
---
# Conventions

- Node ≥ 20, ES modules (`.mjs`), two-space indent, single quotes, semicolons.
- Dependencies are only those pinned in `package.json` (the Agent SDK and `zod`), exact versions,
  no `^` or `~`. Only `src/runner-sdk.mjs` imports the SDK; only `src/runner-sdk.mjs` and
  `src/tools.mjs`'s schema export import `zod`.
- A pure module (see `architecture.md` § Module boundaries) never touches the file system, the
  clock or `Math.random`; randomness comes from an injected `rng()` returning [0, 1).
- Comments only where the code can't say it: a trap, a contract a type can't state. One line each.
- Tests: `node:test` and `node:assert/strict`, one file per module, `test/<module>.test.mjs`. A
  test name says the behaviour in plain words. Pure-module tests build graphs in memory with a
  small helper in the test file; only store, hive, scheduler, runner and CLI tests touch the disk,
  in `mkdtempSync(join(tmpdir(), 'hive-'))`.
- Assert what a call does. Derive expected values from the rule being tested, not from what the
  code returns now. Compare floating values with a tolerance (`Math.abs(a − b) < 1e-6`).
- Errors throw `Error` with a message naming the bad input.
