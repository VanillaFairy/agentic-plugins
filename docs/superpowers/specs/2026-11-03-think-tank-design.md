# think-tank — design

Status: draft for review. Nothing is built.

This doc maps the foundations ([2026-11-03-think-tank-foundations.md](2026-11-03-think-tank-foundations.md))
onto Claude Code. It's a **map of mechanisms, not a build list**: each one is built only when a real
run hits the failure it prevents. The first build is the smallest seed (§17). Each mechanism is to
name the foundation it serves; that mapping is the next pass on this doc.

## 1. What it is

`/think-tank <problem>` produces a **multi-faceted solution** to an open problem by running a swarm
of expert agents that argue on a shared board. The swarm grows while it explores (new questions,
new experts) and shrinks while it settles (decisions, retired experts). The user takes part
throughout: escalations reach them as they arise, and their verdicts can redirect the discussion
at any moment. The deliverable is a solution document whose every statement cites the board items
that justify it.

| | socratic | think-tank |
|---|---|---|
| Output | one recommendation among known options | an assembled solution with many decisions |
| Shape of the question | fixed | grows: agents raise new questions |
| Debaters | 2–5, fixed for the run | a roster that changes as facets appear |
| Who reads what | everyone reads everyone | each agent reads only the view rendered for it |
| State | round files, read whole | a knowledge graph of linked Markdown files, with an event log as its audit trail |
| The user | reads the outcome | rules on escalations while the run is going |

From socratic it keeps: deliberate stance differentiation, pinned terms, claim provenance (fact,
inference, assumption), push back before conceding, verification of load-bearing facts by someone
who checks the author's bias, blind ballots, the untested-shared-premise check, and neutral judges
of the stop conditions.

This skill is for problems wide enough to need decomposition. A question one good answer settles
goes to `/socratic` or a direct answer, and the plan card says so.

## 2. Prior art

- **Blackboard architecture** (Hearsay-II and successors): independent knowledge sources post to a
  shared board, and a control component picks who acts next from board events. That's the
  skeleton here.
- **IBIS argument mapping** (Kunz and Rittel): a discussion is a graph of issues (questions),
  positions (answers) and arguments for and against positions. It supplies the item types, and
  the split between questions, which expand the discussion, and proposals, which get attacked.
- **Delphi method**: anonymous estimates over rounds, with the spread reported. It's the source of
  the blind ballots and of reporting disagreement instead of averaging it away.
- **Multi-agent debate studies**: debate between LLM instances is reported to improve factuality,
  and to fall into degeneration of thought, conformity and sycophancy when the instances share a
  model and a stance. Gains over self-consistency at equal compute are reported as small unless the
  stances really differ. Hence the direction-based coverage in §7 and the ballots in §8.
- **Group-chat speaker selection** (AutoGen style): a manager model picks who speaks next. Rejected
  as the main mechanism: routing here is computed, and models judge only what code can't.
- **Write-ahead logging** (databases): every change is logged before it's applied, so the log is a
  complete audit trail and a half-applied change is detected and finished after a crash, while the
  state itself is read directly.
- **Linked-note knowledge graphs** (Zettelkasten, wiki-style note graphs kept by LLM agents) and
  **GraphRAG's** per-community summaries: knowledge kept as small linked notes, with a summary node
  per cluster that's rewritten as the cluster changes. That's the shape of the canvas the swarm
  reads (§4).
- **Keeping it balanced**: B-trees (split a node that's too full, merge one that's too empty, so
  depth stays logarithmic), RAPTOR and GraphRAG's hierarchy of summaries (summaries of summaries,
  level by level), Wikipedia's summary style (a long article becomes a short section that links a
  "main article"), and Zettelkasten structure notes (index notes that organise other notes without
  owning them).

## 3. Roles

| Role | Kind | Job | Reads | Tools |
|---|---|---|---|---|
| Main session | the user's session | charter interview, plan card, launching each round, putting escalations to the user, posting verdicts to the inbox, presenting the report | round status, the report | all |
| Scheduler | Workflow script | one round: its stages in the order the bundle lists | checksummed status from the relay | none |
| `board.mjs` | Node, no dependencies, tested | the only writer of the graph and the log; validates each event, logs it, patches the graph; writes reading sets and judge inputs; computes shards, dockets, predicates, coverage, metrics and gates | the run directory | — |
| Relay | cheap agent, no judgment | runs named `board.mjs` subcommands with arguments the script gives it, returns stdout verbatim | — | `node board.mjs` subcommands only |
| Verdict compiler | agent | turns a verdict's words into typed effects on ids (§9) | the verdict, the rendered item index | Read, Grep on `views/` |
| Composer | strong agent | preliminary analysis, the registry, persona cards, coverage-closed change sets | the charter, the gap, the registry | Read |
| Chair | agent | cross-shard calls only: phase moves per shard, spawn requests, escalation triage | computed tables: per-shard metrics, coverage gaps, new escalations | Read |
| Warden | agent, one per shard | admits, parks or rejects new questions; maps their facets; checks blocking claims | its shard's new `Q`s with parent chains, the charter | Read |
| Decider | agent, one per shard | proposes `DECIDE` on ripe questions; reopens or confirms flagged decisions | computed lists: ripe `Q`s, flagged `X`s, with their support paths | Read |
| Curator | agent, one per changed topic or hub | rewrites a summary from its previous version and what changed | the node, the nodes changed since its last summary | Read on `graph/` |
| Librarian | agent, one per out-of-band node | proposes how to split, merge or re-file a node that's out of balance | the node, its children's titles and summaries, the graph health report | Read on `graph/` |
| Experts | agents, one per turn | argue their docket; return events as JSON; keep notes in their own memory node | their reading set in `graph/`, then any node they follow links to | Read on `graph/`, plus grants per lens |
| Integration critic | strong agent, one per shard plus one cross-shard pass | finds decisions that conflict or leave a seam | the shard's decisions; for the cross-shard pass, the decision summaries | Read |
| Reporter | strong agent, one per shard plus one assembly call | writes the report sections, citing ids | the shard's part of the graph; the assembler gets the sections | Read |

No agent writes a file or runs anything except the relay. Every agent returns schema-validated
JSON to the script. The script stamps the author from the agent() call that returned it,
overwriting any author field in the payload, and `board.mjs` checks the stamped author against the
roster for that stage. No agent sees the whole board; the per-shard judges see one shard.

