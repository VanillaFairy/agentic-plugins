# Architecture

The design is `C:\work\claude\vanillafairy\docs\superpowers\specs\2026-11-03-hivemind-design.md`.
This file holds what tasks need from it without re-reading the whole spec. Where they differ, the
spec wins.

## Repository

A new plugin at `C:\work\claude\vanillafairy\hivemind`, its own git repository (branch `master`),
like `think-tank` beside it. Node ≥ 20, ES modules (`.mjs`), tests with `node:test`.

## Module boundaries

```
src/
  graph/nodes.mjs     parse and serialize node files (pure)
  graph/schema.mjs    the node schema as data, and validation (pure)
  graph/store.mjs     the run directory: load, write nodes, git init and commit, seq (I/O)
  events.mjs          append to events.jsonl (I/O)
  physics.mjs         load physics.json merged with the run's overrides (I/O, small)
  strength.mjs        gradual argumentation, ceilings, lineage aggregation, relevance (pure)
  dung.mjs            preferred extensions of an attack graph (pure)
  harvest.mjs         per-question extensions, projection, cruxes, the report skeleton (pure)
  field.mjs           heat, tension, crowding, active questions (pure)
  economy.mjs         pricing, ledger, escrow, tick settlement, pay rules (pure)
  thermostat.mjs      spread and the clamped controller (pure)
  genome.mjs          genome shape, operator draw, second parent, lineage, rendering (pure)
  tools.mjs           the physics tool handlers over a Hive (pure over the Hive object)
  hive.mjs            the Hive: in-memory state over a store, the one writer (I/O through store)
  scheduler.mjs       the loop over a Runner: wakes, ticks, births, deaths, pauses, end
  runner-sdk.mjs      the Runner on the Agent SDK (the only file importing the SDK)
  sim.mjs             the Runner of scripted stub agents and its cost model
  cli.mjs             `hive init|run|sim|status|verdict|rate` (the bin)
physics.json          every tunable number, defaults
skills/hivemind/SKILL.md, README.md, .claude-plugin/plugin.json, package.json
```

Pure modules take plain data and return plain data: no file system, no clock, no randomness
except through an injected `rng`. Their tests build data in memory. Only `store`, `events`,
`physics`, `hive`, `scheduler`, the runners and `cli` touch the disk or the network.

## Run directory

```
~/.hivemind/runs/<YYYY-MM-DD>-<slug>/
  graph/          one <id>.md per node, a git repository; the state
  events.jsonl    the audit trail, append-only
  seq             the last seq handed out (the clock and the id counter)
  outbox/         <ask id>.json, one per ask that reached the user
  inbox/          <n>.json, verdicts and commands from the main session
  status          one line, rewritten
  report.md       saved by the main session
~/.hivemind/budget.jsonl   one line per rated run
```

## Node kinds

Each node is a Markdown file: YAML frontmatter, a `# title`, a body. Every node has `id`, `kind`,
`author`, `seq`. Ids are `<letter>-<seq>`: `g` goal, `q` question, `c` claim, `a` agent,
`v` verdict, `k` ask.

| kind | Required | Optional |
|---|---|---|
| `goal` | purpose, sources, supply, settings | scope |
| `question` | parent | |
| `claim` | provenance | source, answers, attacks, supports, checks, decides, term, pinned, novelty_paid |
| `agent` | genome, lineage, species, niche, energy, escrow, born | died, parent, buds, session, sources_read, last_wake, inbox, founder |
| `verdict` | addresses (a list) | pins |
| `ask` | candidates | sent |

- Answers to one question are rivals by default (spec §5): no field marks it.
- `agent.inbox` is a list of `{ from, text, tick, read }`; `look` marks entries read.
- The goal's `settings` holds `tick`, `physics`, `ledger`, `thermostat`, `births` and `inbox_last`.

- A claim has exactly one of `answers` (a question id), `attacks` or `supports` (a claim id, or
  `<question id>#relevance` for a question's relevance argument), or none for a `term: true`
  definition.
- `checks: <claim id>` marks a verification of an F claim; `decides: [<claim id>, <claim id>]`
  names the two rival answers it would settle.
- `pinned: 1 | 0` is set by a verdict; strength then equals the pin.
- `agent.genome` is an object: `lens`, `stance` (`challenge` | `extend` | `orthogonal`),
  `constraints` (list), `species` (`explorer` | `critic`), `temperament` (0–1).
- `agent.sources_read` is the list of source paths the agent has read with `source`.

## The clock

`seq` is one counter. Every new node takes the next `seq` as its id number. A **tick** is one agent
tool call: the scheduler advances `tick` (stored in the goal's `settings.tick`) once per tool call,
never for ledger lines, income, upkeep or thermostat changes. Heat and windows count in ticks.

## physics.json (defaults, preliminary; `hive sim` tunes them)

```json
{
  "prices": { "look": 200, "read": 100, "source_per_kb": 50, "claim": 2000, "define": 1500,
              "question": 2000, "message": 300, "ask_user": 20000, "spawn": 30000, "seed": 0, "rest": 0 },
  "usage_weights": { "input": 1, "cache_read": 1, "cache_write": 1, "output": 1 },
  "supply": 1000000,
  "run": { "model": "opus", "effort": "high", "concurrency": 4, "burst": 4, "commit_every": 25 },
  "wake_reserve": 60000, "context_cap": 150000,
  "endowment_seed": 80000, "budding_threshold": 200000, "max_buds": 3, "upkeep": 50,
  "income_rate": 400, "novelty_rate": 20000, "critic_rate": 30000, "weak_ratio": 0.5,
  "standing_threshold": 0.5, "strong_threshold": 0.6, "harvest_threshold": 0.6,
  "ask_threshold": 0.6, "ask_max_ticks": 200, "wake_floor": 0.1,
  "crowd_window": 50, "heat_half_life": 40, "verdict_heat": 10, "question_base_factor": 0.8,
  "base": { "F_verified": 0.8, "F_unchecked": 0.5, "F_failed": 0.15, "I": 0.5, "A": 0.3 },
  "ceiling": { "F_verified": 1.0, "F_unchecked": 0.8, "F_failed": 0.3, "I": 0.8, "A": 0.5 },
  "qe": { "step": 0.1, "max_iters": 500, "eps": 1e-6 },
  "thermostat": { "target_start": 0.9, "cooling": 0.999, "band": 0.1, "gain": 0.5, "ema_alpha": 0.05,
                  "clamps": { "mutation_rate": [0.1, 0.9], "novelty_weight": [0.5, 3],
                              "upkeep_factor": [0.5, 3], "budding_factor": [0.5, 2],
                              "floor_slack": [0, 0.1] } },
  "species_floor": 0.25, "species_ratio": { "explorer": 0.6 },
  "max_extensions": 64
}
```

## Design decisions

- Model and effort are run settings shared by every agent (default Opus); a genome has neither.
- Lineage: founders' seeds and transplants start a new lineage; every other birth keeps the
  parent's. "Another lens" means another lineage everywhere.
- The scheduler is the only writer, so the store needs no lock.
- A tick is an agent tool call; nothing else advances the clock.
- Billing is the Claude Code subscription only: the SDK runner strips every `CLAUDE*` and
  `ANTHROPIC*` variable from agents' environments except `CLAUDE_CONFIG_DIR`.
- Hivemind owns all its code; nothing is imported from think-tank. T01 copies think-tank's node
  parser as the starting point of `graph/nodes.mjs`.
