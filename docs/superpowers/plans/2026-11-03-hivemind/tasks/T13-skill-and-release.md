# Task T13: The skill, README and registration

rigor: verify
size: ~20 turns (5 edit sites, 7 files)

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

## Dependencies
- Depends on: T12
- Depended on by: —

## Scope
**Files (hivemind repo):**
- Create: `.claude-plugin/plugin.json` (`name: hivemind`, `version: 0.1.0`, a description naming the
  hive, its energy economy and evolution, the vanillafairy author and repository fields as in
  think-tank's)
- Create: `skills/hivemind/SKILL.md`
- Create: `README.md`

**Files outside the repo (registration):**
- Create the junction `C:\work\claude\plugins-dev\hivemind` → `C:\work\claude\vanillafairy\hivemind`
  (PowerShell: `New-Item -ItemType Junction -Path C:\work\claude\plugins-dev\hivemind -Target C:\work\claude\vanillafairy\hivemind`)
- Add `{ "name": "hivemind", "source": "./hivemind", "description": "<same as plugin.json>" }` to
  `C:\work\claude\plugins-dev\.claude-plugin\marketplace.json`'s `plugins`

**BOUNDARY — nothing else.** Read the spec's §9 and §12, and think-tank's
`skills/think-tank/SKILL.md` for voice.

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
### Step 2: Register
Create the junction, add the marketplace entry, then run:
```bash
claude plugin marketplace update local-dev
claude plugin install hivemind@local-dev
```
### Step 3: Verify
Run: `node --test test/` — Expected: PASS.
Run: `node -e "console.log(require('./.claude-plugin/plugin.json').version)"` — Expected: `0.1.0`.
Run: `claude plugin list` — Expected: `hivemind@local-dev` listed.
### Step 4: Commit (hivemind repo only)
```bash
git add .claude-plugin/plugin.json skills/hivemind/SKILL.md README.md
git commit -m "Add the /hivemind skill and README, as 0.1.0"
```

## Acceptance Criteria
- [ ] `SKILL.md` has the seven sections above
- [ ] The skill launches the scheduler in the background and waits on the outbox, not on a timer
- [ ] Asks are answered with pins on their candidates; unsolicited words are confirmed before they become a verdict
- [ ] The README says the plugin runs on the user's subscription and is not for distribution
- [ ] `hivemind@local-dev` is installed
- [ ] No other files were modified
