# Shared Interfaces

Paths are relative to the plugin repo `C:\work\claude\vanillafairy\hivemind`. A `Graph` is
`Map<id, Node>`, `Node = { id, fm, title, body }`, where `fm.kind` is the node kind (§ Node kinds in
`architecture.md`). `physics` is the merged physics object. Numbers in frontmatter may arrive as
strings; every module compares them with `Number(...)`.

## Graph

**Produced by:** T01. **Consumed by:** every later task.

```js
// src/graph/nodes.mjs
export function parseNode(text)          // → { fm, title, body, unclosed }; YAML frontmatter as think-tank's parser
export function serializeNode(node)      // → text; parseNode(serializeNode(n)) round-trips fm, title, body
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
// src/events.mjs
export function logEvent(dir, event)     // appends JSON + '\n' to events.jsonl with a `t` (tick) and `type`
// src/physics.mjs
export function loadPhysics(dir)         // physics.json defaults deep-merged with the goal's `settings.physics`
```

## Strength

**Produced by:** T02. **Consumed by:** T04, T05, T07, T08, T09.

```js
// src/strength.mjs
export function baseScore(graph, claimId, physics)  // provenance base, after verification (rules below)
export function computeStrengths(graph, physics)    // → Map<id, number> for every claim and every
                                                    //   `<question id>#relevance` argument
export function relevance(graph, strengths)         // → Map<question id, number>; goal-child questions
                                                    //   from their relevance argument; the goal is 1
export function claimRelevance(graph, rel, claimId) // the relevance of the question the claim's relation chain leads to; 0 if none
```

Rules:

- **Arguments:** every claim, every `ask` node (base `base.I`, ceiling `ceiling.I`; claims attack or
  support it like a claim), and one relevance argument `<qid>#relevance` per question.
- **Relations:** `attacks: X` is an attack on X, `supports: X` a support of X. `answers` is not a
  relation between arguments.
- **Same-lineage supports don't count:** a support whose author's lineage equals the target's
  author's lineage is ignored. Attacks always count.
- **Lineage aggregation:** for a target, group its attackers by lineage and keep the strongest per
  lineage; the same for supporters. Energy `E = Σ supporter maxima − Σ attacker maxima`.
- **Update (quadratic energy model):** `h(x) = max(x,0)² / (1 + max(x,0)²)`;
  `f(w, E) = E ≤ 0 ? w − w·h(−E) : w + (1−w)·h(E)`. Iterate
  `s ← s + step·(f(w, E(s)) − s)` for all arguments together until the largest change is below
  `eps` or `max_iters` is reached; then clamp each claim to its ceiling. Non-convergence keeps the
  last iterate (the caller logs it).
- **Base scores:** `A` → `base.A`; `I` → `base.I`; `F` → `base.F_verified` if a claim with
  `supports: <it>` and `checks: <it>` exists by another lineage, `base.F_failed` if a claim with
  `attacks: <it>` and `checks: <it>` exists by another lineage (failed wins over verified),
  else `base.F_unchecked`. Ceilings use the same keys from `ceiling`.
- **Relevance arguments:** base = parent question's relevance × `question_base_factor`; a question
  whose parent is the goal takes base `question_base_factor`. Computed parents-first.
- **Pins:** a node with `pinned` keeps strength exactly `Number(pinned)` and is never updated.

## Dung and harvest

**Produced by:** T03. **Consumed by:** T07, T12.

```js
// src/dung.mjs
export function preferredExtensions(args, attacks, { max = 64 } = {})
// args: string[]; attacks: [from, to][]; → string[][]: the maximal admissible sets (conflict-free,
// each member defended against every attacker), each sorted, the list sorted; at most `max`
// (the rest dropped, flagged by `.truncated = true` on the returned array)

// src/harvest.mjs
export function questionSubtree(graph, qid)          // → { args, attacks }: the answers of qid and
                                                     //   every claim beneath them by attacks/supports
export function worldviews(graph, strengths, qid, physics)
// → { answers: string[][], cruxes: [{ between: [a, b], chain: string[], decides: id|null }] }
//   answers: each preferred extension projected onto qid's answers, keeping only answers with
//   strength ≥ harvest_threshold attacked (directly or in their subtree) by ≥ 2 lineages other than
//   their own; duplicates and empty projections removed
//   cruxes: for each pair of worldviews, the pair of answers (one from each) that the shortest
//   attack chain connects, that chain, and the strongest claim whose `decides` names that pair
export function skeleton(graph, strengths, physics)  // → [{ question, relevance, worldviews }] by relevance desc
```

## Field

**Produced by:** T04. **Consumed by:** T07, T08, T09.

```js
// src/field.mjs
export function writesTo(graph, id)               // → [{ id, author, tick, verdict: boolean }] for nodes whose answers/attacks/supports/checks names id, plus verdicts addressing it
export function heat(graph, id, tick, physics)    // Σ over writes of 0.5^((tick − writeTick)/heat_half_life); verdicts weigh verdict_heat
export function tension(graph, strengths, claimId)// strongest attacker strength × own strength (0 when unattacked)
export function crowding(graph, id, tick, physics)// distinct living authors writing to id within crowd_window ticks
export function activeQuestions(graph, tick, physics) // questions with any write under them within crowd_window
```