## 4. The board

### The graph and the log

Two artifacts, each the truth for its own question:

- **The knowledge graph** (§4 below) is the state: what is known, proposed, decided and parked,
  now and historically. It's a folder of linked Markdown files that agents and the user read
  directly. Nothing is rendered from anything to produce it.
- **The event log** is the audit trail: every change ever made to the graph, with who made it, in
  which round, and why. It's append-only and never replayed in normal operation.

Every change is an event. `board.mjs` is the only writer of both, and it handles each event in one
call: validate it, append it to the log, then patch only the graph files it touches. The log is
written first, as in a database's write-ahead log, so a crash between the two is detected (the log
holds an event the graph doesn't show) and finished on the next call. The roster, registry,
charter, parameters and phases are graph nodes too.

| Event family | Events |
|---|---|
| Items | `Q`, `P`, `C`, `O`, `D`, `X` |
| Knowledge | `SUMMARY` (a curator's summary of a topic or hub), `NOTE` (an expert's note to its own memory node), `RESTRUCTURE` (a librarian's split, merge or re-file of navigation) |
| Moves | `POSITION`, `CONCEDE`, `ANSWER`, `RATIFY`, `ADMIT`, `PARK`, `REJECT`, `BLOCKING`, `FACET-GAP`, `DECIDE`, `REOPEN`, `CONFIRM` |
| Registry | `REG` (facet, lens, bias, direction) |
| Roster | `SPAWN`, `CARD`, `RETIRE`, `REACTIVATE` |
| Charter and parameters | `CHARTER`, `PARAM` |
| User | `ESCALATE`, `VERDICT`, `EFFECT`, `CLOSE` |
| Control | `SEGMENT`, `PHASE`, `TURN-MISSING`, `REJECTED` |

### Item types

| Type | Meaning | How it's challenged |
|---|---|---|
| `Q` question | a push in a direction: "how do we serialize the graph?" | relevance only: admitted, parked or rejected by its shard's warden; never refuted. The user re-admits by verdict |
| `P` proposal | an answer to a `Q` | attacked by objections, supported by claims |
| `C` claim | evidence for or against a `P` or `C`: `F` (checked at a source outside the board), `I` (inference), `A` (assumption) | objected to; load-bearing `F` claims verified |
| `O` objection | an attack on a `P` or `C` | answered, conceded or left open |
| `D` definition | a pinned meaning for a term | ratified or contested |
| `X` decision | a `Q` closed by an accepted `DECIDE` or by a verdict | reopened by a refuted load-bearing fact, a decider's `REOPEN`, or a verdict |

"How do we serialize the graph? I propose X" is posted as two items: a `Q` and a `P` answering it.
The `Q` gets the relevance check, and once it's admitted, the `P` gets attacked. Rival proposals,
including near-duplicates, attach to the same `Q` as rivals. Every `Q` names its parent item and a
facet, either a registered facet id or `NEW{name, why}` (§7). Every item lists the terms it relies
on as `terms: [D ids]`.

`board.mjs` enforces type rules on append: an `O` can't target a `Q`; an `F` claim must carry an
external source; a claim built only on board items is stored with the weakest provenance among
them; every referenced id must exist; the stamped author must be on the stage's roster.

### Predicates

`board.mjs` computes these from the graph's index. No model judges them, and they're tested.

| Predicate | Definition |
|---|---|
| holds | expert `e` holds `P` on `Q` when `e`'s latest `POSITION` on `Q` names `P` |
| touched | `e` touched `Q` when `e` posted an item or move anywhere in `Q`'s subtree |
| leading | the `P`s on `Q` with the most holders among touchers; a tie makes every tied `P` leading |
| clash | `Q` has had a clash when an `O` on a leading `P`, posted by someone other than the `P`'s author, was later answered or conceded |
| load-bearing | an item on the support path (claims under claims, transitively) of a leading `P` of an open or decided `Q` |
| ripe | `Q` is ripe when it has had a clash, no load-bearing `O` or `ASK@` on it is open, and none of its items uses a contested term |
| frozen | an item is frozen while it, or an ancestor, has an open `ESCALATE` |
| unattended | an item no event has referenced for `unattended_rounds` rounds |
| quiescent | a round with no new events other than control events, and nothing routable |

### Shards

A **shard** is the subtree under one root question. `board.mjs` computes shard membership from
parent links. Shards are the unit of phase (§8) and of parallel judgment: wardens, deciders,
integration critics and reporters run one call per shard. The granularity is a parameter
(`shard_by`, default root question), so splitting finer later is data, not a rewrite.

### The knowledge graph

The canvas the swarm works on is a knowledge graph, kept as a folder of linked Markdown files. It's
what every agent reads. Agents never read the event log.

**The graph is the state, patched in place.** Each event changes a handful of files: a new
proposal is a new node plus a link line in its topic; a concession edits one frontmatter field. The
cost of a change is proportional to the files it touches, never to the size of the graph. Agents
still never write files themselves (§3); they return events, and `board.mjs` applies them. The
graph is a git repository: `board.mjs` commits it at the end of every stage, with the event ids in
the commit message. That gives the user a browsable history and a diff between any two rounds, and
gives resume a cheap rollback (§4, files).

`board.mjs` keeps a small index of the graph (ids, roles, statuses, typed links) beside it, updated
with every patch. It's a cache of the graph, rebuildable from the files, and it's what the
predicates, routing and the health report read, so none of them has to parse the whole graph.

**Nodes.** One file per node. The frontmatter's `role` says what the node is:

| `role` | One per | Holds |
|---|---|---|
| `map` | run | the charter, the top-level hubs, every shard's decisions as one line each |
| `shard` | shard | the shard's hubs and topics with their status, its decisions, its parked questions |
| `hub` | group of related topics | a summary of its children and one line per child; navigation only, owns no items |
| `history` | topic with a long past | its superseded and rejected proposals, one line each, grouped by outcome |
| `topic` | admitted `Q` | the latest summary of where the question stands |
| `proposal`, `claim`, `objection` | item | the item's own text and status |
| `decision` | `X` | the decision, its state and its support path |
| `term` | `D` | the pinned meaning |
| `source` | external source cited by an `F` claim | a snapshot of the text as read, with its URL or path |
| `expert` | expert | its card, its positions and the reasons it noted |
| `verdict` | verdict | the user's words and the effects compiled from them |

Other frontmatter: `id`, `status` (open, leading, rival, rejected, superseded, decided, parked,
frozen), `shard`, `updated_round`, and, on topics, `summary_round`.

**Links are typed by their description.** A node's `Links` section is a list of lines of the form
`- <edge>: [title](path)`. The edge word is the link's role: `parent`, `child question`,
`leading`, `rival`, `rejected` (with the objection that sank it), `refined into`, `superseded by`,
`supports`, `objects to`, `answers`, `term`, `depends on`, `decided as`, `source`, `verdict`, and
for navigation `filed under`, `contains`, `history`. A rendered `Backlinks` section lists every
node linking in, so a reader can always find what points at the node it's on.
`board.mjs` writes these lines and parses them back, so a typed edge can never drift from the
events.

**Latest and history share one topology.** A topic node shows only where the question stands now.
Its links reach every proposal ever made on it, and those nodes stay: a rejected one links the
objection that sank it, and one that was improved on links forward with `refined into`. An agent
reading the latest summary can walk back through the history, and nothing past is deleted or
duplicated into the summary.

**Topic summaries and the curator.** A topic is dirty when any event touched its subtree since
its last summary. A curator rewrites each dirty topic's summary from the previous summary plus the
nodes that changed, and posts it as a `SUMMARY` event. `board.mjs` checks the summary before it
lands. It must link every load-bearing item, every open objection and question, and the decision
if there is one, so nothing important is left out. Every link must resolve to a node in the topic's
subtree or to one it `depends on`, so nothing irrelevant is pulled in. A summary that fails the
check is `REJECTED` and retried next round. Until then the old summary stays, with its
`summary_round` showing how stale it is.

### Keeping the graph balanced

The graph will grow fast and wide. Four mechanisms keep each file a readable size and every live
node a few hops from the map.

**1. Two layers: arguments and navigation.** The argument structure (a `P` answers a `Q`, a `C`
supports a `P`) comes from the events and never changes. Navigation (which hub a topic is filed
under, how hubs nest) is a separate layer of `hub` nodes and `filed under` links, and it can be
reshaped at any time. Reorganising the graph never rewrites an argument or an id. Every node lives
at `graph/<id>.md`, in one flat folder, so moving a topic between hubs never moves a file or breaks
a link.

**2. A size band for every navigation node, like a B-tree.** `board.mjs` measures each node every
round: rendered size in tokens, number of children, number of links. A navigation node (map, hub,
topic, history) is in band when its size and child count sit between a floor and a ceiling.

- **Too big: split.** A hub with too many children gets two or more child hubs. A topic whose
  summary or link list is too long moves its settled subquestions into child topics, and its
  history into a `history` node. Each split leaves a short summary behind, with a link to the
  "main" node, the way a long Wikipedia section becomes a summary plus a link to its own article.
- **Too small: merge.** A hub with one or two children is dissolved into its parent. A topic with
  nothing but one quiet proposal is filed into a sibling hub's list instead of standing alone.
- **Small items stay inline.** A claim or objection with no replies of its own is rendered as an
  anchored section of its parent's file (`p-12.md#c-40`), not as a file. It gets its own file the
  moment something replies to it or links to it from elsewhere, so the store doesn't fill with
  one-line files.

Because splits and merges keep every navigation node in band, the path from the map to any live
topic grows with the logarithm of the graph's size, not linearly.

**3. History is shelved, not deleted.** A topic keeps only where it stands now. Once its past
proposals outgrow the band, they move to the topic's `history` node, one line each, grouped by
outcome (rejected, superseded, refined). Each line links the full node. The latest view stays small
and the history stays one hop away.

**4. Who does what.** `board.mjs` measures and detects: every round it renders a **graph health
report** (node sizes, fan-out, depth from the map, orphans, stale summaries, out-of-band nodes). A
**librarian** call, one per out-of-band node, decides the grouping, since only a model can tell
which topics belong together. It posts a `RESTRUCTURE` event: create, split or dissolve a hub,
re-file a topic, shelve history. `board.mjs` accepts it only if every node involved ends up in
band, every live node is still reachable from the map, and no link breaks. Curators then write
summaries for any new hubs. Librarians run as their own stage, after the deciders, and only when
the health report shows an out-of-band node.

**Navigating.** Every node shows its breadcrumb (map → hub → … → node) at the top, its backlinks
at the bottom, and its summary first. Every hub's summary is a summary of its children's
summaries, so an agent can read a whole region at any level of detail and stop as soon as it knows
enough. The item index (§9) remains the escape hatch for finding a node by words.

### Ids, stages, epochs and files

An event id is `<round>.<stage>-<agent>-<n>`. The stage order is bundle data: a table per phase
listing ordered stages and the roles in each. The default order of a round is user, experts,
warden, decider, chair; verify and report have their own stages. Events are applied in that order,
so the result never depends on which call finished first.

```
~/.think-tank/
  bundles/<hash>/          content-addressed procedure bundles (§15)
  runs/<YYYY-MM-DD>-<slug>/
    bundle                 the hash this run uses
    graph/                 the knowledge graph, a git repository
      <id>.md              one flat folder of nodes
      .index.json          board.mjs's cache of the graph; rebuildable from the files
    log/<round>.jsonl      the event log, one append-only file per round
    inbox/<seq>.json       verdicts waiting to be claimed; outside the graph, never rolled back
    views/<round>/         reading sets, judge inputs, item index
    report/<version>.md    reports
```

`board.mjs` writes each file under a temp name and renames it, so a file is whole or absent. Every
segment opens with `SEGMENT{epoch}`. Every append carries `--epoch`, and `board.mjs` refuses an
epoch older than the latest `SEGMENT`, so a stopped segment's late write can't land on the live
graph. **Rolling back** a round (a stop for an immediate verdict, a crash) resets the graph to the
commit that closed the previous round and marks that round's log entries as rolled back. The log
keeps them, since it's the audit trail, and says why they were undone. The graph's file format
carries a version in each node's frontmatter.

## 5. A turn

At the start of the expert stage the relay runs `board.mjs render --round R`, which writes
`views/R/<expert>.md` for every active expert: its **reading set**, a list of links into `graph/`.
Each expert's prompt names that file and the board head (§10). The expert starts from its reading
set and reads further by following links, as far as the item in front of it needs.

**The reading set** holds:

- the **docket**: the items routed to it this round (below), each with its topic node;
- its own `expert` node: its card, its positions, and the reasons it noted in earlier turns;
- its shard's `shard` node, and the run's `map` node, so it knows what's already decided
  elsewhere;
- for an expert that's new or back from retirement, a **catch-up list**: the topic nodes in its
  facets whose `updated_round` is later than its last active round. A newcomer gets every topic in
  its facets. It starts from the summaries, never from the raw history, and walks the history only
  where a summary sends it.

Frozen items are marked frozen and aren't argued. With each turn's events, an expert may post a
`NOTE` to its own node: why it holds what it holds, what it checked. That's how reasons, not only
positions, carry over between its turns.

**Routing** orders the docket by computed priority (depth, how many items depend on it, the weight
of the charter goal it serves), interleaving the rules so no rule starves the others:

0. Verdict effects: items an `EFFECT` touched go to their owners and to everyone who touched them.
1. Owed replies: an `O` on the expert's item, an `ASK@` to it, a `REJECTED` event to fix.
2. Bias checks: every new `P` and load-bearing `C` goes to one checker per opposing direction of
   the author's bias (§7).
3. Facet match: an admitted `Q` goes to the experts registered on its facet.
4. Unattended items go to the least-loaded matching expert.

The expert returns new items and moves as JSON, including a `POSITION` on each `Q` it argued.

## 6. Parameters

No limits in v1. Every limit is a **parameter, unset by default**, with its binding behaviour built
and tested now, so tuning later is posting a number, not writing code. Parameters are `PARAM`
events, not part of the bundle hash, so the user can set one mid-run by verdict and it takes effect
at the next round.

| Parameter | Measures | When set, it |
|---|---|---|
| `docket_max` | items routed per expert per round | defers the lowest-priority items to the next round; never drops them |
| `posts_max`, `new_q_max` | items, and new `Q`s, per expert turn | rejects the excess back to the author as `REJECTED`, who may post it next round |
| `roster_max` | active experts | turns a spawn that would exceed it into an escalation |
| `q_depth_max` | links from a `Q` to the charter | has the warden park deeper `Q`s unless they're blocking |
| `rounds_max` per shard phase | rounds a shard spends in a phase | makes the chair move the shard on or escalate it |
| `calls_budget`, `tokens_budget` | spend so far | sends every shard to verify, then report |
| `unattended_rounds` | rounds without a reference | sets when rule 4 reroutes (a cadence, default 2) |
| `retire_after` | empty rounds before retiring | sets when an idle expert retires (a cadence, default 2) |
| `shard_by` | shard granularity | changes how `board.mjs` cuts shards |

The **balance band** (§4) is the exception: it ships with starting values, because an unset band
would mean no balancing at all. It doesn't limit what the swarm does, only how the graph is filed.

| Parameter | Starting value | Applies to |
|---|---|---|
| `node_tokens_min`, `node_tokens_max` | 150, 2500 | rendered size of a navigation node |
| `hub_children_min`, `hub_children_max` | 3, 12 | children of a hub or the map |
| `topic_history_max` | 6 | past proposals a topic lists before shelving them |

## 7. The registry and the roster

The Composer registers **facets, lenses, biases and directions** as `REG` events with ids. Each
bias lists two or more opposing directions. Each lens declares the directions it argues from.
Persona cards reference only registry ids: a lens, its facets, the bias it carries, and the
(bias, direction) pairs it checks.

`board.mjs coverage` passes when:

- every active bias has active checkers covering **at least two distinct opposing directions**;
- no two active experts share a lens;
- every facet of an admitted `Q` has an active expert, or a pending spawn.

"Two adversaries from different directions" is checked as a fact about ids, so a paraphrase can't
pass or fail it.

**New facets.** A `Q` may carry `facet: NEW{name, why}`. On admission, the warden either maps it to
an existing facet id or records `FACET-GAP`. An admitted `Q` with a `FACET-GAP` is a computed gap:
the chair requests a spawn, and the Composer's change set registers the facet. This is how the
swarm adds experts when a new facet appears.

**Spawning.** The chair requests a spawn by naming a gap `board.mjs` can see: a `FACET-GAP`, or a
bias with fewer than two directions covered. The Composer answers with a coverage-closed change set:
new cards, registry entries, and edits to existing cards' check lists. `board.mjs` accepts it only
if coverage passes afterwards. A refused change set is posted as `REJECTED`, and the Composer tries
again the next round, which is a cadence, not a cap.

**Retiring and returning.** An expert with no routed items, frozen ones included, for
`retire_after` rounds retires, but only if coverage passes without it. Otherwise it stays on as a
checker that gets only rule 2 items. `REACTIVATE` brings a retired card back with its history
whenever routing has items for it again, for example after a verdict reopens its work.

The model's own bias, shared by every persona, can't be covered by any persona. The ballots and the
shared-premise check handle it (§8).

## 8. Phases and decisions

```
charter ──▶ diverge ──▶ converge ──▶ integrate ──▶ verify ──▶ report ──▶ closed by the user
              ▲   │         ▲                         │          │
              └───┘         └───── reopened shards ───┴──────────┘
```

Phase is per shard. The run's phase is the earliest phase of any open shard. The chair moves a
shard with `PHASE{shard, from, to, reason}`, judged from that shard's computed metrics: new admitted
`Q` per round, the ratio of new to open `Q`, backlog (routed items not yet addressed), and open
load-bearing items. With no thresholds set, moving on is a recorded judgment; a threshold set as a
parameter turns it into a computed gate.

| Phase | What happens in a shard | Leaves when |
|---|---|---|
| Charter | the main session interviews the user; the Composer writes root `Q`s, the registry and the first roster | coverage passes and the user approves the charter and plan card |
| Diverge | experts raise questions and proposals; the warden admits or parks; the chair requests spawns for gaps; terms get pinned first | the chair moves it: new questions have dried up relative to open ones and the backlog is shrinking |
| Converge | only blocking `Q`s are admitted, each naming the open `Q` or `X` it blocks (checked by `board.mjs`); the decider proposes `DECIDE` on ripe `Q`s | every admitted `Q` has an `X`, and nothing load-bearing is open. A shard with an open escalation waits |
| Integrate | the shard's critic, then one cross-shard pass, look for conflicts and seams. In v1 each conflict becomes an escalation (§16) | one pass |
| Verify | each load-bearing `F` goes to a checker of its author's bias; ballots go to the experts who touched each decision's `Q` plus its bias checkers; batched as one call per expert | done; a refuted fact or a low ballot reopens the decision into converge |
| Report | one reporter per shard, then one assembly call, write `report/<version>.md` | — |

The run ends only when the user posts `CLOSE`. A verdict that arrives after a report reopens the
shards it touches into converge, and the next report is a new version.

**Decisions.** The decider proposes `DECIDE(Q, P, state)`. `board.mjs` accepts it only if `Q` is
ripe and, for `settled`, every toucher holds `P`. A verdict's `SETTLE` effect closes a `Q` directly
and skips these preconditions. The states:

- `settled`: there was a clash, and every toucher holds the same proposal.
- `by evidence`: the remaining disagreement set a checked fact against an inference or an
  assumption, and the fact won.
- `forked`: a real crux, with what would decide it; escalated to the user at once.
- `parked`: out of scope or below the line; listed in the report.

A ballot with low confidence, or a doubt nobody rebutted, downgrades `settled` to `forked`. A
premise every camp relied on and nobody challenged is listed in the report as untested. A verifier
that can't reach a source returns `UNVERIFIABLE`, and the claim is downgraded to `I`.

## 9. The user in the loop

The user is a participant, not a final reviewer. A verdict can land at any moment and change the
whole discussion.

**Escalation.** Any agent can post `ESCALATE` on an item with a question for the user: a fork, a
product or taste call, a gap the Composer can't close, a scope doubt. A `TURN-MISSING` raises one
automatically, since a turn that keeps failing (a denied grant, say) is the user's to fix. The chair
triages each round: it drops duplicates, and it may decline an escalation that isn't the user's call,
posting `REJECTED` with a reason. Declined escalations still appear in the round status, so the user
sees everything that was raised. An escalated item and its subtree are frozen; the rest of the
board keeps moving.

**The inbox.** The main session puts each new escalation to the user as soon as a round's status
shows it, and launches the next round without waiting. The user can answer, or speak up unprompted
about anything. The main session writes each verdict to `inbox/` through `board.mjs post`, which
issues a sequence number. The inbox lives outside the graph and is never rolled back.

**Claiming and compiling.** Every segment opens with `board.mjs claim`, which moves unclaimed inbox
entries into that round's user stage in order. Then the verdict compiler turns each verdict's words
into typed `EFFECT`s on ids, using the rendered item index:

| Effect | Does |
|---|---|
| `SETTLE(Q, P)` | closes a fork or an escalated `Q` with the user's choice |
| `CHARTER(...)` | amends goals, scope or out-of-scope areas; constraints on future work go here, so wardens see them |
| `REOPEN(X)`, `PARK(Q)`, `ADMIT(Q)` | reopens a decision, parks or re-admits a question |
| `PRIORITY(goal, weight)` | shifts routing priority toward or away from a goal |
| `PARAM(name, value)` | sets or clears a limit (§6) |

When the mapping from words to ids is ambiguous, the compiler escalates a clarifying question
instead of guessing, and the verdict waits. A verdict outranks every other item: it can't be
objected to, only built on. `board.mjs` flags every decision whose support path an effect touches,
and the shard's decider reopens or confirms each one that round. Routing rule 0 sends each affected
item to its owners and touchers.

**Taking effect at once.** If the user wants a verdict to land mid-round, the main session stops the
running segment and launches round R again with `segment open --resume R`. That rolls the graph
back to the commit that closed round R−1 and bumps the epoch, so any write the stopped segment still
had in flight is refused. The relaunch claims the verdict, and the board head in every prompt has
changed, so no cached call from the stopped attempt replays (§10).

**Quiescence.** When a round is quiescent (nothing new, nothing routable, usually because everything
left is frozen behind escalations), the status says so, and the main session stops launching rounds
until a verdict arrives or the user says go.

## 10. A round, end to end

```
relay   segment open (epoch) → claim inbox → status            ┐ user stage
compiler  verdicts → EFFECTs → relay appends                   ┘
relay   write reading sets
experts (parallel) → script stamps authors → relay appends
relay   write shard inputs
wardens (one per shard, parallel) → relay appends
deciders (one per shard, parallel) → relay appends
librarians (one per out-of-band node, only when any) → relay appends
curators (one per changed topic or hub, parallel) → relay appends
chair   phase moves, spawn requests, escalation triage → relay appends → status
```

Each relay append validates the events, logs them, patches the graph, and commits the stage.

**The relay path is checked both ways.** Outbound: the script base64-encodes each batch (plain JS),
chunks it below the measured command-line limit, and computes an FNV-1a checksum over the UTF-8
bytes of the compact JSON. The relay runs `board.mjs append --b64 <chunk> --expect <fnv> --epoch
<e>`, and `board.mjs` decodes, verifies, appends and prints the status after the append, all in one
call. Inbound: the status JSON carries its own FNV-1a checksum, which the script recomputes. A
mismatch either way is retried once, then recorded as `TURN-MISSING`.

**The board head is in every prompt.** It's the graph's commit id after the latest append. Workflow's
cache is keyed on prompts, so any change to the board invalidates every later cached call, while
relaunching an unchanged board still resumes cheaply. The files are authoritative; the cache is
only a speed-up.

**Failures.** An agent call that fails or returns nothing is retried once, then recorded as
`TURN-MISSING`, which raises an escalation. Its owed replies stay on its docket.

## 11. Why there's no single orchestrator

The concern was that one orchestrator can't hold the swarm in its head. The design never asks it to.

- Control flow is code: the scheduler script runs one round, from a stage table in the bundle.
- State is the graph; routing, predicates, coverage, metrics and gates are functions in `board.mjs`
  over its index.
- Judgment is split by kind (compiler, Composer, chair, warden, decider, critic, reporter) and by
  shard. Each call gets computed lists or a rendered view and answers a fixed schema.
- The chair keeps only cross-shard calls, judged from computed tables, never a model-written digest.
- No board data passes through a model unchecked on its way between `board.mjs` and the script.

## 12. Guardrails against digression

- **The charter is the anchor**: goals, in-scope and out-of-scope areas, the questions a finished
  solution must answer. It changes only through `CHARTER` events, including those compiled from
  verdicts.
- **Relevance chain**: the warden sees each new `Q` with its whole parent chain and admits it only if
  the chain reaches a charter goal. It records the reason.
- **Parking lot**: parked questions are kept and listed in the report as further work. Parking loses
  nothing, so the warden can afford to be strict. The user re-admits by verdict.
- **Converge admits only blocking questions**, each naming an open target that `board.mjs` checks.
- **The user** redirects or narrows the swarm at any time, and `PRIORITY` effects steer routing.
- **Depth and quota limits** exist as unset parameters (§6) for when runs show they're needed.

## 13. What may go wrong

| # | Failure | Answer |
|---|---|---|
| 1 | Every agent reads everything | experts read one rendered docket; judges read one shard (§3, §5) |
| 2 | Posting outruns reading | backlog is measured per shard every round; quotas are parameters with built behaviour (§6) |
| 3 | Topology explosion | a spawn must name a computed gap and close coverage (§7) |
| 4 | Roster churn as each bias demands checkers | coverage-closed change sets; refused sets retried next round; an unclosable gap is escalated (§7) |
| 5 | Divergence never ends | per-shard phase moves from metrics; converge admits only blocking `Q`s; the user can redirect (§8, §9) |
| 6 | Premature convergence among same-model agents | two-direction coverage, push back before concede, routed ballots, `DECIDE` on ripe questions only (§7, §8) |
| 7 | Stalemate between two agents | provenance decides where it can; otherwise a fork, escalated |
| 8 | Nobody closes a question | the shard's decider proposes `DECIDE` on every ripe `Q` (§8) |
| 9 | Digression | charter, relevance chain, parking lot, blocking rules, verdicts (§12) |
| 10 | The orchestrator can't hold the swarm | script, `board.mjs`, judges split by kind and shard (§11) |
| 11 | A model distorts data between `board.mjs` and the script | rendered files for experts; checksums both ways on the relay (§5, §10) |
| 12 | A forged event (another agent's name, a fake decision) | the script stamps authors; `board.mjs` checks them against the stage roster; only the relay can run `board.mjs` (§3, §15) |
| 13 | Citation laundering | `F` needs an external source; board-built claims inherit the weakest provenance (§4) |
| 14 | Equivocation | `D` items and `terms` lists; a `Q` using a contested term isn't ripe (§4) |
| 15 | Torn or duplicated state | single writer, atomic files, log written before the graph, a commit per stage, epochs, rollback to the last round's commit (§4) |
| 16 | A verdict lost to a rollback or overwritten by another | the inbox: outside the graph, sequenced, never rolled back, claimed in order (§9) |
| 17 | A verdict half-applied within a round | verdicts enter only at a round's user stage; stop-and-relaunch for immediate effect (§9) |
| 18 | A cached call replays a pre-verdict answer | the board head in every prompt (§10) |
| 19 | A stopped segment writes after a rollback | epochs (§4) |
| 20 | A verdict's words don't reach the agents who must act | the compiler turns it into typed effects on ids; routing rule 0 (§5, §9) |
| 21 | A late verdict invalidates settled work | flagged decisions reopened or confirmed by the shard's decider; reports are versions; the run ends only at `CLOSE` (§8, §9) |
| 22 | Empty rounds burn calls while the user is away | quiescence stops launching (§9) |
| 23 | Experts needed by a pending verdict get retired | frozen items count as routed; `REACTIVATE` (§7) |
| 24 | A turn keeps failing | retry once, then `TURN-MISSING`, which escalates (§10) |
| 25 | A command line too long, or mangled by quoting | base64 chunks below the measured limit, checksummed (§10) |
| 26 | Implementers define predicates differently | the predicates table, computed and tested in `board.mjs` (§4) |
| 27 | New facets never trigger a spawn | `NEW` facets, `FACET-GAP` on admission (§7) |
| 28 | Coverage passes while every checker pulls the same way | directions as registry ids; two distinct directions required (§7) |
| 29 | Ballots read the whole board, and strangers fork decisions | ballots routed to touchers and bias checkers (§8) |
| 30 | Integration seams | per-shard and cross-shard critics (§8) |
| 31 | Injected instructions in code or web content | experts are read-only; only the relay runs the store's `board.mjs` (§15) |
| 32 | The report invents consensus | every statement cites ids; forks, parked items and untested premises get their own sections |
| 33 | Persona drift | the card and position summary go out every turn |
| 34 | Cost blowup | spend shown every round; budgets are parameters (§6, §14) |
| 35 | A first tuning is an untested code change | every parameter's binding behaviour is built and tested now (§6) |
| 36 | Unreviewed code runs in a probe | the bundle store is user-approved; probes run only installed bundles (§15, §16) |
| 37 | Self-improvement optimises a metric instead of usefulness | probes score escalation recall and verdict absorption; the user approves every adoption (§16) |
| 38 | A new agent is buried in history, or misses what matters | it starts from topic summaries that are checked to link everything load-bearing, and follows links on demand (§4, §5) |
| 39 | A summary drifts from the board | summaries are rewritten when their topic changes, checked on landing, and show their age (§4) |
| 40 | The graph grows into fat hubs, one-line files and long paths | size bands with split and merge, inline small items, shelved history, a health report every round (§4) |
| 41 | Reorganising breaks links or rewrites arguments | navigation is a separate layer; one flat folder by id; `RESTRUCTURE` is checked for reachability and link integrity (§4) |

## 14. Cost and measurement

```
calls per round ≈ E experts + S wardens + S deciders + 1 chair
                + (1 compiler when the inbox has verdicts)
                + relay calls (one per stage boundary, about 6)
plus: composer per spawn, integrate (S + 1), verify (one batched call per expert), report (S + 1)
```

`E` is active experts and `S` is open shards. With no limits there's no estimate up front.
`board.mjs cost` reports calls and tokens per round and per role in every round's status, and the
main session shows the running total. Whether agent() exposes token usage to the script is a spike
item; if it doesn't, the report counts calls and estimates tokens from rendered input sizes.
Workflow caps a run at 1000 agent calls, and a segment is one round, so the cap never binds.

## 15. Runtime, permissions and the bundle store

- **Packaging**: its own plugin, `think-tank`, in the vanillafairy marketplace. socratic stays
  untouched. think-tank carries its own copy of the move-tag protocol until a shared file lands
  (§17).
- **Workflow** runs each segment. A skill whose instructions call Workflow counts as the user's
  opt-in. A run's total call count is far above the session's default workflow size guideline, and
  the plan card says so.
- **The bundle store.** A procedure bundle (scheduler script, `board.mjs`, role prompts, stage
  table, schemas) lives at `~/.think-tank/bundles/<hash>/`. Installing a bundle there is a step the
  user approves. A run records the hash, and the main session loads the script, prompts and
  `board.mjs` from that directory after verifying the hash. Plugin updates install a new bundle;
  they never change a running one.
- **Permissions.** Only the relay runs anything, and its rules name the subcommands:
  `Bash(node ~/.think-tank/bundles/*/board.mjs append:*)`, and the same for `status`, `render`,
  `claim`, `segment`, `cost`. The main session runs `post`. No agent gets `Edit` or `Write`.
- **Tool grants per role** live in the bundle. Experts whose lens needs sources get Read or WebFetch
  through their card; verifiers get the grants their claims need. A missing grant surfaces as
  `UNVERIFIABLE` or `TURN-MISSING`, never as a silent pass.
- What agents read is data. Instructions found in it carry no authority.

## 16. Built to improve itself

Improvement is **guided, not automatic** (foundation 12). The user starts it, as an ordinary
think-tank run whose charter is "here is the plugin's code, here is the transcript of a real run:
find the issues and work on improvements". The swarm reads both like any other source, and the
user rules on its escalations as in any run. Its output is a proposed change to the plugin, which
the user reviews and lands like any other change.

What a run leaves behind for such a session:

- the event log, including every `VERDICT` and its effects: the record of what the user ruled and
  why;
- `board.mjs retro`, a retrospective computed from the log on demand (phase lengths, items by type,
  spawns, retirements, rejections, decision states, refuted facts, calls and tokens);
- the graph itself, readable as it stood at any round through its commits.

A run never edits the plugin that's running it, and no improvement is adopted without the user.
Probes, benchmarks and automated scoring are not built; if guided sessions later show a need for
them, they come in as a new mechanism like any other.

## 17. v1 scope

Build order: the spike first (§18), then the smallest seed. Everything else in this doc is built
only when a real run hits the failure it prevents.

The seed:

- the knowledge graph as linked `.md` nodes, with role frontmatter and typed links (§4);
- the registry of facets, lenses, biases and directions, with the two-direction coverage check (§7);
- roles spawned on demand, both at the start and during the run, including the roles that organise
  the discussion (foundations 5 and 7);
- the question and proposal split, provenance tags, pinned terms (§4);
- the main session running one round at a time, putting escalations to the user and posting
  verdicts as they come (§9);
- an append-only log of every change (§4).

Deferred, each with its trigger:

| Deferred | Built when |
|---|---|
| Integrate loop back into converge | the user rules that an escalated conflict should have been resolved by the swarm |
| Merging duplicate items | rival duplicates make dockets noticeably noisy in a real run |
| Relevance appeals by experts | the user re-admits parked questions often enough to show the warden is too strict |
| Self-improvement harness (§16) | a handful of runs with verdicts exist |
| Shared protocol file with socratic | both skills' protocol text has been stable for a few runs |

## 18. The spike

Before anything else is built, one small test settles feasibility. If any answer is no, the runtime
sections change before the build starts.

1. A workflow agent runs `node ~/.think-tank/bundles/<hash>/board.mjs <subcommand>` under the
   subcommand-named rules, in the background, with no prompt; an agent without the rules can't.
2. The relay's round trip holds in both directions: the largest realistic batch, with Cyrillic text,
   base64-chunked, through the shell this host uses, with checksums matching.
3. The command-line limit on this host is measured, and the chunk size is set from it.
4. The main session can launch a one-round segment and keep talking to the user while it runs.
5. Stopping a segment while an append is in flight, then relaunching with `--resume`: the stale
   write is refused by its epoch, and the relaunch replays nothing cached from the stopped attempt.
6. Whether agent() exposes token usage to the script.
7. The graph as a git repository on this host: a commit per stage, a rollback to a round's commit,
   and line endings kept as written (the repository sets `core.autocrlf=false` locally, since this
   machine's global setting converts them).

## 19. User rulings

- Packaging: its own plugin.
- Build order: the spike first.
- No limits in v1. The user adds them after seeing what a run eats; swarm behaviour comes first,
  tuning next.
- Verdicts are taken whenever something is escalated. They can affect the whole discussion at any
  moment, so they can't wait for the end.
- The canvas is a knowledge graph kept as linked `.md` files: each topic has its own file with the
  latest summary, linked to past theories (considered, rejected, improved on), so latest and
  history share one topology. Frontmatter and link descriptions identify each node's and each
  link's role.
- The graph is the state, readable directly by agents and by a person. Rendering it from the event
  log is too expensive, even scripted. The event log is the ultimate audit trail: it complements
  the graph, it doesn't supersede it.
- The graph will grow fast and wide; it must stay balanced (no file too big or too small) and
  navigable.
- Self-improvement isn't automatic for now. It's guided iterations: "here is your plugin's code,
  here is the transcript of the real run, find issues and work on improvements", passed to the
  plugin's swarm itself.
- The skill implies proper decomposition of the problem across agents, initial and dynamic during
  the run, so it needs agent roles for this, all spawned on demand.
- The plugin is driven by a narrow, concise set of foundational rules. The implementation is a
  cascade of how the foundations map onto the agentic execution layer. The foundations define the
  theoretical topology of the thinking matter and are never about how it's implemented.
- This doc is a map, not a build list: the first build is the smallest seed, and each further
  mechanism is built when a real run hits the failure it prevents.

## 20. Open questions

Gaps found by walking 50 practical run scenarios against this text. Each one is to be handled
separately. Most important first.

1. **What an expert knows beyond its routed items.** *Answered by the knowledge graph (§4) and
   reading sets (§5), and kept in shape by the balance band (§4).* Still open: whether curators
   run every round or only when a dirty topic is about to be read.
2. **How escalations reach the user, and how they leave.** After an hour away the user finds 7
   escalations with no defined order, grouping or context. In diverge the chair may let 22
   through, because its "not the user's call" test is never defined. An escalation that a sibling
   decision made moot stays open and keeps its subtree frozen. Undecided: the chair's test, how
   escalations are batched and presented with enough context to rule on, and who withdraws an
   overtaken one and tells the user "never mind".
3. **Failures beyond one bad turn.** A rate limit turns every call into a `TURN-MISSING`
   escalation, flooding the user instead of being recognised as one outage. A bug in applying events at round 30
   has no recovery path, because the bundle is pinned. After a crash it's unclear who picks the
   resume point and whether appended turns are paid again. Undecided: outage and crash handling,
   whether a run may move to a fixed bundle and what happens to past `DECIDE`s the old code
   accepted, and whether upcasters are tested against real recorded runs.
4. **Picking a run back up, and running several.** A fresh session in another directory, or on
   another machine, has no command that finds a run and no procedure to rebuild pending
   escalations and recent verdicts. An abandoned run without `CLOSE` stays open and unlisted.
   Undecided: what the main session must keep through auto-compaction and what it re-reads, a
   find-and-resume entry point, a cheap close-and-render, portability between operating systems,
   and what ties a verdict to the right run when two run at once.
5. **Dependencies and conflicts between shards.** Shard A can't close until B picks a wire format
   while B waits on A, and nothing detects the deadlock. Shard B can decide against A after A has
   reported, and the cross-shard pass has no defined timing when shards reach integrate at
   different moments. Undecided: whether a blocking `Q` may target another shard, how a mutual
   wait is broken, and when the cross-shard pass runs or reruns.
6. **Changing shard structure mid-run.** A 15-item subtree that belongs under "sync" can't be moved
   there. Changing `shard_by` from 4 shards to 13 orphans phase events and metrics keyed on the old
   shards. A verdict that adds a goal needs a root `Q`, but the Composer writes those only at
   charter time. Undecided: how phase and ownership carry across a re-shard, who writes a mid-run
   root `Q` and which phase its shard starts in, and what signals that a shard is too big for one
   judge call. (Moving a topic for *reading* is now a navigation re-file, §4. Whether shards should
   follow the navigation layer or the argument tree is part of this question.)
7. **Scope cuts and facts the user supplies.** "Forget multi-region" amends the charter, but the 30
   admitted questions and 7 decisions under it aren't re-reviewed, and nobody confirms the cut list
   with the user. "Our CI runs on Windows only" is information, not a ruling, and there's no
   provenance type for a fact the user supplies. Undecided: how a charter cut propagates to
   existing work and the report, and how user-supplied facts enter the board.
8. **Verdict compilation at scale.** "Go with the simpler one" needs to know which escalation it
   answers, and no such link is defined. "Reopen the auth thing" must be found among 2,500 indexed
   items with Grep, and "ambiguous" isn't defined. Undecided: verdict-to-escalation linkage, the
   item index's format and size, and when the compiler asks instead of acting.
9. **One fact, one term, one source across shards.** The same fact can be verified twice in two
   shards without anyone noticing. "Session" can be ratified with two meanings in two shards. A
   blog post counts as an `F` source, and a page that changed after it was read isn't snapshotted.
   Undecided: whether definitions and verified facts are global, how duplicates and collisions are
   detected, and who judges source quality. (Snapshots are now `source` nodes, §4, which any claim
   can link.)
10. **The report as a document someone reads.** 140 decisions over 6 shards, with 30 parked items
    and 12 forks, have no defined shape, summary or reading order. A citation like
    `[3.experts-storage-2]` doesn't resolve to anything a person can read. Report v3 has no diff
    from v2. Undecided: the report's structure, how versions are diffed and whether unchanged
    sections are reused, and whether a follow-up run can be seeded from this board. (Citations can
    now be links into `graph/`, §4, which a person can open and walk.)
11. **Where experts work and what they may read.** A run started in project X about repo Y has no
    stated working directory, the charter has no place to name codebases, and Read grants aren't
    scoped to paths. Undecided: how a run names its codebases and how grants are confined to them.
12. **Cost forecasting.** The plan card has no estimate, and the cost report gives calls and tokens
    but no money figure. At round 12 the user can't learn how much more the run will cost, though
    phase and backlog per shard are already computed. Undecided: whether and when a forecast is
    produced, and whether money is reported.
13. **What each role may emit, and how injection is tested.** Authors are stamped and checked
    against the stage roster, but nothing bars an expert from returning `DECIDE`, `EFFECT` or
    `VERDICT`. An `ESCALATE` written by a fetched page reaches the user as a real escalation.
    Undecided: a per-role list of allowed event types, and an injection test.
14. **The charter's minimum, and reviewing the registry.** "Make our deploys less painful" has no
    defined interview length or minimum charter. In a domain the model knows poorly, nothing checks
    that the Composer's lenses and biases are real, and the user may not see or be able to edit the
    registry before round 1. Undecided: the minimum charter, what the plan card shows, and whether
    the registry can be edited by verdict.
15. **An expert that can't or shouldn't answer.** There's no abstain or hand-off move, so an item
    outside an expert's knowledge sits in its backlog or gets rerouted by rule 4, possibly forever.
    Undecided: an abstain or hand-off move, and what stops endless rerouting.
16. **Graph write performance.** *Mostly answered: the graph is patched in place, so a change costs
    the files it touches (§4).* Still open: how the git repository behaves at thousands of commits
    and nodes, and whether old commits ever need squashing.
17. **Testing the skill, and grading self-improvement.** There's no fake-agent or recorded-response
    harness and no toy problem with a known expected board, so a full run with a mid-round verdict
    and a resume can only be tested live. An "improve think-tank" run's own verdicts could become
    the ground truth that grades its patch. Undecided: an offline end-to-end harness, which bundle
    an improvement run uses, and whether its own verdicts are excluded from its probes.
