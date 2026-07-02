# Dogfooding glamfire — the Claude Code → glamfire transition

> glamfire is built with glamfire. This is the **operational** companion to the
> research brief [`research/22-dogfooding.md`](../research/22-dogfooding.md): the
> concrete, staged, verifiable path to move development, project management, and
> marketing of glamfire onto glamfire itself — **gradually and reversibly**, with
> Claude Code (or any harness) as the fallback until each surface is proven.

The rule (CLAUDE.md §9): **never rely on the dogfood loop before it is verified
end-to-end.** Each milestone has a hard gate; we do not flip the default for a
category until glamfire genuinely wins it.

## The harness

`scripts/dogfood.mjs` drives the **real `glam` binary** against a scoped task and
then runs the real gates (`smoke` + `vitest`) — so "glamfire built this" is a
checked fact. It **never fakes a run**: with no provider key it prints the exact
`export` command and exits non-zero.

```bash
# Stage 0 — read + propose (read_file tool; live model)
FIREWORKS_API_KEY=fw_... node scripts/dogfood.mjs --stage read \
  "Read README.md and list 3 concrete gaps in Current reality."

# Stage 1 — edit + run to green (write/run_command tools; live model)
FIREWORKS_API_KEY=fw_... node scripts/dogfood.mjs --stage edit \
  --file packages/engine/src/tools.ts \
  "Add a docstring to the calculator tool, then run the engine tests."
```

## Prerequisites (the two real blockers)

1. **A provider key.** Fireworks is the default workhorse — `FIREWORKS_API_KEY`.
   (Together/Anthropic keys also satisfy the harness for their adapters.) Until a
   key is set, `glam run` and the dogfood harness cannot make the live call that
   makes the loop real.
2. **The edit + run tools** in `@glamfire/engine` (`write_file`/`edit_file` +
   `run_command`, behind the least-privilege permission gate). Stage 0 needs only
   `read_file` (shipped); Stage 1 needs these. Status is tracked in
   `README.md` → *Current reality*.

## Milestones & gates (from research/22)

| # | Milestone | Gate |
|---|-----------|------|
| **M0** | Manual harness — one tool call against a model | `glam run` reads a file and proposes an edit (Stage 0 of the harness, live) |
| **M1** | Edit + run loop | Closes a real **good first issue** in this repo end-to-end (Stage 1, gates stay green) |
| **M2** | Self-hosted contributions | First **PR authored by glamfire** merged into `main` |
| **M3** | Permissioned autonomy | Completes a multi-file feature with only review-time human involvement |
| **M4** | Self-review & self-upgrade | glamfire's first-pass review catches a real defect; model bumps flow through it |
| **M5** | Majority author | Published "% authored by glamfire" crosses 50% |

## Verifying the loop actually closes (not vibes)

- **Self-hosting CI gate** (planned): a CI job runs glamfire-on-glamfire against a
  canned task and asserts build + lint + tests are green. If glamfire can't drive a
  clean build, the loop is broken — **fail loudly, fix the root cause, never
  `--skip`.**
- **Provenance on every AI commit.** Commits/PRs authored by glamfire are tagged
  with the model id used, so "% authored by glamfire" is measurable and auditable
  (Aider-style).
- **A/B against a reference harness** on a fixed task set — track success rate,
  human-intervention count, and tokens/cost per task. Regressions block the
  milestone.

## Project management & marketing on glamfire

The same loop extends past code: scoped PM/marketing tasks (triaging issues,
drafting release notes from the changelog, updating *Current reality*, first-pass
copy) are exactly center-of-distribution work the router sends to GLM 5.2. As each
is proven via the harness + a human approver, it moves from Claude Code to glamfire
and is recorded here.

## Current status

- **M0 — PROVEN (2026-07-01, v0.1.0).** `glam run` read `README.md` against real GLM 5.2
  on Fireworks and proposed 3 concrete, accurate gaps in *Current reality*
  (`scripts/dogfood.mjs --stage read`, `status: done`); the dogfood gate (smoke + 216
  tests) stayed green.
- **M1 — PROVEN (2026-07-01, v0.1.0).** glamfire closed a real **good first issue**
  ([#11](https://github.com/glamworks/glamfire/issues/11)) end-to-end: driven by GLM 5.2
  via `scripts/dogfood.mjs --stage edit`, it authored `docs/QUICKSTART.md` through the
  `write_file` tool. Human review caught one config-schema error; glamfire **iterated to
  green** and the resulting `./glam.toml` was verified to load via `glam config` (exit 0),
  `glam doctor` green on the key, gates green. Commit tagged with the model id
  (`accounts/fireworks/models/glm-5p2`) — Aider-style provenance. Merged to `main`.
- **Self-hosting CI gate — SHIPPED (v0.2.0).** `.github/workflows/ci.yml` job
  `self-hosting` drives glamfire-on-glamfire on every push and asserts the dogfood gate
  (smoke + tests) stays green, failing loudly otherwise. Gated on the `FIREWORKS_API_KEY`
  repo secret (present → live GLM 5.2; absent → a clear skip notice, never a fake pass).
  **To activate in CI, add the `FIREWORKS_API_KEY` repo secret.**

### First category flipped to glamfire (research/22 step 4) — **scoped setup/reference docs**

glamfire is now the **default author for scoped docs edits**, with Claude Code as the
reversible backstop. Measured over the runs that earned the flip (live GLM 5.2 on
Fireworks, v0.1.0–0.2.0):

| Task | Tools glamfire used | Human interventions | Cost | Result |
|---|---|---|---|---|
| Author `docs/QUICKSTART.md` (issue #11) | `write_file` | 1 (review caught a config-schema error → glamfire iterated to green) | ~$0.021 (2 turns) | merged, `glam config` loads the example, doctor green |
| Add Quickstart link to README nav | `search_files` + `edit_file` | 0 (review-time only) | $0.0116 | merged, one-line diff exactly as scoped |

**Success criteria met:** gates stayed green, diffs were minimal and correct, and the
second task completed with **only review-time human involvement** — the research/22
bar for flipping a category. **Cost/task ≈ $0.01–0.02**, well inside center-of-distribution
economics. **Reversibility:** Claude Code remains available for any docs task glamfire
can't yet do; gaps get filed as glamfire issues.

- **M2 — PROVEN (2026-07-02, v0.3.0).** First **glamfire-authored pull request**
  ([#15](https://github.com/glamworks/glamfire/pull/15)) merged into `main`: glamfire used
  its own **`git_log`** tool (shipped v0.3.0) to read the real commit history, then authored
  `CHANGELOG.md` grounded only in real commits, and it landed as a reviewed PR (not just a
  direct commit). Human role: review only; provenance tagged with the model id.
- **Engine tools for M3 — code-search (v0.2.0) + read-only git (v0.3.0) SHIPPED.** `list_files`,
  `search_files`, `git_status`/`git_diff`/`git_log`/`git_show` — all sandboxed, `read`-permission,
  live-verified. Write-git stays out of the sandbox (orchestrator integrates). Remaining for
  fuller M3 autonomy: a subagent-orchestration tool.
- **Next (M3+):** multi-file feature completed by glamfire with only review-time involvement;
  expand the flipped set beyond docs; add the subagent-orchestration engine tool.
- The transition stays **reversible** — Claude Code remains the backstop until a
  category's gate is genuinely met.
