# Shared Interfaces

Paths are relative to the plugin repo `C:\work\claude\vanillafairy\hivemind`. A `Graph` is
`Map<id, Node>`, `Node = { id, fm, title, body }`, where `fm.kind` is the node kind (§ Node kinds in
`architecture.md`). `physics` is the merged physics object. Numbers in frontmatter may arrive as
strings; every module compares them with `Number(...)`.

## Graph

**Produced by:** T01. **Consumed by:** every later task.

```js
// src/graph/nodes.mjs
export function parseNode(text)          // → { fm, title, body, unclosed }; body excludes the `# title` line
export function serializeNode(node)      // → text; parseNode(serializeNode(n)) round-trips fm (objects, arrays,
                                         //   booleans, null and numbers included), title and body
// src/graph/schema.mjs
export const SCHEMA                      // { [kind]: { required: [...], refs: [...], lists: [...], values: {field: [...]} } }
export function nodeProblems(graph)      // → [{ node, problem }]: missing required field, ref to a missing node,
                                         //   value outside its set, a claim with more than one of answers/attacks/supports
// src/graph/store.mjs
export function initRun(dir, goal)       // creates the run directory (architecture § Run directory), graph/g-1.md, git init; → { dir }
export function loadGraph(dir)           // → Graph from graph/*.md
export function nextSeq(dir)             // → integer, persisted in <dir>/seq
export function writeNode(dir, node)     // writes graph/<id>.md
export function commit(dir, message)     // git add -A && git commit in graph/; → short sha or null when clean
// src/graph/lineage.mjs
export function lineageOf(graph, nodeId)  // the lineage of the node's author agent; 'user' for author 'user'; null if unknown
export function rivalEdges(graph, qid?)   // → [from, to][]: both directions for every two answers to one question
                                          //   (only qid's when given), sorted
// src/events.mjs
export function logEvent(dir, event)     // appends JSON + '\n' to events.jsonl with a `t` (tick) and `type`
// src/physics.mjs
export function loadPhysics(dir)         // physics.json defaults deep-merged with the goal's `settings.physics`
```

`parseValue` tries `JSON.parse` on every value first and falls back to think-tank's bare-YAML rules.
`author` and `seq` are not schema-required: the Hive stamps them on every node it writes.

## Strength

**Produced by:** T02. **Consumed by:** T04, T05, T07, T08, T09.

```js
// src/strength.mjs
export function baseScore(graph, claimId, physics)  // provenance base, after verification (rules below)
export function computeStrengths(graph, physics)    // → Map<id, number> for every argument, with a
                                                    //   `converged` boolean property on the Map
export function relevance(graph, strengths)         // → Map<question id, number>; the goal is 1
export function claimRelevance(graph, rel, claimId) // the relevance of the question the claim's relation chain leads to; 0 if none
```

Rules:

- **Arguments:** every claim, every `ask` node (base `base.I`, ceiling `ceiling.I`; claims attack or
  support it like a claim), and one relevance argument `<qid>#relevance` per question.
- **Relations:** `attacks: X` is an attack on X, `supports: X` a support of X. `answers` is not a
  relation between arguments. **Rival answers:** every two answers to the same question attack each
  other (`rivalEdges`); the rival attacker's lineage is its author's.
- **Same-lineage supports don't count:** a support whose author's lineage equals the target's
  author's lineage is ignored. Attacks always count.
- **Lineage aggregation:** for a target, group its attackers (claims and rivals) by lineage and keep
  the strongest per lineage; the same for supporters. Energy `E = Σ supporter maxima − Σ attacker maxima`.
- **Update (quadratic energy model):** `h(x) = max(x,0)² / (1 + max(x,0)²)`;
  `f(w, E) = E ≤ 0 ? w − w·h(−E) : w + (1−w)·h(E)`. Iterate
  `s ← s + step·(f(w, E(s)) − s)` for all arguments together until the largest change is below
  `eps` (`converged = true`) or `max_iters` is reached (`converged = false`, the last iterate kept);
  then clamp each claim to its ceiling.
