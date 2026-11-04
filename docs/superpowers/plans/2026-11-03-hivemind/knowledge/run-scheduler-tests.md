---
roles: implementer, auditor, reviewer
---
# Run the scheduler tests alone

```bash
node --test test/scheduler.test.mjs
```

About 25 s for 37 tests (each builds a git-backed run in a temp dir); the full `node --test test/` is about 26 s because files run in parallel. Do not pipe a `python -` heredoc in the same Git Bash command: it can hang the call.
