---
roles: implementer, test-author, auditor, reviewer
---
# Run the tests

From the plugin repo `C:\work\claude\vanillafairy\hivemind`:

```bash
node --test test/
```

One file: `node --test test/strength.test.mjs`. One test by name:
`node --test --test-name-pattern="weak attacks" test/strength.test.mjs`.

No test calls a model or the network: runners are stubbed. The suite must finish green before a
commit. After T01, `npm ci` installs the pinned dependencies; run it once in a fresh worktree.