- **Base scores:** `A` → `base.A`; `I` → `base.I`; `F` → `base.F_verified` if a claim with
  `supports: <it>` and `checks: <it>` exists by another lineage, `base.F_failed` if a claim with
  `attacks: <it>` and `checks: <it>` exists by another lineage (failed wins over verified),
  else `base.F_unchecked`. Ceilings use the same keys from `ceiling`.
- **Relevance arguments:** base = parent question's relevance × `question_base_factor`; a question
  whose parent is the goal takes base `question_base_factor`. Computed parents-first.
- **Pins:** a node with `pinned` keeps strength exactly `Number(pinned)` and is never updated.
- **Being tested** (used by economy, tools and harvest) counts only `attacks` claims, never rivalry.

## Dung and harvest

**Produced by:** T03. **Consumed by:** T07, T08, T12.

```js
// src/dung.mjs
export function preferredExtensions(args, attacks, { max = 64 } = {})
// args: string[]; attacks: [from, to][]; → string[][]: the maximal admissible sets (conflict-free,
// each member defended against every attacker), each sorted, the list sorted; at most `max`
// (the rest dropped, flagged by `.truncated = true` on the returned array)

// src/harvest.mjs
export function questionSubtree(graph, qid)          // → { args, attacks }: qid's answers and every claim beneath
                                                     //   them by attacks/supports; attacks include the answers' rivalry
export function worldviews(graph, strengths, qid, physics)
// → { answers: string[][], cruxes: [{ between: [a, b], chain: string[], decides: id|null }] }
//   answers: each preferred extension projected onto qid's answers, keeping only answers with
//   strength ≥ harvest_threshold that `attacks` claims from ≥ 2 lineages other than their own target
//   directly; duplicates and empty projections removed
//   cruxes: for each pair of worldviews, the pair of answers (one from each) that the shortest
//   attack chain connects (a rival pair connects directly), that chain, and the strongest claim
//   whose `decides` names that pair
export function skeleton(graph, strengths, physics)  // → [{ question, relevance, worldviews }] by relevance desc
export function reportInput(graph, strengths, physics, books)
// → { questions: skeleton(...), verdicts: [{ id, text, addresses }], spend: books } as one text block
//   for the reporter; `books` = { initial, added, spent, writtenOff, supply }
```

## Field

**Produced by:** T04. **Consumed by:** T07, T08, T09.

```js
// src/field.mjs
export function writesTo(graph, id)               // → [{ id, author, tick, verdict: boolean }]: nodes whose answers/attacks/
                                                  //   supports/checks names id, and verdicts whose `addresses` array holds it
export function heat(graph, id, tick, physics)    // Σ over writes of 0.5^((tick − writeTick)/heat_half_life); verdicts weigh verdict_heat
export function tension(graph, strengths, claimId)// strongest attacker strength × own strength (0 when unattacked); rivals count
export function crowding(graph, id, tick, physics)// distinct living authors writing to id within crowd_window ticks
export function activeQuestions(graph, tick, physics) // questions with any write under them within crowd_window
```

A write's tick is the `tick` the Hive stamped on the node when it was created. Updates never change
`seq` or `tick`.

## Economy

**Produced by:** T05. **Consumed by:** T08, T09, T11.

