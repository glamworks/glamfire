---
description: Fan out detailed work to parallel background workers. The orchestrator's default move.
---

You are the orchestrator. **Do not implement directly.** Decompose the requested work
into independent, full-stack mini-feature briefs and dispatch them as **parallel
background workers** (`Agent` with `run_in_background: true`, or a `Workflow`), using
the right agent type:

- `builder` — implement a mini-feature end-to-end (own branch/worktree, own tests).
- `researcher` — gather knowledge into `research/`.
- `verifier` — adversarially confirm a change is DONE for a real human.
- `reviewer` — review a diff before merge.

For each worker brief include: the goal, the exact files/subsystem scope (keep workers
from colliding — use separate worktrees for parallel writers), the spec/research to
read, the "no shims/mocks" + "tests included" + "no git" rules, and the expected
return shape. Launch independent workers in ONE batch so they run concurrently.

After dispatch: monitor, integrate, run `/gate`, dispatch a `verifier`, then `/ship`.
Keep breadth in lock-step — do not let one subsystem race ahead. Clean up workers and
temp files when done.
