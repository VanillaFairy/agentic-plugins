Status: NEEDS_INPUT
# 2026-11-03-hivemind checkpoint

Wave: 4 — T08a, T08b, T08c
Integration head: d89ce11
Remaining: T08d, T09a..T13

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
| T08c | 4 | sdd/2026-11-03-hivemind/T08c | audited (FAIL: 9 gaps) | 0 | |
| T08d | 4 | sdd/2026-11-03-hivemind/T08d | not started (waits on D1) | 0 | |

## Decisions and deviations
- W4 T08a/T08b: merged 5ac4783 / d89ce11 (reviews PASS, separation PASS). Choices the tests leave open and T08b took: `rest` returns result.done; `source` pages 1-based, priced by the returned page's bytes; attacking a `#relevance` argument or an ask earns no critic pay; tools.mjs is ~290 lines. Hive.update writes through to disk; runTool never calls persist. T09/T10 consume these.
- W4: review-package writes its diff to a workspace derived from the worktree cwd; copied to plan/ for the reviewer brief. assemble-brief auditor still needs --set D1="[D1]" for the literal tag in its template.
- W2 T05d: merged 21e6237 (tests only, no src change; fix round 2 lines, re-review skipped). Plan tools TaskList/TaskUpdate were unavailable to the wave-controller, so todo #22 was not updated; the orchestrator should mark it completed.
- W2: assemble-brief for the auditor role reports the template's literal `[D1]` as an unfilled placeholder and writes nothing; worked around with `--set D1="[D1]"`. Plugin bug, left for the orchestrator.
- W2: the audit's gap task extracted as tasks/T05d-audit-gaps.md (not T05d-economy-gaps.md as T05c named it); plan.md and T08 dependency rows name T05c, not T05d.
- W2 T03b: reportInput returns an object {questions, verdicts, spend}, not a string; skeleton reads relevance from strengths.get(`${qid}#relevance`). T12 must consume the object shape; T08/T07 passing strengths must include the #relevance entries.
- W2 T05b: death in economy.settleTick means balance zero, not balance plus escrow; an agent that escrows its whole balance can die mid-wake. T09 (scheduler) must decide how to avoid or handle it. Amounts are Math.round-ed whole units; source price uses 1024 bytes per KB; closed accounts are inert everywhere; a missing account throws except a claim whose author is not living.

- W3 T07: initial ema is target_start (interface does not fix it); T08/T09/T11 should check it. TaskUpdate unavailable, so todo #11 not updated; mark it completed.
- W3: review-package must run from inside the nested repo worktree, not the outer repo.

## Open issues and escalations
- W4 T08d: gap task extracted from T08c audit (tasks/T08d-audit-gaps.md, committed with this ledger); not dispatched, worktree not cut. Waits on D1. Audit report: plan/T08c-audit.md. T08b worktree removed (merged d89ce11). TaskCreate/TaskUpdate unavailable: orchestrator should mark todos #12 and #13 completed and create W4 todo for T08d.

## Pending questions
- T08d D1: does a target that falls below standing on its first foreign attack earn novelty at the first later foreign attack it survives? `fix` = yes (novelty on the first SURVIVED foreign attack, `novelty_paid` keeps it once; acceptance lines G3 run, fails-today). `accept` = only the very first foreign attack is judged; a target that did not survive it never earns novelty (skip the [D1] lines, G3 becomes stale). Design §8 says "paid once a claim has survived its first attack from another lineage".

## Knowledge entries
