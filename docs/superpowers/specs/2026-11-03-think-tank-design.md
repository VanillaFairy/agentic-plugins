# think-tank v1 — design

Status: approved for build. The rules this design serves are in
[2026-11-03-think-tank-foundations.md](2026-11-03-think-tank-foundations.md); each mechanism names
the foundations it serves (F1–F12). The fuller map of mechanisms considered for later is in this
file's git history (commit `636b1eb`).

**Balance.** Judgment and dynamics live in the role prompts, where a model handles them well.
Scripts do only what models do badly: create a run, check the graph mechanically, keep the index,
and commit. A script never decides who reads what, whether a question is relevant or whether a
proposal stands.

## 1. What v1 is

`/think-tank <problem>` produces a multi-faceted solution by running agent roles that argue on a
shared knowledge graph, with the user ruling whenever something is theirs to decide. v1 targets
problems at the complexity of a real feature plan in a mid-sized codebase: tens of topics, a
handful to a dozen experts, a few to a dozen rounds. A question one good answer settles goes to
`/socratic` instead, and the skill says so before starting. It ships as its own plugin,
`think-tank`, in the vanillafairy marketplace.

## 2. Roles, all spawned on demand (F5, F7)

| Role | Spawned | Does |
|---|---|---|
| Composer | at the start; again when a moderator asks | decomposes the charter into root questions; writes expert cards; fills gaps; releases and recalls experts; writes the first agendas |
| Expert | per round, only if it has an agenda | argues: raises questions, proposes, claims, objects, verifies, takes positions |
| Moderator | per unsettled root topic per round | judges its root's subtree: admits or parks questions, sets proposal standing, decides, names cruxes, escalates, sets the phase, writes the next round's agendas |
| Curator | per topic that changed in the round | rewrites the topic's "where it stands" summary and its links |
| Reporter | once at the end | writes the report |

The main session drives and judges nothing. It follows the skill's steps, spawns roles as
background agents (parallel within a stage), runs `tt.mjs`, shows status, puts escalations to the
user and records verdicts.

**Routing is judgment** (F6). Moderators decide what each expert addresses next round and write it
as an agenda. The composer writes the first round's agendas and a catch-up agenda for any expert it
adds or recalls. An expert reads its agendas, its card and what they link to, and follows links
further only as far as it needs.

**Bias knowledge comes from the model** (F4). The composer names each expert's predictable biases
by their established names from the literature on cognitive and methodological biases, and the
established debiasing counters its checkers should apply. None of it is written into the plugin.

## 3. The knowledge graph (F8, F9)

```
~/.think-tank/runs/<YYYY-MM-DD>-<slug>/
  procedure/        FOUNDATIONS.md and the role files, copied at init
  graph/            the knowledge graph: one flat folder of <id>.md, a git repository
  agenda/<R>/       agendas for round R: <expert>.<from>.md, and _composer.<from>.md for requests
  index.md          written by tt.mjs check: every node, one line each, grouped by root, with backlinks
  report.md
```

The graph is the state, read directly by agents and people. **The audit trail is the graph's git
history**: one commit per stage, its message listing each agent and the one line it reported. It's
never rewritten.

**Nodes.** One Markdown file per node: YAML frontmatter, a title, a body, and a `Links` section of
lines `- <edge>: [title](<id>.md)`, where the edge word names the link's role (`answers`,
`supports`, `objects to`, `refines`, `parent`, `leading`, `rejected`, `checks`, and so on).

| `role` | Id | Key frontmatter |
|---|---|---|
| `charter` | `charter` | purpose, in_scope, out_of_scope, sources |
| `map` | `map` | round |
| `topic` | `q-<author>-<n>` | parent, facet, status (proposed, open, parked, rejected, decided, forked), phase on roots, decided_as |
| `proposal` | `p-<author>-<n>` | answers, standing (open, leading, rival, rejected, superseded, decided), refines |
| `claim` | `c-<author>-<n>` | target, stance (pro, con, ask, reply), provenance (F, I, A), source, verified, status (open, conceded) |
| `term` | `d-<author>-<n>` | status (proposed, ratified, contested) |
| `expert` | `e-<key>` | title, lens, facets, biases, counters, checks (`"<expert>: <direction>"`), status (active, released) |
| `verdict` | `v-<n>` | addresses |

