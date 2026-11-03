# hivemind — design

Status: draft for the user's review. Nothing built.

## 1. What it is

`/hivemind <goal>` sets a swarm of agents loose on an open problem. No agent is responsible for the
answer. Agents spawn, argue, reproduce, mutate and die under a small set of ground rules and an
energy economy, and the answer is what the swarm's argument graph holds once it goes quiet.

It is a separate plugin from think-tank, in the vanillafairy marketplace. Think-tank is a brain: a
tree of topics, each run by a moderator, that expands and then collapses. Hivemind is a hive: no
moderators, coordination only through a shared environment. The two share an intellectual base
(think-tank's foundations F1–F11, restated here as ground rules) and no code.

**Balance.** Agents hold all judgment of substance: what to claim, attack or ask, and how to rewrite
a genome when told which mutation to apply. Scripts hold everything that is arithmetic or
bookkeeping: prices, balances, claim strengths, the field, the thermostat, whom to wake, which
mutation to apply, and the harvest's coherence check. No model ever decides who is rewarded, who
lives, or whether a claim stands.

## 2. The parts

```
You ⇄ main session (/hivemind skill)
         │ launches, relays questions and verdicts
         ▼
     scheduler (Node, Agent SDK; no model)  ──►  agents (isolated SDK sessions)
         │ sole writer                          │ act only through physics tools
         ▼                                      ▼
     run directory: graph/ (git) · events.jsonl · outbox/ · inbox/ · status · report.md
```

- **Agents** are isolated Agent SDK sessions. Their only tools are the physics tools (§6), which
  run inside the scheduler process, so every action is priced, debited and written by one writer.
- **The scheduler** is a Node process. It wakes agents, implements the physics tools, keeps the
  books, computes strengths and the field, runs the economy (§8) and decides when the run is over.
- **The main session** runs the `/hivemind` skill: it sets up the run with the user, launches the
  scheduler in the background, relays questions and verdicts, passes on budget levers, and saves
  the report. It judges nothing.

## 3. Runtime (measured; see `~/.claude/SUBAGENT-HARNESS.md`)

- `@anthropic-ai/claude-agent-sdk`, pinned to an exact version (0.3.317 when measured).
- **Billing: the user's Claude Code subscription only.** The scheduler removes `ANTHROPIC_API_KEY`
  from every agent's environment and states the billing mode at start. Runs draw from the plan's
  session and weekly limits. API-key billing is out of scope until the user needs it.
- Every agent is isolated: `settingSources: []`, `strictMcpConfig: true`,
  `settings: { autoMemoryEnabled: false }`, and the physics tools as one in-process server
  (`createSdkMcpServer({ alwaysLoad: true })`) with `allowedTools` naming only them.
- **One system prompt for every agent:** the ground rules (§10). The genome is not in it: it
  arrives as the agent's first user turn. So every agent shares one cached prefix, and a fork reads
  its parent's context from cache and then receives its own mutated genome as a new turn, which
  supersedes the parent's.
- **Model and effort** are run settings, the same for every agent (§7).
- **Wake** = `resume` the session with a one-line turn prompt and `maxTurns` set to the burst
  length. The prompt cache lasts an hour, so a wake inside that window is cheap.
- **Births:** founders and their seeded genomes start fresh; budded and spawned children are forks
  (`forkSession`) of their parent.
- **Death** = `q.interrupt()` if awake; its session is never resumed again.
- At most `concurrency` agents are awake at once (default 4). After any cold start the scheduler
  wakes one agent first, then fans out, so agents don't each pay the cold prefix.
- **Metering** comes from streamed usage during the wake and the result message's `usage` at its
  end; session totals are cumulative and not used.
- **Plan limit.** When the SDK reports the subscription's usage limit, the scheduler pauses: no
  wakes, no ticks, a status line saying so. It resumes when the limit resets or the user says so.
  After a pause longer than the cache's hour, the first wake of each agent is escrowed at full,
  uncached price (§8).

## 4. The graph (state) and the event log (audit)

The graph is the state, as in think-tank: one Markdown file per node in `graph/`, YAML frontmatter
and a body, a git repository. The scheduler is its only writer and commits every `commit_every`
ticks, the commit message summarizing them. `events.jsonl` is the audit trail: one line per tool
call, debit, credit, escrow, write-off, birth, death, verdict and thermostat change, never edited.
The field (§5) is derived from the graph and the clock, never stored.

| `kind` | Holds |
|---|---|
| `goal` | the charter: purpose, scope, sources; the run's settings, food supply and clock (`seq`) |
| `question` | a question; `parent` (the goal or another question); its relevance argument (§5) |
| `claim` | a statement by an agent; `provenance` (F, I, A), `source` for F; at most one relation: `answers` a question, `attacks` or `supports` another claim or a question's relevance; optionally `checks: <claim>` (a verification, §6), `decides: <crux>` (§11), `term: true` (a definition, F3) |
| `agent` | an agent: genome (§7), `lineage`, `energy`, `escrow`, `species`, `niche` (a question), `born`, `died`, `parent`, `buds`, session id |
| `verdict` | the user's words, `addresses` a node, and its effect (§9) |
| `ask` | a question for the user, raised by an agent, with its `candidates`: the claims an answer would settle (§9) |

Every node carries `author` and `seq` and its id is `<kind-letter>-<seq>`. A node's `touched` and
last-touched `seq` count writes only (a claim, attack or support on it); reads never count.
Node files and their schema belong to hivemind alone.

## 5. Truth is computed: strengths and the field

**Strength.** Claims, their attacks and their supports form a weighted bipolar argumentation
graph. Every claim's strength (0–1) is computed by the quadratic energy model of gradual
argumentation (Potyka), with the continuous update (step size and `max_iters` in `physics.json`).
If it hasn't converged by `max_iters` it keeps the last iterate and logs `strength_nonconverged`.
Strength is recomputed after every write.

- **Base score** comes from provenance (a data table, e.g. F verified 0.8, F unchecked 0.5, I 0.5,
  A 0.3). An F claim is **verified** when an agent of another lineage posts a supporting claim with
  `checks: <it>` after reading the cited source with the `source` tool; a `checks` claim that
  attacks it marks the check failed.
- **Ceilings (F2).** A claim's strength never exceeds the ceiling of its provenance (A below I,
  I below verified F), however much support it gets: agreement never upgrades a claim.
