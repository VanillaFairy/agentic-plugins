# Architecture

The design is `C:\work\claude\vanillafairy\docs\superpowers\specs\2026-11-03-think-tank-design.md`.
This file holds what tasks need from it without re-reading the whole spec.

## Module boundaries

`skills/think-tank/scripts/tt.mjs` is the CLI only: it parses arguments, calls the library, prints
JSON. Everything it calls lives in `skills/think-tank/scripts/lib/`:

- `nodes.mjs`: reading the graph. No writes, no git.
- `topics.mjs`: the needs graph between topics. Pure functions of `nodes`.
- `rules.mjs`: the closing rules of one topic. Pure functions of `nodes` and options.
- `problems.mjs`: per-node problems and expert-card coverage. Pure functions of `nodes`.
- `store.mjs`: everything that writes: init, the lock, `seq`, commits, verdicts, wake counts.
- `index-file.mjs`: writes `<run>/index.md` from `nodes`.

Pure modules never touch the file system, so their tests build `nodes` maps in memory.

## Run directory

```
<run>/
  procedure/   FOUNDATIONS.md and roles/, copied at init
  graph/       one <id>.md per node; its own git repository
  index.md     rewritten after every commit
  seq          the last sequence number handed out
  .lock/       exists only while a writer holds the lock
  report.md    saved by the main session from the reporter's hand-back
```

There is no `map.md`, no `agenda/`, no `check.json` and no round counter.

## Node roles and their frontmatter

| `role` | Id | Required | Optional |
|---|---|---|---|
| `charter` | `charter` | | in_scope, out_of_scope, sources, cap |
| `topic` | `q-<key>-<seq>` | facet, status | root, needs, outcome, completed_seq, decided_as, duplicate_of, extracted_from, escalation |
| `proposal` | `p-<key>-<seq>` | answers | refines |
| `claim` | `c-<key>-<seq>` | target, stance | provenance, source, verified, status |
| `position` | `pos-<key>-<topic>` | topic, state | holds |
| `crux` | `x-<key>-<seq>` | topic, between, decided_by | acknowledged_by |
| `ballot` | `b-<key>-<topic>` | topic, confidence | doubt |
| `term` | `d-<key>-<seq>` | status | |
| `expert` | `e-<key>` | lens, facets, biases, checks | counters, title |
| `verdict` | `v-<n>` | addresses | |

`<key>` is the author's key (`save` for `save@q-x-12`, `composer`, `registrar`, `mod`) and `<seq>` the node's own `seq`, so ids stay unique when one lens argues on several topics. Every node except `charter` also carries `author` and `seq`. Value sets: topic `status` is `open`,
`blocked` or `complete`; `outcome` is `decided`, `crux`, `ruled` or `set-aside`; claim `stance` is
`pro`, `con`, `ask` or `reply`; `provenance` is `F`, `I` or `A`; `verified` is `yes` or `no`; claim
`status` is `open` or `conceded`; position `state` is `arguing`, `holding` or `agreeing`; ballot
`confidence` is an integer 1–10.

## Agent names and ids

The `Agent` tool allows only `[A-Za-z0-9_-]` in names, so an agent's harness name and its id in the
graph differ:

| Agent | Harness name (for `SendMessage`) | Id in the graph (`author`, commits) |
|---|---|---|
| main session | `main` | `user` for verdicts |
| composer | `tt-composer` | `composer` |
| registrar | `tt-registrar` | `registrar` |
| moderator of topic `<t>` | `tt-mod-<t>` | `mod@<t>` |
| expert `<key>` on topic `<t>` | `tt-<key>-<t>` | `<key>@<t>` |

Every brief names the agents its holder talks to by harness name, and authorizes acting on their
requests: a moderator's brief names `tt-registrar`, `tt-composer` and `main`; an expert's names its
moderator and its teammates; the registrar's and the composer's briefs authorize requests from any
`tt-mod-*` agent of the run.

## Design decisions

- A topic that closes on a named crux is complete; it does not block its needers.
- The moderator never weighs substance; it applies `topicRules`. The registrar judges relevance and
  sameness of questions; no script does.
- An expert instance is `<key>@<topic>`; its card `e-<key>` is a template.
- Agents commit concurrently, so `commitFiles` is the only writer to git and holds the lock.
- A wake is one commit: `wakesOf` counts commits per git author, and the CLI passes that as `wakes`.
- 1.0.0 is a major version: a run made on 0.x can't continue on it, and no migration exists.
