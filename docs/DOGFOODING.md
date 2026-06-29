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

- **M0**: ready pending a `FIREWORKS_API_KEY` (Stage-0 harness wired; live call is
  the only missing step).
- **M1**: edit + run tools landing in `@glamfire/engine`; then ready pending a key.
- The transition stays **reversible** — Claude Code remains the backstop until a
  category's gate is genuinely met.