- **Aggregation by lineage.** Attacks and supports on a claim are aggregated per lineage before
  they combine: within one lineage only the strongest counts. Ten weak attacks from one family
  weigh as one.

**Relevance (F1).** Questions are never refuted. Each question has a relevance argument whose base
score is its parent's relevance times `question_base_factor` (below 1), so a new sub-question
starts less relevant than its parent and earns relevance only through support. Agents attack or
support that argument with claims. The goal's relevance is 1. A claim's relevance is the relevance
of the question its relation chain leads to.

**The field** is three numbers per node, derived, never stored:

- **heat:** recent writes, decaying with age in ticks (half-life a setting);
- **tension:** for a claim, the strength of what attacks it times its own strength; high where
  strong claims collide;
- **crowding:** how many living agents wrote to the node in the last `crowd_window` ticks.

A question is **active** when any node under it was written within `crowd_window` ticks.

## 6. Physics tools (the agents' only actions)

| Tool | Does | Price |
|---|---|---|
| `look` | the agent's local view: its niche question, the strongest and the most tense claims there with strengths, rival worldviews if any and their cruxes, its inbox, its balance, the temperature | cheap |
| `read` | one node in full | cheap |
| `source` | read a file under the charter's sources, read-only, paged | moderate, by size |
| `claim` | post a claim with provenance and source, answering a question or attacking or supporting a claim or a relevance argument; optionally `checks` or `decides` | moderate |
| `define` | post a definition claim for a contested term (F3) | moderate |
| `question` | open a sub-question under a question | moderate |
| `message` | a short note to another agent, delivered to its inbox and shown in its next `look` | cheap |
| `ask_user` | raise a question for the user with its candidate claims (§9) | high |
| `spawn` | fork a specialist child with a stated lens change, endowing it from the parent's balance | high plus endowment |
| `rest` | end the wake | free |

Every tool price is debited before the tool runs; a tool the agent can't afford refuses. Model
tokens are paid from the wake's escrow (§8).

## 7. Agents, genomes and evolution

