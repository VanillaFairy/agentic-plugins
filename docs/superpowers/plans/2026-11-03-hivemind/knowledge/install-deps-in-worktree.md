# Install dependencies in a fresh hivemind worktree
```bash
npm ci
```
Without it test/runner-sdk.test.mjs fails with `Cannot find package 'zod'`, which makes `node --test test/` red in a worktree that has no node_modules. node_modules is gitignored.
