---
roles: implementer, test-author, auditor, reviewer
---
# Run the tests

From the plugin repo `C:\work\claude\vanillafairy\think-tank`:

```bash
node --test test/
```

One file: `node --test test/rules.test.mjs`. One test by name:
`node --test --test-name-pattern="consensus needs" test/rules.test.mjs`.

The suite has no build or typecheck step. It must finish green with zero failures before a commit.
