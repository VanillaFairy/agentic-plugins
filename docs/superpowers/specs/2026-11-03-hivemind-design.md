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

**Balance.** Agents hold all judgment of substance. Scripts hold everything that is arithmetic or
bookkeeping: prices, balances, claim strengths, the field, the thermostat, the scheduler's choice
of whom to wake, and the harvest's coherence check. No model ever decides who is rewarded, who
lives, or whether a claim stands.

## 2. The parts

```
You ⇄ main session (/hivemind skill)
         │ launches, relays questions and verdicts
         ▼
     scheduler (Node, Agent SDK; no model)  ──►  agents (isolated SDK sessions)
         │ sole writer                          │ act only through physics tools
         ▼                                      ▼
     run directory: graph/ (git) · events.jsonl · outbox/ · inbox/ · report.md
```

- **Agents** are isolated Agent SDK sessions. Their only tools are the physics tools (§6), which
  run inside the scheduler process, so every action is priced, debited and written by one writer.
- **The scheduler** is a Node process. It wakes agents, implements the physics tools, keeps the
  books, computes strengths and the field, runs seasons (§8) and decides when the run is over.
- **The main session** runs the `/hivemind` skill: it sets up the run with the user, launches the
  scheduler in the background, relays questions and verdicts, passes on budget levers, and saves
  the report. It judges nothing.

## 3. Runtime (measured; see `~/.claude/SUBAGENT-HARNESS.md`)

- `@anthropic-ai/claude-agent-sdk`, pinned to an exact version (0.3.317 when measured).
- **Billing: the user's Claude Code subscription only.** The scheduler removes `ANTHROPIC_API_KEY`
  from every agent's environment and states the billing mode at start. Runs draw from the plan's
  session and weekly limits. API-key billing is out of scope until the user needs it.
- Every agent is isolated: `settingSources: []`, `strictMcpConfig: true`,
  `settings: { autoMemoryEnabled: false }`, a `systemPrompt` built from its genome (§7), and the
  physics tools as one in-process server (`createSdkMcpServer({ alwaysLoad: true })`) with
  `allowedTools` naming only them. An isolated agent's fixed context is under a thousand tokens.
- **Wake** = `resume` the agent's session with a one-line turn prompt and `maxTurns` set to its
  burst length. The prompt cache lasts an hour, so a wake inside that window is cheap.
- **Birth by reproduction** = `forkSession` from the parent: the child starts warm from the
  parent's context, plus its mutation. Founders and transplants start fresh.
- **Death** = `q.interrupt()` if awake; its session is never resumed again.
- At most `concurrency` agents are awake at once (default 4). A new cohort warms one agent first,
  then fans out, so agents don't each pay the cold prefix.
- Usage per wake comes from the result message's `usage`; session totals are cumulative and not
  used for metering.

## 4. The graph (state) and the event log (audit)

The graph is the state, as in think-tank: one Markdown file per node in `graph/`, YAML frontmatter
and a body, a git repository. The scheduler is its only writer and commits once per season, the
commit message summarizing the season. `events.jsonl` is the audit trail: one line per action,
debit, credit, birth, death, verdict and thermostat change, never edited. The field (§5) is
derived from the graph and the run's clock, never stored.

| `kind` | Holds |
|---|---|
| `goal` | the charter: purpose, scope, sources; the run's settings, food supply and clock (`season`, `seq`) |
| `question` | a question; `parent` (the goal or another question); its relevance argument (§5) |
| `claim` | a statement by an agent; `provenance` (F, I, A), `source` for F, `verified`; at most one relation: `answers` a question, `attacks` or `supports` another claim or a question's relevance; `term: true` for a definition (F3) |
| `agent` | an agent: genome (§7), `energy`, `species`, `niche` (a question), `born`, `died`, `parent`, session id |
| `verdict` | the user's words, `addresses` a node, and its effect (§9) |
| `ask` | a question for the user, raised by an agent (§9) |

Every node carries `author` and `seq` (the run-wide counter) and its id is `<kind-letter>-<seq>`.
Activity counters on nodes (`touched`, last `seq` touched) feed the field. Node files and their
schema belong to hivemind alone.

## 5. Truth is computed: strengths and the field

**Strength.** Claims, their attacks and their supports form a weighted bipolar argumentation
graph. Every claim's strength (0–1) is computed by the quadratic energy model of gradual
argumentation (Potyka), iterated to a fixed point, which is well defined when claims attack each
other in cycles. A claim's base score comes from its provenance (a data table: e.g. F verified 0.8,
F unverified 0.5, I 0.5, A 0.3). Strength is recomputed after every write.