Any node may carry `escalation: "<question>"`. It's open until a verdict addresses that node.

**Ownership** keeps parallel writers apart. An agent creates only nodes with its own id prefix. An
expert edits only its own card (positions, notes). A moderator edits the frontmatter of nodes in its
root. A curator edits only its topic's summary and links. Stages run one after another, so no two
writers touch a file at once.

## 4. Settling (F1, F10, F11)

The moderator's prompt carries the rules, and `tt.mjs check` flags breaches:

- A question is admitted, parked or rejected on relevance only; claims never target a question.
- A proposal is decided only after a clash (a con claim from someone other than its author), with no
  con claim on it still open, and with its supporting `F` claims verified by someone who checks the
  author's bias.
- Two rivals that both survive get a named crux and what would decide it. The user's call is
  escalated; evidence's call becomes a question for the experts.
- A verdict outranks everything; the moderator applies it in its next turn.

## 5. A run

1. **Charter.** The main session asks the user for the purpose, the scope and the sources experts
   may read, writes them to a JSON file, and runs `tt.mjs init`.
2. **Compose.** The composer writes root questions, expert cards and first agendas. `tt.mjs check`
   reports coverage: every active expert's biases checked by at least two others from different
   directions, no two experts sharing a lens. The composer repeats until coverage passes.
3. **Plan card.** The main session shows the roots, the roster and its coverage, and starts on the
   user's go. Changes go in as verdicts, which the composer applies.
4. **Rounds.** `tt.mjs next`; experts with agendas, then commit; `tt.mjs check`; moderators per
   unsettled root, then commit; the composer if a moderator asked, then commit; `tt.mjs check`;
   curators per changed topic, then commit; `tt.mjs check`. The main session shows a short status,
   puts any open escalation to the user at once, and records answers with `tt.mjs verdict`.
5. **End.** When every root is settled and nothing is escalated, the reporter writes `report.md`.
   When a round produced no agendas, the main session asks the user whether to stop, redirect or
   go on.

## 6. The script

`skills/think-tank/scripts/tt.mjs`, Node, no dependencies:

| Command | Does |
|---|---|
| `init <run> --charter <file>` | creates the run, copies the procedure, writes `charter` and `map`, initialises git |
| `next <run>` | starts the next round |
| `check <run>` | parses every node, writes `index.md`, prints JSON: problems (broken links, missing fields, rule breaches), coverage, facet gaps, open escalations, roots and their phases, topics changed this round, agendas waiting, whether the run is done |
| `commit <run> --stage <s> --message <m>` | commits the graph |
| `verdict <run> --text <t> --addresses <ids>` | writes a verdict node |

`check` reports; it never blocks or rewrites. A problem goes to the role that owns the node, in its
next turn.

## 7. The plugin

```
think-tank/
  .claude-plugin/plugin.json
  README.md
  skills/think-tank/
    SKILL.md            the main session's steps
    FOUNDATIONS.md
    roles/              composer.md, expert.md, moderator.md, curator.md, reporter.md
    scripts/tt.mjs
  test/tt.test.mjs
```

Permissions the user grants once, because background agents can't answer prompts:
`Read(~/.think-tank/**)` and `Edit(~/.think-tank/**)` (an `Edit` rule covers every file-writing
tool).

## 8. Improving the procedure (F12)

Guided, not automatic. The user starts an ordinary run whose charter is "here is the plugin's code,
here is a real run's directory: find the issues and work on improvements". The run directory holds
the procedure it used, the graph and its history. The output is a proposed change the user reviews
and lands.

## 9. Tests

`check` is the only logic with mistakes worth catching: a broken link is reported; coverage fails
with one checker, or two from the same direction; a claim targeting a topic is flagged; a decided
topic without a clash is flagged; an escalation closes once a verdict addresses it; a topic changed
this round is listed for its curator.

## 10. Deferred, each with its trigger

| Mechanism | Built when |
|---|---|
| Size bands, hubs, librarians | a real run's topic files or root lists get too long to read |
| Validation that rejects writes | a real run is damaged by a malformed node that `check` only reported |
| Limits and budgets | the user sees a run eat too much |
| Workflow-driven rounds | the main session's context fills up during long runs |