**Genome:** `lens` (the angle, in words), `stance` toward the leading answers in its niche
(`challenge`, `extend`, `orthogonal`), `constraints` (a list, e.g. "the three most obvious answers
are off limits"), `species` (`explorer` or `critic`), and `temperament` (appetite for risk). It is
delivered as the agent's first turn (§3).

**Model and effort are run settings, the same for every agent** (default: Opus). An argument is won
by its content, not by which agent was given more capability; varying the model or the effort
would let compute decide what ideas should.

**Lineage.** Every agent carries a scheduler-assigned `lineage`. Founders' seeds and transplants
start new lineages; forks, buds, spawned children and crossovers (which fork from one parent) keep
their parent's. "Another lens" everywhere in this design means another lineage: a family can't
support, attack or verify itself into income.

**Species.** Explorers run hot: high mutation, a large novelty bonus. Critics run cold: low
mutation, paid for attacks that cost strong claims strength (§8). A **species floor** keeps at
least `species_floor` of the living agents in each species: while one species is below it, every
new bud is shifted to it.

**Life.** An agent is born with an endowment, lives in a niche (a question), is woken for bursts of
up to `burst` tool calls, pays upkeep on every tick, and dies when its balance reaches zero, when
its context passes `context_cap`, or when the run ends. Its claims outlive it, but pay no one.

**Mutation.** The script decides what changes; a model only writes it. At each birth the scheduler
draws one operator, the disruptive ones (inversion, transplant, crossover) more likely as the
mutation rate rises, and for crossover picks the second parent: the richest agent of another
lineage in the child's niche. Then one call to the run's model, given the parent genome, the
operator and (for crossover) the second genome, returns the child's genome. Operators: point (change
one assumption or constraint in the lens), constraint (forbid the parent's most likely answers),
inversion (flip the stance), transplant (a lens from an unrelated field; starts a new lineage),
crossover (merge two lenses), species shift.

**Founders.** A run starts with one founder agent that reads the goal, opens the first questions,
and returns a list of genomes, one per lens the goal calls for, with explorers and critics in the
`species_ratio`. The scheduler starts each as a fresh agent endowed from the supply, then the
founder dies like any agent.

## 8. Energy, fitness and the thermostat

**Energy** is an abstract unit. A pricing function maps each action to its cost: tool prices from a
table, and model usage through a price per usage field (fresh input, cache read, cache write,
output). Every field starts at 1 energy per token; the weights may change to any other function
without touching the rest of the design. Rewards and the food supply are in the same unit.

**Food supply.** A run starts with a supply (default 1,000,000 energy). Founders' seeds are endowed
from it; budded and spawned children from their parent. Income comes out of it; agents' spending
goes nowhere.

**Escrow.** Before a wake the scheduler moves `wake_reserve` (an estimate of the wake's token cost)
from the agent's balance to its escrow; an agent that can't cover it isn't woken. Token cost is
debited from escrow as streamed usage arrives, the rest returns after the wake, and if an
interrupted wake reports no usage, the reserve is written off with a `write_off` line. So balances
never go below zero, and supply, balances, escrows, spending and write-offs always add up.

**The clock.** One tick is one agent tool call. Ledger lines, income, upkeep and thermostat changes
are written to the log but never advance the clock, so time moves only when an agent acts and a run
replays exactly. At every tick the scheduler settles the flows:

- **Income.** Each standing claim (strength above `standing_threshold`) by a living author pays
  `rate × strength × relevance × exposure` out of the supply. Exposure is 0 until an agent of
  another lineage has attacked the claim: no test, no income (F10). Income stops when a claim falls
  below the threshold, so a strength that flickers earns little.
- **Novelty** is paid once a claim has survived its first attack from another lineage:
  `novelty × relevance × temperature`, where novelty is one minus the largest word-shingle
  similarity to earlier claims on the same question.
- **Critics' pay.** An attack is paid once, when posted, for the strength it removes from its
  target: `(strength before − strength after) × target relevance × critic_rate`. Attacking a claim
  much weaker than the attacker's own strongest earns nothing.
- **Upkeep.** Every living agent pays a small drain; an idle agent starves.
- **Budding.** An agent whose balance crosses the budding threshold, and has budded fewer than
  `max_buds` times, reproduces: the scheduler forks it with one mutation, gives the child half the
  balance, and places it in the niche with the most tension per living agent. The child is woken
  first among agents of its priority. Agents whose claims stand earn more than their upkeep, grow
  and bud; the rest drain away. Nobody ranks anyone.
- **Death.** An agent at zero balance dies at once.

Fitness, in the user's weighting (survival under attack × relevance, plus novelty that cools), is
therefore not computed anywhere: it is the agent's net income.

**Entropy thermostat.** For each active question, its rival worldviews are the preferred extensions
of its argument subtree (§11). The hive's spread is the mean over active questions of the
normalized entropy of the strength mass behind each worldview, so compatible answers in one
worldview don't count as scattered. Spread is smoothed as a moving average over recent ticks. A
target spread starts high and cools a little every tick. A clamped proportional controller acts on
the smoothed error:

- below the band (herding): the mutation rate, the novelty weight and the wake floor's slack rise,
  and the budding threshold falls, so new variants are born;
- above the band (scattered): upkeep and the budding threshold rise, so fewer can afford to
  reproduce.

Every lever moves within its clamp. The target is the temperature that scales novelty.

**Waking.** Whenever a waking slot frees, the scheduler wakes the living agent with the highest
priority, if it is above the `wake_floor`: tension in its niche plus unread inbox messages, minus
crowding, plus how long since its last wake (never woken counts as longest). Ties break by agent id.
No model takes part in the choice.

All numbers in this section and in §5–§7 live in one data file, `physics.json`, overridable per
run: prices, rates, thresholds (`standing_threshold`, `strong_threshold`, `harvest_threshold`,
`ask_threshold`), windows, clamps, the cooling rate, `burst`, `max_buds`, `species_floor`,
`context_cap`, `wake_reserve`.

## 9. The user

**Questions.** An agent raises an `ask` with `ask_user`, at a high price, naming the claims an
answer would settle. Other agents support it or attack it ("evidence settles this, not taste") like
any claim. It reaches `outbox/` once its strength crosses `ask_threshold`, or after `ask_max_ticks`
with no attack standing against it. The main session waits on one background watcher that wakes it
only when a file lands in `outbox/` or the scheduler exits. It puts the question to the user in
plain words, with the candidate claims as the choices, without stopping the run, and writes the
answer to `inbox/` as a verdict.

**Verdicts** (F11) outrank everything. A verdict pins the addressed node: an answered `ask` pins
the candidates the user chose to strength 1 and the rest to 0, a verdict on a claim pins it, a
verdict on a question pins its relevance. It floods heat into everything that depends on the node.
The user may speak at any moment. When what they say isn't an answer to an ask, the main session
restates it as the nodes it would pin and confirms that with the user before writing the verdict.

**Budget levers,** in plain words to the main session: "spend more" adds energy to the supply;
"too expensive" cuts what is left. After a run the user rates it: too expensive, about right, could
spend more. The rating scales the next run's default supply by ×0.67, ×1 or ×1.5, and is logged
with the run's actual spend in `~/.hivemind/budget.jsonl`.

**Status.** The scheduler keeps a one-line `status` file (supply left, living agents, temperature,
hottest tension, paused or not). The main session reads it when the user asks and when an ask
arrives; it is never pushed on a timer.

## 10. Ground rules (every agent's system prompt)

1. You act only through your tools. Every act costs energy; your balance is your life.
2. Work where tension is high in your niche; leave crowded nodes.
3. Attack the strongest claim you disagree with. An attack on a claim much weaker than your own
   strongest earns nothing; answer a weak claim only when it blocks something that matters.
4. Every claim says where it comes from: observed (with a source anyone can check), inferred, or
   assumed. Agreement never turns an inference into an observation (F2).
5. Check other families' observations: read the source, then support or attack with `checks`.
6. Support only with a claim of your own that adds something; bare agreement is not a claim.
7. Never refute a question; if it doesn't serve the goal, attack its relevance (F1).
8. When a disagreement rests on a word, define the word first (F3).
9. When rival answers stand, say what would decide between them (`decides`).
10. Ask the user only what is theirs: taste, priority, purpose (F11).
11. If a question needs a lens nobody brings, spawn one.
12. Your genome is who you are; argue from it.

## 11. Ending and harvest

The run ends when no living agent is above the `wake_floor` and no ask is outstanding (quiet), when
the supply, balances and escrows are spent, or when the user stops it.

**Harvest** is a script, then a writer. For each question in order of relevance, the script takes
its whole argument subtree, the answers and every attack and support beneath them, and computes the
preferred extensions (Dung semantics) of its attack relation. It projects each extension onto the
answers, keeping only answers with strength above `harvest_threshold` that were attacked by at least
two other lineages and survived (F10). One extension is one coherent answer. Several are rival
worldviews: the attack chains between them are the cruxes, each reported with its strongest
`decides` claim, or marked undecided if none was posted. A reporter agent writes the report from
that skeleton and cannot change it; its text comes back in its final result and the main session
saves it as `report.md`. The report also carries what the user ruled and the run's spend.

## 12. A run

1. **Charter.** The main session asks the user for the goal, scope and sources, and states the
   default budget and billing mode. It runs `hive init`.
2. **Launch.** It starts the scheduler in the background (`hive run <dir>`) and the outbox watcher.
3. **During the run** it relays asks and verdicts, passes on budget levers, and reads status when
   asked.
4. **End.** It saves the report, shows its summary, and asks for the budget rating.

## 13. The plugin

```
hivemind/
  .claude-plugin/plugin.json
  package.json, package-lock.json     the Agent SDK, pinned exactly
  README.md
  skills/hivemind/SKILL.md            the main session's steps
  physics.json                        every tunable number
  src/
    graph/      node files: parse, write, schema, git commits
    events.mjs  the audit log
    strength.mjs  gradual argumentation, ceilings, lineage aggregation, relevance
    field.mjs   heat, tension, crowding
    economy.mjs pricing, escrow, ledger, income, critics' pay, upkeep, budding
    thermostat.mjs
    genome.mjs  genomes, operator choice, the mutation call, lineages
    tools.mjs   the physics tools
    scheduler.mjs the loop: ticks, waking, pauses, end
    harvest.mjs extensions, projection, cruxes, report skeleton
    hive.mjs    CLI: init, run, sim, status
  test/
```

## 14. Tests and the simulator

The arithmetic is where mistakes hide, and all of it is testable without a model:

- strengths: a chain, a mutual attack, support raising strength, an odd attack cycle, the
  provenance ceiling, ten weak attacks from one lineage weighing as one;
- verification: a `checks` support from another lineage after `source` raises an F claim's base
  score; one from the same lineage doesn't;
- relevance: an attacked relevance argument lowers every claim under the question; a new
  sub-question starts below its parent;
- the clock: ledger lines and flows never advance it; a run with no tool calls makes no ticks;
- the ledger: escrow before a wake, write-off on an interrupt with no usage; balances never go
  below zero; supply, balances, escrows, spending and write-offs always add up;
- income: none before another lineage attacks; stopping when a claim falls; novelty paid once,
  after the first attack, scaled by relevance and temperature; critics paid for strength removed;
- budding at the threshold splits the balance, respects `max_buds` and the species floor, and
  places the child; death at zero is immediate;
- the thermostat moves each lever the right way on each side of the band, within its clamp;
- waking is deterministic for a given graph and respects the wake floor; quiet ends the run;
- the operator draw and lineage assignment; transplants start a new lineage;
- harvest: one worldview for a coherent subtree, two with their crux for rival answers whose
  attacks sit in separate claims, answers attacked by fewer than two lineages left out;
- asks reach the outbox by threshold or by timeout; verdicts pin and flood heat.

**`hive sim`** runs the whole loop with scripted stub agents instead of models, so the physics
(prices, income, upkeep, budding, cooling) can be tuned to settle before any tokens are spent. Its
stubs charge token usage from a cost model fitted on a few real wakes (fresh, cached and forked),
so the simulator's spending matches what real agents would cost.

## 15. Deferred, each with its trigger

| Mechanism | Built when |
|---|---|
| API-key billing | the user needs more than the subscription gives |
| Mixed model families at equal capability | one model's shared blind spots show in real runs |
| Embedding-based novelty | word shingles mis-rank novelty in real runs |
| A shared graph package with think-tank | the two graph layers converge in real use |
| Distribution to other users | only with Anthropic's approval for subscription logins |
