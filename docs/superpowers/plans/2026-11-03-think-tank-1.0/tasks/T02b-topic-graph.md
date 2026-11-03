# Task T02b: Topic graph — implementation

rigor: pair
role: green
size: ~17 turns (2 edit sites, 6 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | graph algorithms against locked tests |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Topic graph and § Nodes
- Read: `../shared/architecture.md` § Design decisions

## Dependencies
- Depends on: T02a
- Depended on by: T06

## Scope
**Files:**
- Modify: `skills/think-tank/scripts/lib/topics.mjs` (replace the stubs)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Implement every export of `shared/interfaces.md` § Topic graph exactly.
- Import `nodeId` and `list` from `./nodes.mjs`.
- Find cycles with Tarjan's strongly connected components over canonical topics that carry no
  `duplicate_of`; a component counts when it has more than one topic, or one topic in its own
  `needsOf`.
- Guard every recursion against revisits (a `Set` of seen ids), since the graph can hold cycles.

```js
export function cycles(nodes) {
  const ids = topicIds(nodes);            // canonical topics without duplicate_of
  let index = 0; const idx = new Map(), low = new Map(), stack = [], on = new Set(), out = [];
  const visit = (v) => {
    idx.set(v, index); low.set(v, index++); stack.push(v); on.add(v);
    for (const w of needsOf(nodes, v)) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = []; let w;
      do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1 || needsOf(nodes, v).includes(v)) out.push(comp.sort());
    }
  };
  for (const v of ids) if (!idx.has(v)) visit(v);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}
```

## Negative Constraints (DO NOT)
- Do NOT modify `test/topics.test.mjs`: it was authored by T02a and is locked. If a test is wrong,
  escalate; never edit it.
- Do NOT read or write files from this module.

## Implementation Steps

### Step 1: Read the locked tests
Read `test/topics.test.mjs` in full before writing code.

### Step 2: Implement `topics.mjs`

### Step 3: Run to verify they pass
Run: `node --test test/`
Expected: PASS, the whole suite.

### Step 4: Commit
```bash
git add skills/think-tank/scripts/lib/topics.mjs
git commit -m "Track which topics block, unblock and reopen each other"
```

## Acceptance Criteria
- [ ] Every test in `test/topics.test.mjs` passes, unmodified
- [ ] The full suite is green
- [ ] No files outside Scope were modified
