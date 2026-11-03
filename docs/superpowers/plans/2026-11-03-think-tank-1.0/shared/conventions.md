---
roles: implementer, test-author, auditor, reviewer
---
# Conventions

- Node built-ins only (`node:fs`, `node:path`, `node:child_process`, `node:test`, `node:assert/strict`).
  No dependencies, no build step, ES modules (`.mjs`).
- Match the existing style of `tt.mjs`: two-space indent, single quotes, semicolons, short arrow
  helpers, lines up to about 120 characters.
- Comments only where the code can't say it: a trap, a contract a type can't state. One line each.
- A pure module (`nodes`, `topics`, `rules`, `problems`) takes `nodes` and returns data. It never
  reads or writes files.
- Tests: `node:test` and `node:assert/strict`, one test file per module under `test/`, named
  `test/<module>.test.mjs`. A test name says the behaviour in plain words. Build `nodes` maps in
  memory with a small helper in the test file; only `store` and CLI tests touch the disk, in
  `mkdtempSync(join(tmpdir(), 'tt-'))` directories.
- Assert what a call does, never the source text. Derive expected values from the rule being
  tested, not from what the code returns now.
- Errors: throw `Error` with a message that names the bad input. The CLI turns a throw into the
  message on stderr and exit code 1.
