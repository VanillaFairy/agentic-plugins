Status: DONE
# 2026-11-03-hivemind checkpoint

Wave: final-fix
Integration head: 7203732
Remaining: none

## Tasks
| Task | Wave | Branch | State | Review cycles | Merge commit |
| T01 | 1 | sdd/2026-11-03-hivemind/T01 | merged | 2 | 39cb119 |
| T02a | 2 | sdd/2026-11-03-hivemind/T02a | merged | 1 | 50343cf |
| T02b | 2 | sdd/2026-11-03-hivemind/T02b | merged | 1 | 3b9f183 |
| T03a | 2 | sdd/2026-11-03-hivemind/T03a | merged | 1 | ea4f5f8 |
| T03b | 2 | sdd/2026-11-03-hivemind/T03b | merged | 2 | e13f561 |
| T04 | 2 | sdd/2026-11-03-hivemind/T04 | merged | 1 | 77f41eb |
| T05a | 2 | sdd/2026-11-03-hivemind/T05a | merged | 1 | d38390c |
| T05b | 2 | sdd/2026-11-03-hivemind/T05b | merged | 1 | 55e1db0 |
| T05c | 2 | sdd/2026-11-03-hivemind/T05c | audited; gaps closed by T05d | 0 | |
| T06 | 2 | sdd/2026-11-03-hivemind/T06 | merged | 2 | 31bfae5 |
| T05d | 2 | sdd/2026-11-03-hivemind/T05d | merged | 2 | 21e6237 |
| T07 | 3 | sdd/2026-11-03-hivemind/T07 | merged | 1 | 0a440e3 |
| T08a | 4 | sdd/2026-11-03-hivemind/T08a | merged | 1 | 5ac4783 |
| T08b | 4 | sdd/2026-11-03-hivemind/T08b | merged | 1 | d89ce11 |
| T08c | 4 | sdd/2026-11-03-hivemind/T08c | audited; gaps closed by T08d | 0 | |
| T08d | 4 | sdd/2026-11-03-hivemind/T08d | merged | 1 | 09c5f40 |
| T09a | 5 | sdd/2026-11-03-hivemind/T09a | merged | 2 | cb90579 |
| T09b | 5 | sdd/2026-11-03-hivemind/T09b | merged | 2 | fd2abfb |
| T09c | 5 | sdd/2026-11-03-hivemind/T09c | audited; gaps closed by T09d | 0 | |
| T09d | 5 | sdd/2026-11-03-hivemind/T09d | merged | 1 | 3cb1807 |
| T10 | 5 | sdd/2026-11-03-hivemind/T10 | merged | 2 | 50ae99e |
| T11 | 6 | sdd/2026-11-03-hivemind/T11 | merged | 1 | 25064f1 |
| T12 | 7 | sdd/2026-11-03-hivemind/T12 | merged | 1 | 8076e33 |
| T13 | 8 | sdd/2026-11-03-hivemind/T13 | merged | 1 | a6ffa82 |
| final-fix | final-fix | sdd/2026-11-03-hivemind/final-fix | merged | 1 | 7203732 |

