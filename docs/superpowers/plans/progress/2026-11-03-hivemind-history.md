
- W2 T05d: merged 21e6237 (tests only, no src change; fix round 2 lines, re-review skipped). Plan tools TaskList/TaskUpdate were unavailable to the wave-controller, so todo #22 was not updated; the orchestrator should mark it completed.
- W2: assemble-brief for the auditor role reports the template's literal `[D1]` as an unfilled placeholder and writes nothing; worked around with `--set D1="[D1]"`. Plugin bug, left for the orchestrator.
