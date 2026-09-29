---
roles: implementer, test-author, auditor
---
# `mutation-probe.cjs`'s baseline run leaves a stray `node_modules` at the worktree root

Run the probe from the worktree root (not `agentics-viewer/`), with mutant `file` paths like
`agentics-viewer/server/agentics.ts`:

```
node C:/Users/dragm/.claude/plugins/cache/superpowers-dev/vf-superpowers/6.4.1/skills/subagent-driven-development/scripts/mutation-probe.cjs --mutants <mutants.json> --out <report.md>
```

Vitest's baseline run creates its `.vite` cache directly under the worktree root, so `git status`
afterwards shows an untracked `node_modules/` there — not the real `agentics-viewer/node_modules`
junction. Delete it (`rm -rf node_modules` at the worktree root, not inside `agentics-viewer/`)
before staging your commit.