```js
// src/economy.mjs
export function newLedger(supply)                 // → { supply, accounts: {}, spent: 0, writtenOff: 0, added: 0, initial: supply }
export function open(ledger, agentId, endowment, from)  // from: 'supply' | <parent agent id>; moves endowment now; throws if
                                                  //   the account exists; → false (nothing moves) if the source can't cover it
export function close(ledger, agentId)            // releases escrow to balance, marks the account closed
export function price(physics, action, info)      // tool price; 'source' uses info.bytes; 'usage' uses info.usage fields
export function debit(ledger, agentId, amount)    // → true and spends, or false when balance < amount or closed (nothing changes)
export function escrow(ledger, agentId, amount)   // → true and moves balance→escrow, or false
export function chargeUsage(ledger, agentId, cost)// spends from escrow first, then balance; never below zero; returns unpaid remainder
export function release(ledger, agentId)          // escrow → balance
export function writeOff(ledger, agentId)         // escrow → writtenOff
export function feed(ledger, amount)              // the user's "spend more"; negative cuts the supply, never below 0
export function settleTick(ledger, world, physics, levers)
// world: { living: [agentId], claims: [{ id, author, strength, relevance, tested }], budsOf: { [agentId]: n } }
// pays income_rate × strength × relevance to living authors of claims with strength ≥ standing_threshold
// and `tested` (an attack claim from another lineage); charges upkeep × levers.upkeep_factor;
// `close`s every agent that reached zero; → { deaths: [agentId], buds: [agentId] } (buds: balance ≥
// budding_threshold × levers.budding_factor and budsOf < max_buds)
export function payNovelty(ledger, agentId, novelty, relevance, temperature, weight, physics) // once per claim:
// novelty × relevance × temperature × weight × novelty_rate
export function payCritic(ledger, agentId, before, after, targetRelevance, attackerBest, physics)
// pays (before − after) × targetRelevance × critic_rate unless before < attackerBest × weak_ratio
export function total(ledger)                     // supply + Σ balances + Σ escrows + spent + writtenOff
```

Invariant: `total(ledger) === ledger.initial + ledger.added` after every operation, and no balance,
escrow or supply is ever negative. Income and pay draw from `supply` and stop at zero. A closed
account receives no income or pay.

## Thermostat

**Produced by:** T07. **Consumed by:** T08, T09, T11.

```js
// src/thermostat.mjs
export function spread(graph, strengths, physics, tick) // mean over active questions of the normalized
// entropy of strength mass per worldview (worldviews(...).answers; each worldview's mass is the sum
// of its answers' strengths; normalized by log(k) for k ≥ 2 worldviews; 0 when k < 2)
export function newThermostat(physics)          // { target, ema, levers: { mutation_rate, novelty_weight,
                                                //   upkeep_factor, budding_factor, floor_slack } } at clamp midpoints, target_start
export function step(state, sample, physics)    // ema ← ema + ema_alpha·(sample − ema); target ← target·cooling;
// error = ema − target; outside the band, levers move by gain·|error| (see T07), each clamped
export function temperature(state)              // = state.target
```

## Genome

**Produced by:** T06. **Consumed by:** T08, T09, T10, T11.

```js
// src/genome.mjs — `agents` here are plain { id, lineage, niche, balance, species, died } objects
export function validateGenome(g)               // → [problems]; shape per architecture § Node kinds
export function drawOperator(rate, rng)         // 'point'|'constraint'|'inversion'|'transplant'|'crossover'|'species_shift'
// disruptive (inversion, transplant, crossover) with total probability `rate`, split evenly; mild
// (point, constraint, species_shift) with 1 − rate, split evenly
export function secondParent(agents, child)     // richest living agent of another lineage in child's niche, or null
export function childLineage(parent, operator, newId) // parent.lineage, or newId for 'transplant'
export function renderGenomeTurn(genome)        // the first-turn text an agent receives
export function mutationPrompt(parent, operator, other) // the parent genome as JSON before anything else, then the
                                                        //   operator, then the other genome or the lens change; asks for JSON back
export function parseMutation(text)             // → genome or throws; extracts the first JSON object
export function speciesForBud(agents, physics)  // the species a new bud must take when one is below species_floor, else null
```

## Tools and the Hive

**Produced by:** T08. **Consumed by:** T09, T10.

```js
// src/hive.mjs
export class Hive {
  static open(dir)           // loads graph, physics, ledger (from agent nodes and goal), thermostat
  graph; physics; ledger; thermo; tick;
  strengths()                // memoized computeStrengths until the next write or update
  write(node)                // a NEW node: assigns id, seq and tick, writes the file, invalidates strengths, logs
  update(id, fields)         // changes fields of an existing node; never changes seq or tick; invalidates strengths
  agent(id); living();       // agent nodes
  unread(agentId)            // → the agent's inbox entries with read: false
  advance()                  // tick += 1 (only tools.mjs calls it)
  maybeCommit()              // commit every run.commit_every ticks
  newId(letter)              // `${letter}-${nextSeq}`
  persist()                  // writes ledger balances/escrows to agent nodes (energy, escrow) and the
                             //   goal (supply, settings.ledger, settings.thermostat, settings.tick, settings.births)
  queueBirth(req)            // req: { kind: 'seed'|'bud'|'spawn', parent, genome?, lens_change?, endowment }
  takeBirths()               // → the queued requests, clearing the queue
}
// Hive.open rebuilds the ledger from goal.supply, goal.settings.ledger and every agent's energy and
// escrow, so a run reopened from disk continues with the same books.
// src/tools.mjs
export const TOOL_NAMES      // ['look','read','source','claim','define','question','message','ask_user','spawn','seed','rest']
export function runTool(hive, agentId, name, input)
// → { ok, result } or { ok: false, error }; prices are debited before the effect; a refused tool
// changes nothing and does not tick; every accepted call advances the tick once
```

