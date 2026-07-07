# Fresh-session handoff — public-release push (2026-07-07)

Paste this as the first message of a fresh Claude Code session in the glamfire
repo (`/Users/bedwards/vibe/glamfire`). It picks up exactly where the last
session left off. Keep it verbatim; it encodes the directives the owner gave
inline during the last session.

---

## Paste this:

> You are the orchestrator for glamfire. Read CLAUDE.md, SPEC.md, and
> `.claude/memory/` (state.md, gotchas.md, decisions.md, INDEX.md) first, every
> session, and follow them exactly. Caveman mode is active — keep it.
>
> **Where we stand.** Issue #42 (`glam init` + AGENTS.md/CLAUDE.md ingestion
> into the run context) is DONE and verified end-to-end on branch
> `feat/init-instructions-42` → **PR #50** (open, gates green: lint clean, 494
> tests, smoke PASS 55 checks, real GLM 5.2/Fireworks + Ollama). The README was
> rewritten so `glam launch claude` is the nominal use case up top. Merge #50
> to main first (review the diff, then squash-merge or normal merge — your
> call; the orchestrator integrates and commits, workers don't run git).
>
> **The goal of this session: get glamfire to public release.** I am going to
> announce it in a comment on a Nate B Jones video, so it must be ready for
> real users and contributors when they land: install paths live, docs honest,
> issues triaged, good-first-issues inviting, CONTRIBUTING/RFC clear, gates
> green on macOS + Windows + Linux. Cut a release when ready
> (`node scripts/bump-version.mjs <patch|minor>` → commit → push → tag `vX.Y.Z`
> → push tags fires the release workflow).
>
> **Directed work — file each as a GitHub issue first, prioritize, then build
> in lock-step via parallel background workers (you orchestrate, you do not
> implement). No shims, no mocks, full-stack mini-features, verified as a human
> end-user. Do NOT try to land all of these in one PR.**
>
> 1. **Background agents in the Claude Code TUI — any model per role, one
>    shared brain.** Support background agents, git worktrees, and feature
>    branches — an interactive orchestrator that owns the final results and
>    owns the main branch. The model/provider split is **configurable per
>    role**, both directions:
>    - **Default (cheap main):** main orchestrator on GLM 5.2/Fireworks,
>      workers on the same — `glam launch claude`'s pinned model +
>      `GLAM_SERVE_TOKEN` reuse gives you this for free if every worker
>      launches through the same gateway.
>    - **Frontier main, cheap workers:** main orchestrator on the Anthropic
>      subscription with a Claude model, background workers on GLM 5.2 on
>      Fireworks AI (or any other model/provider/harness). The main session
>      runs `claude` against the Anthropic subscription directly; workers
>      launch through `glam` on the cheap model.
>    **Critical constraint:** whichever direction, the background workers'
>    memory and knowledge base MUST be the same store the main session uses,
>    and MUST be available across ANY way glam is run in the future (`glam
>    run`, `glam launch claude`, `glam serve` + any agent, the SDK, etc.) —
>    one owned brain (`~/.glam/brain.db` + the project brain), not per-mode
>    silos. No model drift is the default; per-role model choice is the
>    escape hatch.
> 2. **First-launch memory capture, fast.** Running `glam launch claude` the
>    first time on a project that was developed with normal Claude Code must
>    pull all existing memories into glam's brain store — while keeping the
>    interactive session launch FAST (capture must not block the TTY). Likely
>    a background/async ingest of Claude Code's existing memory into
>    `~/.glam/brain.db`.
> 3. **Status line "model · project · context".** When wrapping with glam, use
>    this status line; if a user uses glam, update the status line to it.
>    Today `glam launch claude` sets the line to "GLM 5.2 (via glamfire)" —
>    extend it to surface project + context (e.g. which AGENTS.md / brain
>    recall). Keep it honest.
> 4. **Generalize beyond glamfire.** glamfire must be ready to develop
>    projects OTHER than glamfire. The dogfood loop is proven on glamfire
>    itself; make sure `glam init` + `glam run` + `glam launch claude` work
>    cleanly on a fresh, unrelated repo (verify on a throwaway project).
> 5. **Public-release readiness sweep.** Verify install one-liners actually
>    work from the public registries; README Current reality matches what
>    ships; issues triaged and labeled (good-first-issue on real starter
>    tasks); CONTRIBUTING + RFC process clear; CI green on all 3 OSes; the
>    `~/.config/.env` sourcing note is in the README (it is — verify).
>
> **Standing rules that override defaults.** Fix blockers at the root, no
> workarounds. Feature branches + worktrees mandatory, never commit features
> straight to main. Commit + push often. Background workers do not run git —
> you integrate and commit. Version discipline: semver with the patch number,
> version in the product output, bump→commit→push→tag every release. Clean up
> temp files, branches, worktrees, background tasks. Write durable knowledge to
> `.claude/memory/` + `research/` as you learn. Dogfood: build glamfire with
> glamfire (GLM 5.2 + Fireworks wrapping Claude Code) — recommend users do the
> same. $GLAM/$GLAMFIRE coins are separate from the software and advertised
> only after they exist and are live.
>
> **Keys.** `FIREWORKS_API_KEY` + `GLAM_SERVE_TOKEN` live in `~/.config/.env`.
> glamfire reads `process.env` only — it does NOT auto-load that file. Source
> it first: `set -a; . ~/.config/.env; set +a`. (This is in gotchas.md and the
> README.)
>
> Start by merging PR #50, then orient on the issue list and dispatch the
> release-readiness sweep + the directed work above.

---

## What the last session actually did (so the fresh session can verify, not trust)

- Issue #42: `packages/cli/src/init.mjs` (new), `packages/engine/src/instructions.ts`
  (new), `packages/cli/src/run.mjs` + `memory.mjs` + `index.mjs` + `engine/src/index.ts`
  wired. `composeSystem` now takes a blocks array.
- Smoke: +2 checks in `scripts/smoke.mjs` (init idempotent/force; ingestion
  AGENTS-preferred/CLAUDE-fallback/absent). 55 total.
- README: new "Start here" section up top; "First and foremost" trimmed to a
  pointer; "Five things" leads with `glam launch claude`; "Keep Claude Code,
  honestly" trimmed; Current reality gained a `glam init` bullet; the
  "Wrapping Claude Code itself" bullet flipped from "not shipped" to "shipping
  now".
- Branch `feat/init-instructions-42`, 2 commits, pushed. PR #50 open.
- Memory: gotchas.md + state.md updated with #42 facts + these next-session
  directives (this file is the human-readable handoff).
