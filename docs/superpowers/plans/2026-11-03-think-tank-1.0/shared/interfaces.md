# Shared Interfaces

All paths are relative to the plugin repo `C:\work\claude\vanillafairy\think-tank`. Every module is
an ES module under `skills/think-tank/scripts/lib/`, Node built-ins only. `nodes` everywhere is the
`Map` that `loadGraph` returns.

## Nodes

**Produced by:** T01. **Consumed by:** T02, T03, T04, T05, T06.

```js
// skills/think-tank/scripts/lib/nodes.mjs
export function parseNode(text)   // → { fm, title, body, links, unclosed }  (unchanged from 0.2.1)
export function loadGraph(run)    // → Map<id, { id, fm, title, body, links, unclosed }> over <run>/graph/*.md
export const list = (v) => ...    // array as-is; undefined or '' → []; anything else → [v]
export const nodeId = (s) => ...  // String(s), trimmed, '.md' suffix removed
export function topicOf(nodes, id) // → the topic id a node belongs to, or null:
//   role topic            → its own id
//   role proposal         → topicOf(answers)
//   role claim            → topicOf(target)
//   role position|crux|ballot → nodeId(fm.topic) when that node exists and is a topic, else null
//   anything else, or a missing node → null; follows at most 50 hops
```

## Topic graph

**Produced by:** T02. **Consumed by:** T06.

Topic frontmatter fields this module reads: `root` (true on roots), `needs` (list of topic ids),
`status` (`open` | `blocked` | `complete`), `outcome`, `completed_seq` (number, set by the moderator
when it marks the topic complete), `duplicate_of`, `escalation`.

```js
// skills/think-tank/scripts/lib/topics.mjs
export function canonical(nodes, id)   // follows duplicate_of until a topic without it; stops on a revisit
export function needsOf(nodes, id)     // → canonical ids of id's `needs`, deduplicated, existing topics only
export function needersOf(nodes, id)   // → topic ids whose needsOf includes canonical(id), sorted
export function cycles(nodes)          // → string[][]: each strongly connected component of the needs
                                       //   graph with more than one topic, or one topic that needs itself;
                                       //   ids sorted inside each, components sorted by first id
export function isComplete(nodes, id)  // → true when, for t = canonical(id):
                                       //   t.status === 'complete' and t.outcome is set, and
                                       //   every n in needsOf(t) isComplete(n) and has completed_seq < t.completed_seq,
                                       //   and t is in no cycle
export function blockedBy(nodes, id)   // → needsOf(id) that are not isComplete, sorted
export function graphReport(nodes)     // → {
                                       //   cycles,                         // as cycles()
                                       //   blocked:   { [id]: blockedBy }, // topics not complete with a non-empty blockedBy
                                       //   unblocked: [id],                // status 'blocked' and blockedBy empty
                                       //   stale:     [id],                // status 'complete' but not isComplete; since
                                       //                                   // isComplete is transitive, this is the reopening set
                                       //   escalations: [{ node, question }],  // fm.escalation with no verdict addressing the node
                                       //   done: boolean                   // ≥1 root, every root isComplete, no escalation open
                                       // }
```

A topic carrying `duplicate_of` is an alias: it never appears in `cycles`, `blocked`, `unblocked`
or `stale`, and every `needs` entry naming it resolves to its canonical topic.

## Closing rules

**Produced by:** T03. **Consumed by:** T06.

```js
// skills/think-tank/scripts/lib/rules.mjs
export function topicRules(nodes, topic, { cap = 6, wakes = {}, since = 0 } = {})
// → {
//   positions: [{ expert, holds, state, seq }],  // position nodes with topicOf === topic, sorted by expert
//   consensus: { holds, proposal, missing: [string] },
//   crux:      { holds, crux, missing: [string] },
//   stall:     boolean,
//   loops:     [{ claim, repeats }],            // claim id re-raising the already-answered claim `repeats`
//   capped:    [expert],                        // experts with wakes[expert] >= cap, sorted
//   escalations: [{ node, question }],          // in this topic, no verdict addressing the node
//   outcome:   'decided' | 'crux' | 'ruled' | null
// }
```

