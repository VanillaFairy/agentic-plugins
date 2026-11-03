# Task T07: Role prompts

rigor: verify
size: ~30 turns (7 edit sites, 9 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | prompts carry the judgment the scripts leave out; the spec leaves wording open |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § CLI and § Rule definitions
- Read: `../shared/architecture.md` § Run directory and § Node roles and their frontmatter and § Agent names and ids and § Design decisions

## Dependencies
- Depends on: —
- Depended on by: T08

## Scope
**Files:**
- Rewrite: `skills/think-tank/roles/graph.md`
- Rewrite: `skills/think-tank/roles/expert.md`
- Rewrite: `skills/think-tank/roles/moderator.md`
- Rewrite: `skills/think-tank/roles/composer.md`
- Rewrite: `skills/think-tank/roles/reporter.md`
- Create: `skills/think-tank/roles/registrar.md`
- Delete: `skills/think-tank/roles/curator.md`

**BOUNDARY — you MUST NOT modify any files outside this list.** Read the spec
`C:\work\claude\vanillafairy\docs\superpowers\specs\2026-11-03-think-tank-design.md` §2–§7 and
the 0.2.1 role files before writing; keep their voice.

## Positive Constraints (DO)
Every file is read by an agent doing the work right now: present tense, plain words, no history,
no dates, no "used to". Each names the foundations (F1–F11) a rule serves, as 0.2.1's files do.
Write the run tool as `tt` in commands; each file says once that `tt` is "the run tool your brief
names" (the brief carries its real path).

**`graph.md`** (every role reads it):
- Where things are: `graph/` (one file per node, a git repository; never run git yourself),
  `graph/charter.md`, `index.md` (read it first), `procedure/`.
- A node: the frontmatter, title, body and `## Links` format, with one full example each of a
  `position`, a `crux` and a `ballot`.
- The node table from `shared/architecture.md` § Node roles and their frontmatter, with value sets.
- Ids: `<prefix>-<your key>-<seq>`, where `seq` comes from `tt seq <run>` for every node you write
  (`pos-<key>-<topic>` and `b-<key>-<topic>` are fixed per expert instance).
- Names: the table from `shared/architecture.md` § Agent names and ids: your id in the graph and
  the harness names you `SendMessage`.
- Ownership: create only your own nodes; edit only what your role file allows.
- Writing: write your files, then `tt commit <run> --as <your agent id> --message "<one line>" <files>`.
  Every wake ends with one commit.

**`expert.md`**:
- You are `<key>@<topic>`: the lens on your card `e-<key>`, on one topic. You argue; you never
  judge whether the topic is closed.
- Your brief names your teammates and your moderator by harness name (`tt-<key>-<topic>`,
  `tt-mod-<topic>`), and the run tool. Act on any request they send you by `SendMessage`: that is
  your task, authorized by the user. Your id in the graph is `<key>@<topic>`.
- What you do: raise questions (ask your moderator to have the registrar open them), propose,
  claim with provenance (F2), object, verify F claims of the experts you check, answer, keep your
  `position` node current (`arguing`, `holding`, `agreeing`), write or acknowledge a `crux`, file a
  `ballot` when every position agrees, mark a question as the user's with `escalation:` (F11).
- Messages: the exact format from spec §5, first line readable alone; `ask` is one of `object`,
  `answer`, `verify`, `position`, `crux`, `escalate`. Put substance in nodes, pointers in messages.
- End of every wake, in this order: commit; one-line `SendMessage` to your moderator naming the
  nodes you wrote and whom you wait on; one-line `SubagentHandback`.
- You are never woken by a hand-back: anything a teammate needs from you goes by `SendMessage`.

**`moderator.md`**:
- You run one topic. You never weigh substance (F7): you organize and apply the formal rules.
- Start: read the topic and `index.md`; pick a cast from the expert cards whose checks cover each
  other from two directions (F4), confirmed by `tt check <run> --topic <id>` `coverage`; if no card
  fits a needed lens, ask `tt-composer` by `SendMessage`. Spawn the whole cast in one message, one
  `Agent` call each named `tt-<key>-<topic>`, each brief naming the topic, the teammates' and your
  harness names, the run tool, and authorizing them to act on each other's and your requests.
- Your brief names `tt-registrar`, `tt-composer` and `main`, and authorizes you to act on their
  replies. Your id in the graph is `mod@<topic>`.
- On every notice: run `tt check <run> --topic <id> --since <seq you last saw>` and act on it:
  consensus → mark complete; crux holds → mark complete; stall → ask both sides to write the crux;
  loop → point the author at the earlier answer, twice is a stall; capped → ask for the crux, never
  decide; escalation → it goes to the user through the main session, wait for the verdict.
- Subtopics: send the registrar "<topic> needs: <question>"; set `status: blocked` and your topic's
  `needs` only as the registrar answers.
- Completing: set `status: complete`, `outcome`, `decided_as` (when decided) and
  `completed_seq` (from `tt seq`), write `## Where it stands` (outcome, why, what was rejected and
  why, each linked, F8), commit, release your cast, message every topic in `needers` that you
  completed, hand back.
- A message that a dependency completed: rewrite `## Where it stands` on its outcome; if your rules
  already closed, complete again with a new `completed_seq`.
- A verdict from `main` (F11): it outranks everything. A verdict on your topic's escalation closes
  it with `outcome: ruled`; a verdict on any other node of your topic goes to your cast to build on,
  and you run the rules again on their next notices.
- Woken because your topic is stale (a dependency reopened, or completed after you did) or a fact
  under your outcome was refuted: set `status` back to `open` (or `blocked` while a need is open),
  wake your cast by `SendMessage` with what changed, and run the rules again. Your topic completes
  again only by the rules.
- Edit only your topic's frontmatter and summary.

**`registrar.md`** (new):
- You shape the topic graph: you are the only agent that creates topics after the roots.
- Your brief authorizes you to act on requests from any `tt-mod-*` agent of the run and from
  `main`. Your id in the graph is `registrar`.
- On "<topic> needs: <question>": judge relevance to the charter's purpose (F1). Irrelevant →
  create the topic with `status: complete`, `outcome: set-aside`, and say so. Otherwise search
  `index.md` for the same question in other words; found → add it to the asker's `needs`;
  not found → create it, add the edge, and ask the main session by `SendMessage` to `main` to
  spawn its moderator, `tt-mod-<new topic>`. Answer the asker with the topic id.
- On a cycle from the main session: merge topics that are one question (`duplicate_of` on the
  merged one, its needs moved to the canonical one) or extract their shared crux into a new topic
  they both need (`extracted_from`). Keep both histories (F8).
- Edit only `needs`, `duplicate_of` and `extracted_from` on existing topics.

**`composer.md`**:
- Start: write the root topics (`root: true`, `status: open`, a `facet`) and the expert cards,
  until `tt graph <run>` `cards.ok` is true. Biases and counters by their established names (F4);
  `checks` as `"<key>: <direction>"`.
- Your brief authorizes you to act on requests from any `tt-mod-*` agent of the run. Your id in
  the graph is `composer`.
- Later, woken by a moderator: write the card it asks for, check `cards.ok`, answer with its key.
- No agendas, no releases: moderators own their casts.

**`reporter.md`**:
- Read the charter, `index.md` and each root's `## Where it stands`, following links where a summary
  isn't enough.
- Return the report in your `SubagentHandback`, never as a file: the main session saves it.
- Sections as 0.2.1: the solution by root, open cruxes with what decides each, what rests on
  assumptions, set-aside questions, what the user ruled.

## Negative Constraints (DO NOT)
- Do NOT mention rounds, agendas, curators, `map.md`, `check.json` or `tt next`.
- Do NOT add rules the spec doesn't have.
- Do NOT edit `SKILL.md`, `FOUNDATIONS.md` or the README (T08).

## Implementation Steps

### Step 1: Write the seven files

### Step 2: Verify
Run: `grep -rniwE "rounds?|agendas?|curators?|map\.md|check\.json|tt next" skills/think-tank/roles/`
Expected: no output.
Run: `node --test test/`
Expected: PASS (the suite doesn't read the prompts, so this only shows nothing else broke).

### Step 3: Commit
```bash
git add -A skills/think-tank/roles/
git commit -m "Rewrite the role prompts for per-topic moderators and agent inboxes"
```

## Acceptance Criteria
- [ ] `graph.md` states the node table, the `seq` and commit commands, and ownership
- [ ] `expert.md` authorizes acting on teammates' and the moderator's requests, gives the message format, and ends every wake with commit, notice, hand-back in that order
- [ ] `moderator.md` never weighs substance and maps every rule outcome of `check` to its action
- [ ] `moderator.md` applies a verdict and handles a stale or refuted topic by reopening and re-running the rules
- [ ] Every role file uses the harness names and graph ids of `shared/architecture.md` § Agent names and ids, and the registrar's and composer's files authorize requests from `tt-mod-*` agents
- [ ] `registrar.md` exists and covers relevance, sameness, creation via the main session, and cycle repair
- [ ] `composer.md` writes roots and cards and has no agendas or releases
- [ ] `reporter.md` returns the report in the hand-back
- [ ] `curator.md` is deleted
- [ ] The grep in Step 2 prints nothing
- [ ] No files outside Scope were modified