A write's tick is the `t` the scheduler stamped on the node (`fm.tick`); nodes carry both `seq` and
`tick`.

## Economy

**Produced by:** T05. **Consumed by:** T08, T09, T11.

```js
// src/economy.mjs
export function newLedger(supply)                 // → { supply, accounts: {}, spent: 0, writtenOff: 0, added: 0, initial: supply }
export function open(ledger, agentId, endowment, from)  // from: 'supply' | <parent agent id>; moves endowment
export function price(physics, action, info)      // tool price; 'source' uses info.bytes; 'usage' uses info.usage fields
export function debit(ledger, agentId, amount)    // → true and spends, or false when balance < amount (nothing changes)
export function escrow(ledger, agentId, amount)   // → true and moves balance→escrow, or false
export function chargeUsage(ledger, agentId, cost)// spends from escrow first, then balance; never below zero; returns unpaid remainder
export function release(ledger, agentId)          // escrow → balance
export function writeOff(ledger, agentId)         // escrow → writtenOff
export function feed(ledger, amount)              // the user's "spend more"; negative cuts the supply, never below 0
export function settleTick(ledger, world, physics, levers)
// world: { living: [agentId], claims: [{ id, author, strength, relevance, attackedByOtherLineage }] }
// pays income to living authors of standing claims, charges upkeep × levers.upkeep_factor, and
// → { deaths: [agentId], buds: [agentId] } (buds: balance ≥ budding_threshold × levers.budding_factor
//   and buds < max_buds, passed in world.budsOf)
export function payNovelty(ledger, agentId, novelty, relevance, temperature, physics) // once per claim
export function payCritic(ledger, agentId, before, after, targetRelevance, attackerBest, physics)
// pays (before − after) × targetRelevance × critic_rate unless before < attackerBest × weak_ratio
export function total(ledger)                     // supply + Σ balances + Σ escrows + spent + writtenOff
```

Invariant: `total(ledger) === ledger.initial + ledger.added` after every operation, and no balance,
escrow or supply is ever negative. Income and pay draw from `supply` and stop at zero.

## Thermostat

**Produced by:** T07. **Consumed by:** T09, T11.

```js
// src/thermostat.mjs
export function spread(graph, strengths, physics, tick) // mean over active questions of the normalized
// entropy of strength mass per worldview (worldviews(...).answers; each worldview's mass is the sum
// of its answers' strengths; normalized by log(k) for k ≥ 2 worldviews; 0 when k < 2)
export function newThermostat(physics)          // { target, ema, levers: { mutation_rate, novelty_weight,
                                                //   upkeep_factor, budding_factor, floor_slack } } at clamp midpoints, target_start
export function step(state, sample, physics)    // ema ← ema + ema_alpha·(sample − ema); target ← target·cooling;
// error = ema − target; outside the band, every lever moves by gain·|error| toward herding or
// scattered correction (see T07), each clamped; inside the band, levers don't move
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
export function mutationPrompt(parent, operator, other) // the prompt the mutation call receives: the parent genome as
                                                        //   JSON first, the operator, the other genome or lens change; asks for JSON back
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
  strengths()                // memoized computeStrengths until the next write
  write(node)                // assigns seq and tick, writes the node file, invalidates strengths, logs
  agent(id); living();       // agent nodes
  advance()                  // tick += 1 (only tools.mjs calls it)
  maybeCommit()              // commit every run.commit_every ticks
  newId(letter)              // `${letter}-${nextSeq}`
  persist()                  // writes ledger balances/escrows to agent nodes (energy, escrow) and the
                             //   goal (supply, settings.ledger, settings.thermostat, settings.tick)
  queueBirth(req)            // req: { kind: 'seed'|'bud'|'spawn', parent, genome?, lens_change?, endowment }
  takeBirths()               // → the queued requests, clearing the queue (persisted in goal.settings.births)
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

| Tool | Input |
|---|---|
| `look` | `{}` |
| `read` | `{ id }` |
| `source` | `{ path, page? }` (path under a goal source; pages of 8 KB) |
| `claim` | `{ text, provenance: 'F'|'I'|'A', source?, answers?, attacks?, supports?, checks?, decides? }` |
| `define` | `{ term, text }` |
| `question` | `{ parent, text }` |
| `message` | `{ to, text }` |
| `ask_user` | `{ text, candidates: [claim ids] }` |
| `spawn` | `{ lens_change, endowment }` |
| `seed` | `{ genomes: [genome] }` (founder only) |
| `rest` | `{}` |

## Runner and scheduler

**Produced by:** T09 (interface, scheduler), T10 (SDK runner), T11 (sim runner).

```js
// a Runner, implemented by runner-sdk.mjs and sim.mjs
// runner.start(agent, genomeTurn, tools)  → Promise<WakeResult>   a fresh session
// runner.fork(agent, parentSession, genomeTurn, tools) → Promise<WakeResult>
// runner.wake(agent, prompt, tools)       → Promise<WakeResult>   resume agent.session
// runner.interrupt(agent)                 → Promise<void>
// runner.mutate(prompt)                   → Promise<string>       one call, no tools
// runner.report(skeletonText)             → Promise<string>       the reporter, no tools
// tools: { call(name, input) → Promise<result> } bound to the agent by the scheduler
// WakeResult: { session, usage: { input, cache_read, cache_write, output }, limit: boolean, error?: string }
//   `limit: true` when the plan's usage limit was hit