`expert` is a position's `author` (an instance id such as `save@q-save-3`). `wakes` maps instance
ids to wake counts; the CLI fills it from git. `since` is a `seq`: the moderator's last look.

### Rule definitions

Terms, for one topic `T`:

- **Cast:** the authors of `position` nodes whose `topicOf` is `T`.
- **Answered:** a claim `c` is answered when its `status` is `conceded`, or some claim with stance
  `reply` or `con` targets `c` and has an author other than `c`'s.
- **Objection to `P`:** a claim with stance `con` targeting proposal `P`, by an author other than
  `P`'s.
- **Survived a clash:** `P` has at least one objection, and every objection to `P` is answered.

The rules:

- **Consensus** holds when every one of these is true; `missing` lists, in this order, a short
  reason for each that is false:
  1. the cast has at least two experts;
  2. every position has the same non-empty `holds`, `P`, and `state: agreeing`;
  3. `P` is a proposal whose `answers` is `T`;
  4. `P` survived a clash;
  5. no claim with stance `ask` whose `topicOf` is `T` is unanswered;
  6. every claim with stance `pro` and provenance `F` targeting `P` has `verified: yes`;
  7. every cast member has a `ballot` on `T` with `confidence` above 5;
  8. every ballot's `doubt` is empty, or some claim with stance `reply` or `con` targets that ballot
     and has an author other than the ballot's.

  `proposal` is `P` when 2 holds, else `null`.
- **Crux** holds when all are true, with `missing` as above:
  1. the cast has at least two experts;
  2. positions hold at least two distinct non-empty proposals;
  3. every position has `state: holding`;
  4. every held proposal survived a clash;
  5. some `crux` node on `T` has a non-empty `decided_by`, and its `acknowledged_by` includes, for
     each held proposal, at least one expert holding it.

  `crux` is the id of the first such crux node by id, else `null`.
- **Stall** is true when every position has `state: holding`, no node with `topicOf` `T` has a
  `seq` greater than `since`, and crux does not hold.
- **Loop:** a claim `c2` with stance `con` re-raises `c1` when `c1` has stance `con`, the same
  author, the same `target`, a smaller `seq`, a title equal to `c2`'s after trimming and
  lower-casing, and `c1` is answered. One entry per `c2`, `repeats` the earliest such `c1`.
- **Capped:** cast members whose `wakes` count is at least `cap`.
- **Escalations:** nodes with `topicOf` `T` (the topic itself included) that carry `escalation`
  with no `verdict` listing the node in `addresses`.
- **Outcome:** `'ruled'` when `T` itself carries an `escalation` that a verdict addresses; else
  `'decided'` when consensus holds and nobody is capped; else `'crux'` when crux holds; else `null`.

## Problems and coverage

**Produced by:** T05. **Consumed by:** T06.

```js
// skills/think-tank/scripts/lib/problems.mjs
export function nodeProblems(nodes)          // → [{ node, problem }] over every node
export function cardCoverage(nodes)          // → { ok, problems: [string] } over every expert card
export function castCoverage(nodes, topic)   // → { ok, problems: [string] } over the cards of the
                                             //   experts holding a position on `topic`
```

## Store

**Produced by:** T04. **Consumed by:** T06.

```js
// skills/think-tank/scripts/lib/store.mjs
export function init(run, charter)           // → { run }; charter: { title, purpose, in_scope, out_of_scope, sources, cap? }
export function withLock(run, fn)            // runs fn() holding <run>/.lock; → fn's result
export function nextSeq(run)                 // → the next integer from <run>/seq, under the lock; first call → 1
export function commitFiles(run, agent, message, files)
                                             // → { commit: <short sha> } or { commit: null } when nothing changed;
                                             //   files are paths relative to <run>/graph
export function wakesOf(run)                 // → { [agent]: number of commits authored by that agent }
export function verdict(run, text, addresses) // → { id: 'v-<n>' }; writes and commits the node as agent 'user'
```

