# Task T03b: Closing rules — implementation

rigor: pair
role: green
size: ~17 turns (2 edit sites, 6 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | many interacting conditions against locked tests |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Closing rules and § Nodes

## Dependencies
- Depends on: T03a
- Depended on by: T06

## Scope
**Files:**
- Modify: `skills/think-tank/scripts/lib/rules.mjs` (replace the stub)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Implement `topicRules` exactly as `shared/interfaces.md` § Rule definitions states.
- Import `topicOf`, `nodeId` and `list` from `./nodes.mjs`.
- Compute the topic's node set once (`[...nodes.values()].filter((n) => topicOf(nodes, n.id) === topic)`)
  and derive every rule from it.
- Compare `seq`, `confidence` and `wakes` as numbers (`Number(...)`), since frontmatter may hold
  them as strings.

## Negative Constraints (DO NOT)
- Do NOT modify `test/rules.test.mjs`: it was authored by T03a and is locked. If a test is wrong,
  escalate; never edit it.
- Do NOT read or write files from this module.

## Implementation Steps

### Step 1: Read the locked tests
Read `test/rules.test.mjs` in full before writing code.

### Step 2: Implement `rules.mjs`

### Step 3: Run to verify they pass
Run: `node --test test/`
Expected: PASS, the whole suite.

### Step 4: Commit
```bash
git add skills/think-tank/scripts/lib/rules.mjs
git commit -m "Apply consensus, crux, stall, loop, cap and escalation rules per topic"
```

## Acceptance Criteria
- [ ] Every test in `test/rules.test.mjs` passes, unmodified
- [ ] The full suite is green
- [ ] No files outside Scope were modified
