# Wrap the locked script runner to make one call misbehave

```js
const runner = { ...createScriptRunner(opts), wake: async (...args) => { throw new Error('boom'); } };
```

The fixture's methods are closures, so spreading it and replacing `start`, `wake` or `fork` keeps `calls`, `stamp`, `of` and `wakes` working. A replaced method records no call of its own; delegate to the original (`inner.wake(...args)`) for the calls that should be recorded. For a limit result that costs nothing, return `{ usage: ZERO_USAGE, context: 0, limit: true }` (`ZERO_USAGE` is exported by the fixture).