### Store behaviour

- **Lock.** `withLock` creates the directory `<run>/.lock` with `mkdirSync` (atomic: it fails if the
  directory exists). On failure it waits 50 ms (`Atomics.wait` on a `SharedArrayBuffer`) and
  retries. A lock directory whose `mtime` is more than 30 s old is stale. To break it, a waiter
  first takes the break token, the directory `<run>/.lock.break`, with `mkdirSync`; a waiter that
  can't take it just waits and retries. Holding the token, it checks `.lock`'s `mtime` again, and
  only if it is still over 30 s old removes `.lock`; then it removes the token and retries. So a
  waiter that saw an old lock never removes a fresh one taken since. A break token itself more than
  30 s old (its breaker crashed) is removed by any waiter. After 10 s without the lock it throws `Error('lock busy: <run>/.lock')`. It
  always removes the directory in `finally`, also when `fn` throws. It is not re-entrant: code
  that already holds the lock calls the unlocked helpers, never `withLock` again.
- **seq.** `<run>/seq` holds the last number handed out as text. A missing file counts as 0.
  `nextSeq` reads, adds 1, writes and returns it, under the lock.
- **commitFiles.** Every path must resolve inside `<run>/graph`; otherwise it throws naming the
  path, before taking the lock. Under the lock it runs `git add -A -- <files>`, then
  `git commit -q --only --author "<agent> <<mail>@think-tank>" -m <message> -- <files>`, where
  `<mail>` is the agent id with every character outside `[A-Za-z0-9._-]` replaced by `.` (agent ids
  hold `@`), so other agents' staged or unstaged changes are never committed. A deleted file is
  committed as a deletion. A path that names no file, tracked or untracked, throws naming it. When
  the listed files have no changes it returns `{ commit: null }` without failing.
- **wakesOf.** Counts commits per author name from `git log --format=%an`, excluding the authors
  `think-tank` (init) and `user` (verdicts).
- **init.** Throws if `<run>/graph` exists. Creates `procedure/` (copies of `FOUNDATIONS.md` and
  `roles/`), `graph/charter.md`, `graph/.gitignore` with `.obsidian/`, `seq` containing `0`, then
  `git init`, `core.autocrlf false`, and a first commit authored `think-tank`. `charter.md` is
  exactly, with each list and `cap` written as JSON (`cap` is the charter's, default 6):

  ```markdown
  ---
  id: charter
  role: charter
  in_scope: [...]
  out_of_scope: [...]
  sources: [...]
  cap: 6
  ---
  # <title>

  ## Purpose

  <purpose>
  ```

  It has no `## Links` section and links to no node.
- **verdict.** Under one lock: `n` is the number of existing `v-*.md` nodes plus 1; writes
  `graph/v-<n>.md` with `role: verdict`, `author: user`, `seq` (the next sequence number) and
  `addresses`, a body holding the text and a `## Links` line per addressed node; commits it as
  agent `user`.

## CLI

**Produced by:** T06. **Consumed by:** T07, T08 (the prompts name these exact commands).

```
node tt.mjs init    <run> --charter <file.json>
node tt.mjs seq     <run>
node tt.mjs commit  <run> --as <agent> --message <text> <file> [<file> ...]
node tt.mjs check   <run> --topic <id> [--since <seq>]
node tt.mjs graph   <run>
node tt.mjs verdict <run> --text <text> --addresses <id,id>
```

Each prints one JSON object on stdout and exits 0, or prints the error message on stderr and exits
1. `commit` rewrites `<run>/index.md` after committing. `check` prints
`{ topic, rules, coverage, problems, blocked_by, needers }`: `rules` from `topicRules` with `cap`
from the charter and `wakes` from `wakesOf`, `coverage` from `castCoverage`, `problems` the
`nodeProblems` entries whose node's `topicOf` is the topic. `graph` prints `graphReport` plus
`{ problems: nodeProblems, cards: cardCoverage }`.
