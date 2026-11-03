# think-tank 1.0 — design

Status: approved design, not yet built. The rules this design serves are in
[2026-11-03-think-tank-foundations.md](2026-11-03-think-tank-foundations.md); each mechanism names
the foundations it serves (F1–F11).

**Balance.** Judgment and dynamics live in the role prompts, where a model handles them well.
Scripts do only what models do badly: create a run, check the graph mechanically, find cycles and
blocked topics, keep the index, and commit. A script never decides who reads what, whether a
question is relevant, or whether two questions are the same.

## 1. What it is

`/think-tank <problem>` produces a multi-faceted solution by running agent roles that argue on a
shared knowledge graph, with the user ruling whenever something is theirs to decide. It targets
problems at the complexity of a real feature plan in a mid-sized codebase: tens of topics, a
handful to a dozen expert lenses. A question one good answer settles goes to `/socratic` instead,
and the skill says so before starting. It ships as its own plugin, `think-tank`, in the
vanillafairy marketplace.

There are no rounds. Every topic runs at its own pace: its moderator casts experts for it, they
argue peer to peer through per-agent inboxes, and the topic closes when the framework's formal
rules say so. Topics form one graph in which a topic can be needed by several others.

## 2. Roles (F5, F7)

Each role holds one kind of work.

| Kind of work | Role | Lifetime |
|---|---|---|
| Arguing | Expert, one instance per topic | spawned by its topic's moderator; released when the topic closes |
| Judging by formal rule | Moderator, one per topic, with `tt.mjs` | spawned by the main session (subtopics: at the registrar's request); ends when its topic is complete |
| Casting | Moderator picks from expert cards; the composer writes cards | composer: at the start, and woken when a moderator needs a lens no card has |
| Shaping the topic graph | Registrar, with `tt.mjs` | one per run, kept warm |
| Reporting | Reporter | once, at the end |
| Lifetimes and the user | the main session | the whole run |

- **Expert.** Argues on one topic: raises questions, proposes, claims, objects, verifies, answers,
  holds a position, names a crux, marks a question as the user's. It messages opponents directly.
  Its card (`e-<key>`) is a template; the instance on a topic is `<key>@<topic>`, and a lens
  needed on two topics runs as two instances with separate contexts (F6). An instance learns what
  it argued elsewhere only by following graph links.
- **Moderator.** Never weighs substance: it lacks the expertise and the distance for that. It picks
  a cast for its topic from the cards so that every expert's biases are checked by at least two
  others from different directions (F4), spawns them, routes context slices to them, applies the
  closing rules (§5) to what the experts record, asks the registrar for subtopics, writes the
  topic's "where it stands" summary, and tells the topics that need it when it completes.
- **Registrar.** The only creator of topics after the roots. It judges whether a new question is
  relevant to the purpose (F1) and whether it is the same question as an existing topic. It adds
  needs-edges, merges duplicates and repairs cycles (§4), and asks the main session to start a
  moderator for each topic it creates. These calls are about meaning, which needs a model. It never
  spawns: a spawn blocks a subagent until the child's first run ends, and a moderator's first run
  includes its cast's, which would stall every other request queued at the registrar.
- **Composer.** Decomposes the charter into root topics and writes expert cards: title, lens,
  facets, biases by their established names, the debiasing counters, and which lenses check whose
  biases from which direction. Bias knowledge comes from the model (F4); none of it is written
  into the plugin.
- **Reporter.** Reads the completed graph and returns the report in its hand-back.
- **Main session.** Drives and judges nothing: it spawns the composer, the registrar, the root
  moderators and every moderator the registrar asks for, runs `tt.mjs graph` after each hand-back, wakes the registrar on a cycle, puts every
  escalation to the user at once, records verdicts and messages the affected moderator, and saves
  the report.

## 3. What the harness provides

The design rests on how Claude Code runs subagents:

- `SendMessage({to: "<name>"})` is a per-agent inbox. A running agent receives a message at its
  next tool round; a finished agent is resumed from its transcript with its context. A wake costs
  only the new turn, while a fresh spawn pays the whole fixed context, so agents are kept warm and
  woken rather than respawned.
- An agent acts on a peer's request only when its spawn brief names that peer and authorizes it.
  Every brief carries the topic's roster and that authorization.
- Every run and every wake ends with a `SubagentHandback`. A first run's hand-back goes to the
  spawner; a hand-back after a wake goes to the main session. So nothing another agent needs
  travels by hand-back: it travels by `SendMessage`. Hand-backs are one line.
- Inside a subagent an `Agent` call blocks until the child's first run hands back; several calls in
  one message run in parallel. A moderator therefore spawns its whole cast in one message.
- At most 20 subagents run at once. A spawn refused for the cap is retried when an agent finishes.
- A subagent can be refused when it writes a report file, so the reporter hands its report back
  and the main session saves it.

## 4. The topic graph (F1, F6, F8)

**Edges.** A topic `needs` the topics whose outcomes it depends on. Splitting a wide topic creates
needs-edges to the new subtopics; a topic may be needed by any number of others. The registrar
adds two more links, each keeping both sides' history: `duplicate_of` when it merges two topics
that are one question, and `extracted_from` when it breaks a cycle.

**Completeness.** A topic is complete when:

1. its own discussion has closed with an outcome: `decided` (consensus after a clash), `crux`
   (rivals still standing, the crux named with what would decide it), `ruled` (the user answered its
   escalation) or `set-aside` (judged irrelevant to the purpose); and
2. every topic it needs is complete; and
3. its summary was written after those dependencies completed, on their final outcomes.

A topic that closes on a crux is complete: a named crux with what would decide it is an actionable
end (F10), and it doesn't block its needers.

**Reopening.** When a topic reopens (a verdict, or a refuted fact under its outcome), every topic
that needs it, directly or through others, reopens too. `tt.mjs graph` lists them, and the main
session wakes their moderators.

**Cycles.** `tt.mjs graph` finds them as strongly connected components. The registrar repairs each:
it merges the topics if they are one question, or extracts their shared crux into a new topic they
both need. Until it does, the topics in the cycle stay blocked.

**Asking for a subtopic.** A moderator messages the registrar: "q-x needs: <question>". The
registrar links an existing topic, or creates one and asks the main session to start its moderator,
then answers. The asking
topic is blocked on that edge and carries on with whatever else it can.

## 5. Messages and the closing rules (F2, F10, F11)

**A message** points at the graph; the substance is in the nodes. Its first line reads on its own:

```
[tt] q-save-3: object to p-quest-3
from: save@q-save-3   reply-to: quest@q-save-3   ask: answer
nodes: c-save-12, p-quest-3
```

The ask is one of: `object`, `answer`, `verify`, `position`, `crux`, `escalate`. Every expert wake
ends with a commit, then a one-line notice to its topic's moderator naming the nodes it wrote and
whom it is waiting on, then a one-line hand-back.

**Positions.** Each expert instance keeps one `position` node for its topic: the proposal it holds
(or none) and whether it is `arguing`, `holding` or `agreeing`. The closing rules read these.

**The rules.** On each notice the moderator runs `tt.mjs check --topic` and acts on what it reports:

| Rule | Holds when | Outcome | Checked by |
|---|---|---|---|
| Consensus | every position names the same proposal; it survived at least one objection that was answered; no open objection and no unanswered ask; every `F` claim under it verified; every ballot confident, with no unanswered doubt | `decided` | script |
| Crux | positions differ, each rival survived a clash, everyone holds, and a `crux` node naming what would decide it is acknowledged by both sides | `crux` | script |
| Stall | everyone holds and nothing new since the last notice, with no agreed crux | the moderator asks both sides to write the crux | script |
| Loop | an objection already answered comes back unchanged or reworded | the moderator points its author at the answer; a second time is a stall | script for exact repeats; rewording by the moderator's model |
| Cap | an expert reaches its wake budget on the topic (charter setting, default 6) | `crux`, never `decided` | script |
| Escalate | an expert marks a question as taste, priority or purpose | put to the user; `ruled` once a verdict addresses it | script |
| Set aside | the registrar judges a new question irrelevant to the purpose, and keeps it | `set-aside` | registrar |

**Ballots.** On consensus each expert files a `ballot` node with its confidence (1–10) and its
strongest remaining doubt. A confidence of 5 or less, or a doubt no claim answers, means the
agreement was social rather than earned, and the topic goes back to arguing with the doubt as an
objection. Experts of one model share blind spots; the ballot is where those show.

**Verdicts** outrank everything (F11). The main session records the user's words as a verdict and
messages the moderator of every topic it addresses; the moderator applies it on its next wake.

## 6. Files and concurrency (F8, F9)

```
~/.think-tank/runs/<YYYY-MM-DD>-<slug>/
  procedure/        FOUNDATIONS.md and the role files, copied at init
  graph/            the knowledge graph: one flat folder of <id>.md, a git repository
  index.md          written by tt.mjs on every commit: every node, one line each, by topic
  report.md         saved by the main session from the reporter's hand-back
```

The graph is the state, read directly by agents and people. **The audit trail is the graph's git
history**: one commit per wake, its message naming the agent and its one-line report. It's never
rewritten.

**Nodes.** One Markdown file per node: YAML frontmatter, a title, a body, and a `Links` section of
lines `- <edge>: [title](<id>.md)`. Every node carries `author` (the agent, e.g. `save@q-save-3`)
and `seq`, a run-wide counter `tt.mjs` hands out under a lock.

| `role` | Id | Key frontmatter |
|---|---|---|
| `charter` | `charter` | purpose, in_scope, out_of_scope, sources, cap |
| `topic` | `q-<author>-<n>` | root (true on roots), facet, needs, status (open, blocked, complete), outcome (decided, crux, ruled, set-aside), decided_as, duplicate_of, extracted_from |
| `proposal` | `p-<author>-<n>` | answers, refines |
| `claim` | `c-<author>-<n>` | target, stance (pro, con, ask, reply), provenance (F, I, A), source, verified, status (open, conceded) |
| `position` | `pos-<key>-<topic>` | topic, holds, state (arguing, holding, agreeing) |
| `crux` | `x-<author>-<n>` | topic, between (proposals), decided_by, acknowledged_by |
| `ballot` | `b-<key>-<topic>` | topic, confidence, doubt |
| `term` | `d-<author>-<n>` | status (proposed, ratified, contested) |
| `expert` | `e-<key>` | title, lens, facets, biases, counters, checks (`"<key>: <direction>"`) |
| `verdict` | `v-<n>` | addresses |

Any node may carry `escalation: "<question>"`. It's open until a verdict addresses that node.

**Ownership** keeps concurrent writers apart. An agent creates only nodes with its own id prefix. A
moderator edits only its topic's frontmatter and summary; the registrar edits only `needs`,
`duplicate_of` and `extracted_from`. No two agents ever edit one file.

**Commits.** Agents write at the same time, so `tt.mjs commit` is the only path to git. It takes a
lock (an atomic `mkdir`, retried), stages only the caller's files, commits, and rewrites
`index.md`.

## 7. A run

1. **Charter.** The main session asks the user for the purpose, the scope and the sources experts
   may read, writes them to a JSON file, and runs `tt.mjs init`.
2. **Compose.** The composer writes root topics and expert cards. `tt.mjs check` reports whether the
   cards can cover each root: every lens checkable from two directions.
3. **Plan card.** The main session shows the roots and the cards, and starts on the user's go.
   Changes go in as verdicts, which the composer applies.
4. **Run.** The main session spawns the registrar and one moderator per root. Topics open, split,
   argue and complete on their own; the main session spawns each moderator the registrar asks for.
   After each hand-back the main session runs `tt.mjs graph`,
   wakes the registrar for a cycle and moderators for reopened topics, and puts any new escalation
   to the user as a plain question at once, without stopping the run.
5. **End.** When every root is complete and nothing is escalated, the reporter writes the report,
   and the main session saves it as `report.md`. If nothing is running and a root is still not
   complete, the main session asks the user whether to stop, redirect or go on.

## 8. The script

`skills/think-tank/scripts/tt.mjs`, Node, no dependencies:

| Command | Does |
|---|---|
| `init <run> --charter <file>` | creates the run, copies the procedure, writes `charter`, initialises git |
| `seq <run>` | hands out the next run-wide sequence number |
| `commit <run> --as <agent> --message <m> <files>` | commits the caller's files under the lock and rewrites `index.md` |
| `check <run> --topic <id>` | the topic's rule states (§5), coverage of its cast, problems in its nodes, what blocks it and which topics need it |
| `graph <run>` | cycles, blocked and newly unblocked topics, topics to reopen, open escalations, whether the run is done |
| `verdict <run> --text <t> --addresses <ids>` | writes a verdict node |

`check` and `graph` report; they never block or rewrite. A problem goes to the role that owns the
node, on its next wake.

## 9. The plugin

```
think-tank/
  .claude-plugin/plugin.json
  README.md
  skills/think-tank/
    SKILL.md            the main session's steps
    FOUNDATIONS.md
    roles/              composer.md, registrar.md, moderator.md, expert.md, reporter.md
    scripts/tt.mjs
  test/tt.test.mjs
```

Permissions the user grants once, because background agents can't answer prompts:
`Read(~/.think-tank/**)` and `Edit(~/.think-tank/**)` (an `Edit` rule covers every file-writing
tool).

## 10. Tests

The script is the only logic with mistakes worth catching:

- each closing rule holds exactly when its conditions do, including consensus failing on an
  unverified `F` claim and on a low-confidence ballot, and the cap yielding `crux`, never `decided`;
- a cycle is reported, and its topics are blocked until it is repaired;
- a topic is blocked until everything it needs is complete, and a completed dependency unblocks
  every needer;
- reopening a topic reopens everything that needs it, transitively;
- two concurrent commits both land, each with only its own files;
- coverage fails with one checker, or two from the same direction;
- the CLI runs when its directory is reached through a junction, and a node with unclosed
  frontmatter is reported.

## 11. Deferred, each with its trigger

| Mechanism | Built when |
|---|---|
| Size bands, hubs, librarians | a real run's topic files or the index get too long to read |
| Validation that rejects writes | a real run is damaged by a malformed node that `check` only reported |
| Run-wide budgets beyond the per-topic cap | the user sees a run eat too much |
| Workflow-driven dispatch | the main session's context fills up during long runs |
| Improving the procedure through a run of itself | think-tank is ready to improve itself: the user hands a run the plugin code and a real run's directory |