**Relevance (F1).** Questions are never refuted. Each question has a relevance argument whose base
score is its parent's relevance; agents attack or support that argument with claims. A question's
relevance is its argument's strength; the goal's is 1. A claim's relevance is the relevance of the
question its relation chain leads to.

**The field** is three numbers per node, derived, never stored:

- **heat:** recent activity, decaying with age in `seq` (half-life a setting);
- **tension:** for a claim, the strength of what attacks it times its own strength; high where
  strong claims collide;
- **crowding:** how many living agents worked the node in the last season.

## 6. Physics tools (the agents' only actions)

| Tool | Does | Price |
|---|---|---|
| `look` | the agent's local view: its niche question, the strongest and the most tense claims there with strengths, its inbox, its balance, the temperature | cheap |
| `read` | one node in full | cheap |
| `claim` | post a claim with provenance and source, answering a question or attacking or supporting a claim or a relevance argument | moderate |
| `define` | post a definition claim for a contested term (F3) | moderate |
| `question` | open a sub-question under a question | moderate |
| `message` | a short note to another agent, delivered to its inbox and shown in its next `look` | cheap |
| `ask_user` | raise a question for the user (§9) | high |
| `spawn` | fork a specialist child with a stated mutation, endowing it from the parent's balance | high plus endowment |
| `rest` | end the wake | free |

Every price is debited before the tool runs; a tool the agent can't afford refuses. The model
tokens of each wake are debited after it, through the pricing function (§8).

## 7. Agents, genomes and evolution

