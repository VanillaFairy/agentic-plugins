# Task T08a: Hive and physics tools — tests

rigor: triad
role: red
size: ~32 turns (6 edit sites, 12 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| test-author | sonnet | xhigh | the Hive's persistence is the save format of the books |
| review | opus | medium | |
| fix | sonnet | high | persistence fixes |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Tools and the Hive and § Graph and § Economy and § Strength and § Thermostat and § Dung and harvest
- Read: `../shared/architecture.md` § Node kinds and § The clock and § Run directory

## Dependencies
- Depends on: T02b, T03b, T04, T05c, T06, T07
- Depended on by: T08b, T08c

## Scope
**Files:**
- Create: `test/tools.test.mjs`, `test/hive.test.mjs`
- Create: `src/hive.mjs` and `src/tools.mjs` with the exported names from `interfaces.md` § Tools and the Hive, every method and function throwing `new Error('not implemented')`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Each test builds a run with `initRun` in a temp dir, writes agent nodes with `writeNode`
  (`energy`, `escrow`, `lineage`, `niche`, `genome`), then `Hive.open(dir)` and calls `runTool`.
- A source fixture: write a small text file under a temp folder and name that folder in the goal's
  `sources`.

## Negative Constraints (DO NOT)
- Do NOT implement `hive.mjs` or `tools.mjs` beyond the stubs.

## Failure Modes
- Interrupted mid-write, then run again: a crash after a node write but before `persist` → acceptance line 'a crash before persist loses only the unpersisted tick'
- An input deleted, renamed or removed: a message to an agent that died → acceptance line 'message reaches a living agent only'
- A value changed: a node updated after it was written keeps its seq and tick → acceptance line 'update changes fields but never the clock stamps'
- Every path into a guarded state (a closed account): tools by the dead are refused → acceptance line 'the dead can't act'
- Run from a linked worktree and from the main checkout: n/a: the Hive reads only the run directory it is given
- Each target that already exists: reopening a persisted run → acceptance line 'a reopened hive has the same books and clock'

## Implementation Steps
### Step 1: Write the tests, one per acceptance line
### Step 2: Run `node --test test/tools.test.mjs test/hive.test.mjs` — Expected: every test FAILS with `not implemented`
### Step 3: Commit
```bash
git add test/tools.test.mjs test/hive.test.mjs src/hive.mjs src/tools.mjs
git commit -m "Pin the hive's physics tools and its persistence in tests"
```

## Acceptance Criteria
Every tool:
- [ ] An accepted call debits its price before its effect, advances the tick once and logs a `tool` event → test 'an accepted tool pays, ticks once and is logged'
- [ ] A call the agent can't afford is refused, changes nothing and doesn't tick → test 'an unaffordable tool is refused without a tick'
- [ ] A call by a dead agent is refused → test 'the dead can't act'
- [ ] An unknown tool name is refused → test 'an unknown tool is refused'

Per tool:
- [ ] `look` returns the niche, its strongest answers, its most tense claims, the niche question's worldviews and cruxes, the unread inbox (then marked read), the balance and the temperature → test 'look shows the niche, its worldviews, the inbox and the balance'
- [ ] `read` returns a node, and refuses an unknown id → test 'read returns a node or refuses'
- [ ] `source` returns a page of a file under a goal source and records the path in `sources_read`; price follows bytes → test 'source reads a charter file and remembers it'
- [ ] `source` refuses a path outside every goal source, including `..` escapes and a sibling folder sharing the source's name as a prefix → test 'source refuses paths outside the charter'
- [ ] `claim` writes a claim node with author, seq and tick → test 'a claim is written with its author and clock'
- [ ] `claim` refuses zero or two relations (unless a term), and a relation target of the wrong kind → test 'a claim needs exactly one relation of the right kind'
- [ ] `claim` with provenance F refuses a missing source → test 'an observed claim needs a source'
- [ ] `claim` with `checks` refuses when the author hasn't read the checked claim's source → test 'a check needs the source read first'
- [ ] An attack pays its author the critic pay for the strength it removed → test 'an attack that weakens its target pays the critic'
- [ ] A target's first attack claim from another lineage that it survives pays its author novelty once, scaled by the thermostat's `novelty_weight`; a second attack pays no more → test 'surviving a first foreign attack pays novelty once'
- [ ] A new rival answer is not an attack: it pays no critic and triggers no novelty → test 'a rival answer is not an attack for pay'
- [ ] `decides` must name two answers to the same question → test 'decides names two rival answers'
- [ ] `define` writes a claim with `term: true` → test 'define writes a term'
- [ ] `question` writes a question under an existing question or the goal → test 'question opens a sub-question'
- [ ] `message` appends `{ from, text, tick, read: false }` to a living recipient's `inbox` and refuses a dead or unknown one → test 'message reaches a living agent only'
- [ ] `ask_user` writes an `ask` node with its candidates and refuses unknown candidates → test 'ask_user records the question and its candidates'
- [ ] `spawn` queues a birth of kind spawn with the endowment, moves no energy, and refuses an endowment above the balance → test 'spawn queues a child the parent can afford'
- [ ] `seed` is refused to anyone but the founder, and queues one birth per valid genome → test 'only the founder seeds'
- [ ] `rest` costs nothing and returns `done: true` → test 'rest ends the wake for free'

The Hive:
- [ ] `persist` then `Hive.open` restores balances, escrows, supply, the ledger totals, the thermostat, the tick and queued births → test 'a reopened hive has the same books and clock'
- [ ] A Hive reopened without `persist` after a tool call still opens, with books that balance → test 'a crash before persist loses only the unpersisted tick'
- [ ] `update` changes fields of an existing node but never its `seq` or `tick` → test 'update changes fields but never the clock stamps'
- [ ] `unread` returns only inbox entries with `read: false` → test 'look shows the niche, its worldviews, the inbox and the balance'
- [ ] `strengths()` is recomputed after a write or an update and reused otherwise → test 'strengths refresh after a write'
- [ ] `maybeCommit` commits every `commit_every` ticks and not between → test 'the graph is committed every commit_every ticks'
- [ ] No files outside Scope were modified
