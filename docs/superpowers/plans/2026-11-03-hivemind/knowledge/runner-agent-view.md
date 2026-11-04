# Pass the runner a flat view that carries the whole front matter

```js
const view = { ...hive.graph.get(id).fm };   // id, session, founder, genome, ...
await runner.start(view, genomeTurn, tools);
```

The real SDK runner reads only `agent.id` and `agent.session`, but `test/fixtures/script-runner.mjs` picks its script from `fm.founder` and `fm.genome.lens` of the object it is handed, and accepts a flat object. A view of just `{ id, session }` makes the founder and lens-keyed scripts unreachable.