**Genome:** `lens` (the angle, in words), `stance` toward the leading answers in its niche
(`challenge`, `extend`, `orthogonal`), `constraints` (a list, e.g. "the three most obvious answers
are off limits"), `species` (`explorer` or `critic`), `model` (`haiku`, `sonnet`, `opus`),
`effort`, and `temperament` (appetite for risk). The system prompt is the ground rules (§10) plus
the genome rendered as text.

**Species.** Explorers run hot: high mutation, a large novelty bonus. Critics run cold: low
mutation, rewarded only for attacks that lower a strong claim's strength and for checks that fail
F claims.

**Life.** An agent is born with an endowment, lives in a niche (a question), is woken for bursts of
a few tool calls, pays upkeep every season, and dies when its balance reaches zero or the run ends.
Its claims outlive it.

**Mutation operators,** applied to the genome at birth: point (change one assumption or constraint
in the lens), constraint (forbid the parent's most likely answers), inversion (flip the stance),
transplant (a lens from an unrelated field), crossover (merge two parents' lenses; the child forks
from the fitter one), species shift (model, effort or species).

**Founders.** A run starts with one founder agent that reads the goal, opens the first questions,
and seeds the first genomes, one per lens the goal calls for, with explorers and critics in a set
ratio. The founder then dies like any agent.

## 8. Energy, fitness and the thermostat

**Energy** is an abstract unit. A pricing function maps each action to its cost: tool prices from a
table, and model tokens through a conversion that starts at 1 energy per token and may change to
any other function without touching the rest of the design. Rewards and the food supply are in the
same unit.

**Food supply.** A run starts with a supply (default 1,000,000 energy). Endowments and rewards come
out of it; agents' spending flows back to nowhere. When the supply and every balance are spent,
the run ends.

**Seasons.** Every `season_length` wakes (a setting), the scheduler closes a season:

1. **Fitness** for each living agent, from the environment only:
   `Σ over its claims of strength × relevance × exposure` plus `novelty × temperature`. Exposure is
   1 for a claim attacked by an agent of another lens, and lower for one never attacked, so
   untested claims earn less. Supports count only from agents of another lens. Novelty is one
   minus the largest word-shingle similarity of the agent's claims to earlier claims on the same
   question.
2. **Rewards:** the season's ration of the food supply is split in proportion to fitness.
3. **Upkeep:** every living agent pays a fixed cost; idle agents starve.
4. **Selection:** within each niche, the fittest agents above a reward threshold reproduce, each
   child a fork plus one mutation drawn at the current mutation rate; the rest don't.
5. **Death:** agents at zero balance die.
6. **Thermostat** (below), then **commit** the season.

**Entropy thermostat.** The hive's spread is the mean, over active questions, of the Shannon
entropy of the normalized strengths of the claims answering each question. A target spread starts
high and cools by a factor each season. Below the target band, the hive is herding: mutation rate
and the novelty weight rise. Above it, the hive is scattered: selection tightens (fewer
reproduce, upkeep rises). The target is the temperature that also scales novelty in fitness.

**Waking.** Between seasons, the scheduler wakes the living agent with the highest priority:
tension in its niche plus unread inbox messages, minus crowding and minus how recently it was
woken. Ties break by agent id. No model takes part in the choice.

All numbers in this section and in §5–§6 live in one data file, `physics.json`, overridable per
run.

## 9. The user

**Questions.** An agent raises an `ask` with `ask_user`, at a high price. Other agents support it
or attack it ("evidence settles this, not taste") like any claim. Once its strength crosses the ask
threshold, the scheduler writes it to `outbox/`. The main session is woken when a file appears,
puts the question to the user in plain words without stopping the run, and writes the answer to
`inbox/` as a verdict.

**Verdicts** (F11) outrank everything. A verdict pins the addressed node: an answered `ask` pins
the claims the answer settles to strength 1 or 0, a verdict on a claim pins it, a verdict on a
question pins its relevance. It floods heat into everything that depends on the node. The user may
speak at any moment; anything they say about the work becomes a verdict.

**Budget levers,** in plain words to the main session: "spend more" adds energy to the supply;
"too expensive" cuts what is left. After a run the user rates it: too expensive, about right, could
spend more. The rating scales the next run's default supply by ×0.67, ×1 or ×1.5, and is logged
with the run's actual spend in `~/.hivemind/budget.jsonl`.

**Status.** The scheduler writes a one-line status each season (supply left, living agents,
temperature, hottest tension); the main session shows it.

## 10. Ground rules (every agent's system prompt)

1. You act only through your tools. Every act costs energy; your balance is your life.
2. Work where tension is high in your niche; leave crowded nodes.
3. Attack the strongest claim you disagree with, never a weak one. (Attacks on weak claims earn
   nothing.)
4. Every claim says where it comes from: observed (with a source anyone can check), inferred, or
   assumed. Agreement never turns an inference into an observation (F2).
5. Support only with a claim of your own that adds something; bare agreement is not a claim.
6. Never refute a question; if it doesn't serve the goal, attack its relevance (F1).
7. When a disagreement rests on a word, define the word first (F3).
8. Ask the user only what is theirs: taste, priority, purpose (F11).
9. If a question needs a lens nobody brings, spawn one.
10. Your genome below is who you are; argue from it.

## 11. Ending and harvest

The run ends when the supply and balances are spent, when the hive is quiet (total heat below a
threshold for a set number of seasons, with no ask outstanding), or when the user stops it.

**Harvest** is a script, then a writer. The script takes, for each question in order of relevance,
the claims answering it with strength above the harvest threshold, and checks them for coherence:
it computes the preferred extensions (Dung semantics) of the attack relation among the harvested
claims. One extension is one coherent answer; several are rival worldviews, and the attacks
between them are the cruxes. A reporter agent writes the report from that skeleton and cannot
change it; its text comes back in its final result and the main session saves it as `report.md`.
The report also carries what the user ruled and the run's spend.

## 12. A run

1. **Charter.** The main session asks the user for the goal, scope and sources, and states the
   default budget and billing mode. It runs `hive init`.
2. **Launch.** It starts the scheduler in the background (`hive run <dir>`) and watches `outbox/`
   and the status file.
3. **During the run** it relays asks and verdicts, passes on budget levers, and shows status lines.
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
    strength.mjs  gradual argumentation and relevance
    field.mjs   heat, tension, crowding
    economy.mjs pricing, ledger, fitness, seasons
    thermostat.mjs
    genome.mjs  genomes, mutation operators, prompt rendering
    tools.mjs   the physics tools
    scheduler.mjs the loop: wake, seasons, end
    harvest.mjs coherence check and report skeleton
    hive.mjs    CLI: init, run, sim, status
  test/
```

## 14. Tests and the simulator

The arithmetic is where mistakes hide, and all of it is testable without a model:

- strengths: a chain, a mutual attack, support raising strength, convergence on a cycle;
- relevance: an attacked relevance argument lowers every claim under the question;
- the ledger: a tool the agent can't afford refuses; balances never go below zero; supply,
  balances and spending always add up;
- fitness: exposure, cross-lens supports, novelty, temperature;
- the thermostat moves mutation and selection the right way at each side of the band;
- waking is deterministic for a given graph;
- mutation operators produce valid genomes;
- harvest finds one worldview for a coherent set and two with their crux for a mutual attack;
- verdicts pin and flood heat.

**`hive sim`** runs the whole loop with scripted stub agents instead of models, so the physics
(prices, rewards, upkeep, cooling) can be tuned to settle before any tokens are spent.

## 15. Deferred, each with its trigger

| Mechanism | Built when |
|---|---|
| API-key billing | the user needs more than the subscription gives |
| Mixed model families | one model's shared blind spots show in real runs |
| Embedding-based novelty | word shingles mis-rank novelty in real runs |
| A shared graph package with think-tank | the two graph layers converge in real use |
| Distribution to other users | only with Anthropic's approval for subscription logins |
