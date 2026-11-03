# Task T13: The skill and README

rigor: verify
size: ~17 turns (3 edit sites, 5 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | the main session's procedure is prose the spec states in outline |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/architecture.md` § Run directory and § Design decisions
- Read: `../shared/interfaces.md` § Outbox, inbox, status
- Note: read §9 and §12 of `C:\work\claude\vanillafairy\docs\superpowers\specs\2026-11-03-hivemind-design.md`
- Note: for voice, read `C:\work\claude\vanillafairy\think-tank\skills\think-tank\SKILL.md`

## Dependencies
- Depends on: T12
- Depended on by: —

## Scope
**Files:**
- Create: `.claude-plugin/plugin.json` (`name: hivemind`, `version: 0.1.0`, a description naming the
  hive, its energy economy and evolution; author and repository fields as in think-tank's)
- Create: `skills/hivemind/SKILL.md`
- Create: `README.md`

**BOUNDARY — you MUST NOT modify any other file, inside the repo or outside it.** Registration in
the local-dev marketplace is the orchestrator's step after the merge.

## Positive Constraints (DO)
`SKILL.md` (frontmatter `name: hivemind` and a description for `/hivemind`), sections:
1. **Is this the right tool?** One good answer → a direct answer or `/socratic`; a brain-shaped
   plan review → `/think-tank`; an open problem worth a swarm → here.
2. **Charter.** Ask for the goal, scope and sources; state the default budget (from the next
   default or physics) and that billing is the Claude Code subscription; `hive init`.
3. **Launch.** `npm ci` once in the plugin directory if `node_modules` is missing; start
   `hive run <dir>` with Bash `run_in_background: true`; start one Monitor until-loop that wakes
   only when a file lands in `<dir>/outbox/` or the scheduler exits.
4. **Asks.** For each outbox file: put the question in plain words, the candidates as choices
   (AskUserQuestion), without stopping the run; write the answer with `hive verdict` pinning the
   chosen candidates to 1 and the rest to 0; delete the outbox file.
5. **The user speaks.** Anything about the work: restate it as which nodes to pin, confirm with the
   user, then `hive verdict`. "Spend more" / "too expensive": `hive feed` with a positive or
   negative amount. "Stop": `hive stop`.
6. **Status** only when asked or when an ask arrives: `hive status`.
7. **End.** `hive report <dir>`; save its text as `<dir>/report.md`; give the user the path and its
   summary; ask for the budget rating and run `hive rate`.

The README: what a hive is (one paragraph), how a run goes, the run directory, `hive sim` for
tuning physics without tokens, that it runs on the user's Claude Code subscription and draws on
its limits, and that it isn't for distribution to other users.

## Negative Constraints (DO NOT)
- Do NOT mention rounds, moderators or think-tank's roles except in "Is this the right tool?".
- Do NOT change code.

## Implementation Steps
### Step 1: Write the three files
### Step 2: Verify
Run: `node --test test/` — Expected: PASS.
Run: `node -e "console.log(require('./.claude-plugin/plugin.json').version)"` — Expected: `0.1.0`.
Run: `grep -n "^## \|^### " skills/hivemind/SKILL.md` — Expected: the seven sections.
### Step 3: Commit
```bash
git add .claude-plugin/plugin.json skills/hivemind/SKILL.md README.md
git commit -m "Add the /hivemind skill and README, as 0.1.0"
```

## Acceptance Criteria
- [ ] `SKILL.md` has the seven sections above
- [ ] The skill launches the scheduler in the background and waits on the outbox, not on a timer
- [ ] Asks are answered with pins on their candidates; unsolicited words are confirmed before they become a verdict
- [ ] The README says the plugin runs on the user's subscription and is not for distribution
- [ ] `plugin.json` is version `0.1.0`
- [ ] No other files were modified
