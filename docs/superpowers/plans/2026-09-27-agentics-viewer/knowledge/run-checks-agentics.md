# Run agentics' checks

From the agentics repository root (`C:/work/claude/vanillafairy/agentics`, branch `design-loop`):

```bash
node tools/lint.mjs && node --test
```

One file: `node --test test/<name>.test.mjs`. The full suite takes about 90 seconds. Save its
output once and read the counts from it:

```bash
f=$(mktemp); node --test > "$f" 2>&1; grep -E '^ℹ (tests|pass|fail)' "$f"; grep -E '^✖ ' "$f"; echo "full output: $f"
```

There is no `package.json` and nothing to install. `test/design-doc.test.mjs` fails on any
`docs/DESIGN.md#<anchor>` pointer whose heading is gone. `test/liveness.test.mjs` fails anything
defined and never consumed.