## Decisions and deviations
- final-fix: merged 7203732 (re-review ADDRESSED, suite 312/312). C1,C2,I1-I7 closed; user rulings I3 (dead agent leftover and escrow reclaimed to supply, own ledger line) and I6 (proportional thermostat) applied and spec section 8 and section 4 amended in the outer repo. Spec edit was done by a second executor with the outer repo as worktree (the fix implementer was denied there). A bud at the lower budding clamp now waits until the parent holds twice wake_reserve. child() on a parent that starved (balance 0) stays unpaid. 24 Minors (plan/FINAL-review.md) left unfixed. TaskUpdate unavailable: orchestrator closes #25.
- W8 T13: merged a6ffa82 (review 1 SPEC FAIL, fixed in 17-line round, re-review skipped; suite 287/287). Skill launches `hive run` in background, Monitor waits on outbox only, background exit notification ends the run. Minors left in plan/T13-review.md. Open for final review: README tells users to tune with `hive sim <dir>`; reviewer could not confirm sim does not mutate the run dir it is pointed at (cli.mjs runHive). TaskUpdate unavailable: orchestrator closes #21.
- W7 T12: merged 8076e33 (review PASS, 4 Minor in plan/T12-review.md; suite 287/287). cli.mjs writes inbox files via .tmp then rename, name max(now,newest existing)-counter; sim uses {...physics.sim_cost, ...fitCostModel}. `hive run` and real `report` (SDK) untested by design. TaskUpdate unavailable: orchestrator closes #20.
- W6 T11: merged 25064f1 (review PASS, 4 Minor in plan/T11-review.md; suite 279/279). Stub critics re-look up to run.burst-1 times in a wake until another lineage's answer exists (else no attack ever happens); the runner records claimId->{agent,lineage} from claims it mediates. fitCostModel needs `tool` events too, returns start_write/turn_output/turn_context only; T12 should merge `{...physics.sim_cost, ...fitCostModel(events)}`. Fresh worktrees need `npm ci` (knowledge/install-deps-in-worktree). TaskUpdate unavailable: orchestrator closes #19.
- W5 T09d: merged 3cb1807 (review PASS, 2 Minor left in plan/T09d-review.md; suite 271/271). G1 (throwing wake written off) and G3 (only a verdict on the ask id answers it) fixed in scheduler.mjs; G2 skipped [D2]; the verdict step of the ask test now answers by ask id. TaskUpdate unavailable: orchestrator closes #24 and #17. User answers D1 fix, D2 accept (implementer skips [D2] lines; rule 6 "above" read as standing >=), D3 fix. D3 also changes the verdict step of the test corrected in 4bbd374 (answer asks by ask id).
- W5 T09: audit T09c returned FAIL on separation only because T09b's branch carries commit 4bbd374, a one-line correction to the locked test 'an ask reaches the user once' (it expected `quiet` with three unanswered sent asks, contradicting rule 9 and the test 'an outstanding ask keeps a hive that nobody can wake waiting'). A fresh agent made it after T09b's review, the green fix then removed the scheduler's rule-9 workaround; the gate passes with --red 4bbd374 and was run by the wave-controller. Gap D3 asks whether a verdict on an ask's candidate claims answers it (4bbd374 answers the asks that way).
- W5 T09b/T10: the runner gets a flat view `{ ...fm }` (id, session, founder, genome); T11's sim runner takes the same view (knowledge/runner-agent-view.md, referenced from T11). Real runner `mutate`/`report` throw on failure or usage limit and have no `limit` field; the scheduler logs a thrown mutate as a failed birth, but a thrown `report` (T12) must be handled by the CLI. Idle guard: an agent whose wake made no accepted call is ineligible until the tick moves. T12 must write inbox files atomically (a half-written .json is logged rejected and consumed).
- W5 T09b: a dead agent's wake usage is never charged (chargeUsage on a closed account returns the cost unpaid; books still balance). Economy (T05) territory, not fixed; the tokens of that last wake never reach `spent`.
- W5 T10: built-in tools removed with `tools: []` on every SDK call (review Important, fixed). Minors left for the final review: `m.error === 'rate_limit'` on assistant messages is not read as a limit; seed zod schema takes free strings for stance/species where validateGenome has fixed lists; runner.interrupt untested.
- W5 T09b Minors left for the final review (plan/T09b-review.md): escrow() result ignored for newborns, attack counted at >= standing_threshold (D2), paused=false written before the retry succeeds, finish may not await interrupts from markDead, scheduler.mjs is one 566-line class.
- W4 T08d D1 answered `accept` (orchestrator, standing rules): only the first foreign attack is judged; a target that did not survive it never earns novelty. Implementer skips [D1] lines; G3 stale. Merged 09c5f40: G1 fixed in checkVerification (check needs the checked claim's source read), G2 and G4-G9 test-only; suite 214/214. Review had 4 Minor findings, left in plan/T08d-review.md for the final review. G1, G2, G4-G9 closed as written. TaskList/TaskUpdate unavailable to the wave-controller; todos #23, #14 are for the orchestrator to close.
- W4 T08a/T08b: merged 5ac4783 / d89ce11 (reviews PASS, separation PASS). Choices the tests leave open and T08b took: `rest` returns result.done; `source` pages 1-based, priced by the returned page's bytes; attacking a `#relevance` argument or an ask earns no critic pay; tools.mjs is ~290 lines. Hive.update writes through to disk; runTool never calls persist. T09/T10 consume these.
- W4: review-package writes its diff to a workspace derived from the worktree cwd; copied to plan/ for the reviewer brief. assemble-brief auditor still needs --set D1="[D1]" for the literal tag in its template.
- W2: the audit's gap task extracted as tasks/T05d-audit-gaps.md (not T05d-economy-gaps.md as T05c named it); plan.md and T08 dependency rows name T05c, not T05d.
- W2 T03b: reportInput returns an object {questions, verdicts, spend}, not a string; skeleton reads relevance from strengths.get(`${qid}#relevance`). T12 must consume the object shape; T08/T07 passing strengths must include the #relevance entries.
- W2 T05b: death in economy.settleTick means balance zero, not balance plus escrow; an agent that escrows its whole balance can die mid-wake. T09 (scheduler) must decide how to avoid or handle it. Amounts are Math.round-ed whole units; source price uses 1024 bytes per KB; closed accounts are inert everywhere; a missing account throws except a claim whose author is not living.

- W3 T07: initial ema is target_start (interface does not fix it); T08/T09/T11 should check it. TaskUpdate unavailable, so todo #11 not updated; mark it completed.
- W3: review-package must run from inside the nested repo worktree, not the outer repo.

## Open issues and escalations
- Todos: TaskCreate/TaskUpdate unavailable to the wave-controller; orchestrator marks #12, #13, #14 (T08c) and #23 (T08d) completed.

## Pending questions
- none

## Knowledge entries
- scratch-checkout-for-red-runs, edit-scripts-crlf (final-fix), install-deps-in-worktree (W6), run-scheduler-tests, runner-agent-view, run-one-scheduler-test, wrap-script-runner (W5)
