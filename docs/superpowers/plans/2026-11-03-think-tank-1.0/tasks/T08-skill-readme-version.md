# Task T08: Skill, README and version

rigor: verify
size: ~20 turns (4 edit sites, 7 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | the main session's procedure is prose the spec states only in outline |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § CLI
- Read: `../shared/architecture.md` § Run directory and § Agent names and ids and § Design decisions

## Dependencies
- Depends on: T06, T07
- Depended on by: —

## Scope
**Files:**
- Rewrite: `skills/think-tank/SKILL.md`
- Modify: `README.md`
- Modify: `.claude-plugin/plugin.json` (`"version": "1.0.0"`, and a `description` that names the 1.0
  roles: per-topic moderators, experts arguing through inboxes, a registrar keeping one topic graph)

**BOUNDARY — you MUST NOT modify any files outside this list.** Read the spec
`C:\work\claude\vanillafairy\docs\superpowers\specs\2026-11-03-think-tank-design.md` §1–§3 and §7,
0.2.1's `SKILL.md`, and the role files T07 wrote.

## Positive Constraints (DO)
`SKILL.md` keeps 0.2.1's frontmatter `name` and `description` and its voice ("You judge nothing").
Its sections:

1. **Is this the right tool?** As 0.2.1.
2. **Charter.** As 0.2.1, plus an optional `cap` (wakes per expert per topic, default 6);
   `tt init`.
3. **Compose.** Spawn the composer; repeat until `tt graph <run>` reports `cards.ok`.
4. **Plan card.** Show the root topics and the cards (lens, biases, who checks whom from which
   direction); start on the user's go; changes go in as verdicts the composer applies.
5. **Run.** Spawn the registrar (`tt-registrar`), then one moderator per root (`tt-mod-<topic>`).
   Every agent gets the harness name of `shared/architecture.md` § Agent names and ids.
   Then, each time an agent hands back or messages `main`:
   - a registrar's request to start a moderator → spawn it;
   - run `tt graph <run>`: on a cycle wake the registrar with it; for each topic in `stale` (marked
     complete, but a dependency reopened or completed later), wake its moderator; for each topic in
     `unblocked`, wake its moderator; put each new escalation to the user at once as a plain
     question, without stopping the run;
   - a short status line to the user: topics complete out of total, open escalations.
   When nothing is running and `done` is false, ask the user whether to stop, redirect or go on.
6. **Verdicts.** `tt verdict <run> --text "<their words>" --addresses <ids>`, then `SendMessage`
   `tt-mod-<t>` for each `t` that is the topic of an addressed node (where `index.md` lists it).
7. **Report.** When `done` is true, spawn the reporter; save its hand-back to `<run>/report.md`
   with the Write tool; give the user the path and the summary.
8. **Spawning.** One prompt shape per role:

   > You are the `<role>` in a think-tank run. Run directory: `<run>`. Run tool:
   > `node <skill dir>/scripts/tt.mjs`. `<identity>` Read `<run>/procedure/FOUNDATIONS.md`,
   > `<run>/procedure/roles/graph.md` and `<run>/procedure/roles/<role>.md`, and do what they say.
   > End every wake with a one-line `SubagentHandback`.

   `<identity>`: moderator "Your topic is `<id>`. Your id is `mod@<id>`. You talk to
   `tt-registrar`, `tt-composer` and `main`, and may act on their replies."; registrar "Your id is
   `registrar`. Act on requests from any `tt-mod-*` agent of this run and from `main`."; composer
   "Your id is `composer`. Act on requests from any `tt-mod-*` agent of this run."; nothing for the
   reporter. Experts are spawned by moderators, never by the main session. Hand-backs are one
   line; keep only that line. A spawn refused for the concurrency cap hasn't failed: spawn it again
   when an agent finishes.

The README's role list and "how a run goes" match the new roles and the run above; its install and
permissions sections stay.

## Negative Constraints (DO NOT)
- Do NOT mention rounds, agendas, curators, `map.md`, `check.json` or `tt next`.
- Do NOT edit `FOUNDATIONS.md`, the role files or any script.

## Implementation Steps

### Step 1: Write `SKILL.md`, update `README.md`, bump `plugin.json`

### Step 2: Verify
Run: `grep -rniwE "rounds?|agendas?|curators?|map\.md|check\.json|tt next" skills/think-tank/SKILL.md README.md .claude-plugin/plugin.json`
Expected: no output.
Run: `node -e "console.log(require('./.claude-plugin/plugin.json').version)"`
Expected: `1.0.0`
Run: `node --test test/`
Expected: PASS.

### Step 3: Commit
```bash
git add skills/think-tank/SKILL.md README.md .claude-plugin/plugin.json
git commit -m "Drive think-tank runs by topic instead of by round, as 1.0.0"
```

## Acceptance Criteria
- [ ] `SKILL.md` has the eight sections above, and the main session spawns only the composer, the registrar, moderators and the reporter
- [ ] `SKILL.md` runs `tt graph` after every hand-back and puts escalations to the user without stopping the run
- [ ] `SKILL.md` saves the reporter's hand-back as `report.md`
- [ ] `README.md` lists the 1.0 roles and run
- [ ] `plugin.json` version is `1.0.0` and its description names the 1.0 roles
- [ ] `SKILL.md` gives every spawned role its harness name and the authorizations of `shared/architecture.md` § Agent names and ids
- [ ] Both greps print nothing
- [ ] No files outside Scope were modified