Tool inputs (validated in `runTool`; the SDK wiring in T10 mirrors them as zod schemas):

| Tool | Input | Result |
|---|---|---|
| `look` | `{}` | `{ niche, answers, tense, worldviews, cruxes, inbox, balance, temperature }` |
| `read` | `{ id }` | the node |
| `source` | `{ path, page? }` | `{ path, page, pages, text }` (pages of 8 KB) |
| `claim` | `{ text, provenance: 'F'|'I'|'A', source?, answers?, attacks?, supports?, checks?, decides? }` | `{ id }` |
| `define` | `{ term, text }` | `{ id }` |
| `question` | `{ parent, text }` | `{ id }` |
| `message` | `{ to, text }` | `{}` (appends `{ from, text, tick, read: false }` to the recipient's `inbox`) |
| `ask_user` | `{ text, candidates: [claim ids] }` | `{ id }` |
| `spawn` | `{ lens_change, endowment }` | `{}` (queues a birth; the endowment moves at birth) |
| `seed` | `{ genomes: [genome] }` (founder only) | `{}` |
| `rest` | `{}` | `{}` with `done: true` |

## Runner and scheduler

**Produced by:** T09 (interface, scheduler), T10 (SDK runner), T11 (sim runner).

```js
// src/runner-sdk.mjs
export function createSdkRunner({ dir, physics, sdk })   // sdk defaults to the real module
export function cleanEnv(env)                            // drops CLAUDE*/ANTHROPIC* except CLAUDE_CONFIG_DIR
// src/sim.mjs
export function createSimRunner({ physics, rng })
export function fitCostModel(events)                     // → sim_cost from `usage` events

// a Runner
// runner.start(agent, genomeTurn, tools)  → Promise<WakeResult>   a fresh session
// runner.fork(agent, parentSession, genomeTurn, tools) → Promise<WakeResult>
// runner.wake(agent, prompt, tools)       → Promise<WakeResult>   resume agent.session
// runner.interrupt(agent)                 → Promise<void>
// runner.mutate(prompt)                   → Promise<{ text, usage }>   one call, no tools
// runner.report(text)                     → Promise<{ text, usage }>   the reporter, no tools
// tools: { call(name, input) → Promise<{ ok, result, done }> } bound to the agent by the scheduler
// WakeResult: { session, usage: { input, cache_read, cache_write, output }, context, limit, error? }
//   usage: summed over the wake's assistant messages (each message id once), so a wake interrupted
//   after `rest` still reports what it used; context: input + cache_read + cache_write of the last
//   call; limit: true when the plan's usage limit was hit

// src/scheduler.mjs
export async function runHive(dir, runner, { rng, stopWhen, sleep } = {}) // → { reason: 'quiet'|'spent'|'stopped' }
// sleep(ms) is injected so tests don't wait; the default waits with setTimeout
```

### Scheduler rules

1. **Start.** A hive with no agent node gets a founder: agent `founder: true`, lineage `L0`,
   species `explorer`, endowed `endowment_seed` from the supply, started with
   `runner.start(founder, <prompts/founder.md text + the goal>, tools)` where `seed` is allowed.
   After its first wake the founder dies (`close`).
2. **Births** (from `hive.takeBirths()`, before choosing wakes). Endowments move at birth with
   `open`; nothing is held between the queueing and the birth.
   - `seed`: the genome as given; a new lineage `L<n>`; endowed `endowment_seed` from the supply;
     `runner.start`.
   - `bud` and `spawn`: operator from `drawOperator(levers.mutation_rate, rng)`, except a spawn
     always uses `point` with its `lens_change` in the mutation prompt; a second parent for
     crossover; `runner.mutate(mutationPrompt(...))`, its usage priced and debited from the parent
     (no debit, no birth), then `parseMutation`; species forced by `speciesForBud` when it returns
     one; lineage by `childLineage`; endowed from the parent (a bud: half its balance; a spawn: its
     `endowment`); `runner.fork(child, parent.session, renderGenomeTurn(genome), tools)`. A bud's
     niche is the active question with the most tension per living agent in it. The parent's
     `buds` += 1.
   - A birth whose mutation fails to parse, or whose parent can't cover it, moves no energy and is
     logged.
3. **Waking.** Priority = the highest `tension` among claims in the agent's niche + unread inbox
   count − `crowding(niche)` + `(tick − last_wake) / crowd_window`; never woken is `Infinity`. An
   agent is **eligible** when its priority ≥ `wake_floor − levers.floor_slack` **and** its balance
   covers its reserve (`wake_reserve`, doubled after a long pause). Whenever a slot of `concurrency`
   frees, the eligible agent with the highest priority is woken (ties by id). **Cold start:** at the
   start of a run and after a pause, the first wake runs alone, and the others fan out after it
   ends. Before a wake, `escrow` the reserve.
4. **During a wake,** every accepted tool call is a tick. After each tick: `settleTick` (deaths are
   interrupted if awake; buds queued), `thermostat.step` with `spread`, asks checked for the
   outbox, `status` rewritten, `hive.persist()`, `hive.maybeCommit()`. A wake ends at `rest`, at
   the burst (`run.burst` accepted calls), or at death.
5. **After a wake:** log `{ type: 'usage', wake: 'start'|'fork'|'wake', agent, usage }`, then
   `chargeUsage(price(usage))`, then `release`; a wake that reports no usage at all is `writeOff`.
   An agent whose `context` passed `context_cap` dies (`close`). `last_wake = tick`.
6. **Asks** reach the outbox once (the ask gets `sent: <tick>` by `update`): when the ask's strength
   ≥ `ask_threshold`, or `tick − ask.tick ≥ ask_max_ticks` with no attacking claim on it above
   `standing_threshold`.
7. **Inbox** files are applied in name order before each wake round, skipping names ≤ the goal's
   `settings.inbox_last`; after each file the scheduler sets `inbox_last`, persists, then deletes the
   file, so a crash in between never applies a file twice.
8. **Plan limit:** a `WakeResult` with `limit: true` pauses the run: status `paused=true`, no wakes,
   `sleep(60000)` and retry until a wake succeeds or a `stop` arrives. The pause length is the sum
   of the slept milliseconds; past an hour, each agent's next reserve is doubled.
9. **End:** `quiet` when no living agent is eligible and no ask is outstanding (sent and
   unanswered); `spent` when supply, balances and escrows are all zero; `stopped` on a stop file or
   `stopWhen()`. On every end the hive persists and commits.

`tools.call(name, input)` resolves `{ ok, result, done }`; `done: true` after `rest`, after the
agent dies, or when its burst is used up, and the runner ends the wake.

## Outbox, inbox, status

**Produced by:** T09 (written and read by the scheduler), T12 (written and read by the CLI).

- `outbox/<ask id>.json`: `{ id, text, candidates: [{ id, text }], tick }`, written once per ask.
- `inbox/<13-digit epoch ms>-<4-digit counter>.json`, unique and ordered by name:
  - `{ type: 'verdict', text, addresses: [ids], pins: [{ id, value: 0|1 }] }`: becomes a `verdict`
    node (author `user`) and sets `pinned` on each pinned node (`update`);
  - `{ type: 'feed', amount }`: `feed(ledger, amount)`;
  - `{ type: 'stop' }`: the run ends with reason `stopped`.
- `status`: one line, `supply=<n> living=<n> temperature=<x> hottest=<id> paused=<bool> tick=<n>`.