// src/scheduler.mjs
export async function runHive(dir, runner, { rng, stopWhen, sleep } = {}) // → { reason: 'quiet'|'spent'|'stopped' }
// sleep(ms) is injected so tests don't wait; the default waits with setTimeout
```

### Scheduler rules

1. **Start.** A hive with no agent node gets a founder: agent `founder: true`, lineage `L0`,
   species `explorer`, endowed `endowment_seed` from the supply, started with
   `runner.start(founder, <prompts/founder.md text + the goal>, tools)` where `seed` is allowed.
   After its first wake the founder dies (its leftover balance stays in its account).
2. **Births** (from `hive.takeBirths()`, before choosing wakes):
   - `seed`: the genome as given; a new lineage `L<n>`; endowed from the supply; `runner.start`.
   - `bud` and `spawn`: operator from `drawOperator(levers.mutation_rate, rng)` (a spawn always
     uses `point` with its `lens_change` in the mutation prompt); a second parent for crossover;
     `runner.mutate(mutationPrompt(...))` then `parseMutation`; species forced by `speciesForBud`
     when it returns one; lineage by `childLineage`; endowed from the parent (a bud takes half its
     balance); `runner.fork(child, parent.session, renderGenomeTurn(genome), tools)`. A bud's niche
     is the active question with the most tension per living agent in it. The parent's `buds` += 1.
   - A birth whose mutation fails to parse is dropped, its endowment returned, and logged.
3. **Waking.** Priority = the highest `tension` among claims in the agent's niche + unread inbox
   count − `crowding(niche)` + `(tick − last_wake) / crowd_window`; never woken is `Infinity`.
   Only agents with priority ≥ `wake_floor − levers.floor_slack` are eligible. Up to `concurrency`
   are awake at once; ties break by agent id. Before a wake, `escrow(wake_reserve)`; an agent that
   can't cover it isn't woken.
4. **During a wake,** every accepted tool call is a tick. After each tick: `settleTick` (deaths are
   interrupted if awake and marked `died`; buds queued), `thermostat.step` with `spread`, asks
   checked for the outbox, `status` rewritten, `hive.persist()`, `hive.maybeCommit()`. A wake ends
   at `rest`, at the burst (`run.burst` accepted calls), or at death.
5. **After a wake:** `chargeUsage(price(usage))`, then `release`; a wake with no usage (interrupted)
   is `writeOff`. An agent whose `input + cache_read` passed `context_cap` dies. `last_wake = tick`.
6. **Asks** reach the outbox once: when the ask's strength ≥ `ask_threshold`, or
   `tick − ask.tick ≥ ask_max_ticks` with no attacking claim on it above `standing_threshold`.
7. **Inbox** files are applied in order before each wake round (verdicts, feeds, stop).
8. **Plan limit:** a `WakeResult` with `limit: true` pauses the run: status `paused=true`, no wakes,
   `sleep(60000)` and retry until a wake succeeds or a `stop` arrives; after a pause longer than an
   hour, each agent's next wake escrows `wake_reserve × 2` (an uncached first wake).
9. **End:** `quiet` when no living agent is eligible and no ask is outstanding (sent and
   unanswered); `spent` when supply, balances and escrows are all zero; `stopped` on a stop file or
   `stopWhen()`. On every end the hive persists and commits.

`tools.call(name, input)` resolves `{ ok, result, done }`; `done: true` after `rest`, after the
agent dies, or when its burst is used up, and the runner ends the wake.

## Outbox, inbox, status

**Produced by:** T09 (written and read by the scheduler), T12 (written and read by the CLI).

- `outbox/<ask id>.json`: `{ id, text, candidates: [{ id, text }], tick }`, written once per ask.
- `inbox/<n>.json`, `n` increasing, consumed in order and then deleted:
  - `{ type: 'verdict', text, addresses: [ids], pins: [{ id, value: 0|1 }] }`: becomes a `verdict`
    node (author `user`) and sets `pinned` on each pinned node;
  - `{ type: 'feed', amount }`: `feed(ledger, amount)`;
  - `{ type: 'stop' }`: the run ends with reason `stopped`.
- `status`: one line, `supply=<n> living=<n> temperature=<x> hottest=<id> paused=<bool> tick=<n>`.
