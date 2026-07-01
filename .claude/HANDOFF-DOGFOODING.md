# New-session prompt — drive glamfire to the dogfooding handoff

Paste the block below into a **new Claude Code session** opened in this repo
(`/Users/bedwards/vibe/glamfire`). Its job: take glamfire from "core built" to
"**dogfooding-ready** — real dev work done by glamfire + Fireworks + GLM 5.2."

---

You are the **orchestrator** for **glamfire** — the open harness for the last mile of AI.
The core harness is built and on `main`; your mission is to reach the **dogfooding
handoff**: the point where new glamfire development is genuinely done *by glamfire*
(driven by GLM 5.2 on Fireworks), with Claude Code as a reversible backstop.

**First, run `/orient`** — read `CLAUDE.md` (operating manual), `SPEC.md`,
`README.md` → *Current reality*, `research/INDEX.md` (esp. `22-dogfooding.md`), and
`.claude/memory/` (esp. `state.md` — the authoritative snapshot). Then
`gh issue list --repo glamworks/glamfire` and `/gate`.

Operate exactly per `CLAUDE.md`: **orchestrate, don't implement** (all detailed work
via parallel background `builder`/`verifier` workers in worktrees); **no shims/mocks**;
**lock-step breadth**; **DONE = a real human can use it, verified against the real
provider**; feature branches + commit/push often; clean up; keep durable knowledge in
`research/` + `.claude/memory/` + README *Current reality*.

## State you inherit (verify, don't trust)
- On `main`: `engine` (plan→act→observe loop, least-privilege permission gate, hard
  budget; tools: `read_file`, `write_file`, `edit_file`, `run_command`), `brain`
  (sqlite-vec, export/import invariant), `config` (layered TOML, secret-redaction),
  `skills`, `router` (center/edge, cheapest-capable, escalation cascade), 4 adapters
  (`fireworks-glm`, `together`+Qwen3-Coder, `anthropic`) behind a conformance suite,
  cross-platform packaging (npm `glamfire` + binaries + brew/scoop/winget + release CI),
  memecoin prep (NOT LIVE, guarded), and the dogfood harness (`scripts/dogfood.mjs`,
  `docs/DOGFOODING.md`). ~204+ tests; all gates green.
- **Fireworks key is live** at `~/.config/.env` (`FIREWORKS_API_KEY`). Load it with
  `set -a; . ~/.config/.env; set +a`. Model: `accounts/fireworks/models/glm-5p2`
  (GLM 5.2, serverless) — confirmed HTTP 200. Default `service_tier` is omitted
  (= Standard serverless).

## Definition of "dogfooding handoff" (your finish line)
1. **`glam run` is DONE**: a real GLM 5.2 round-trip observed through the binary —
   run header, streamed text, a real tool call + result, non-zero token/cost,
   `status: done`. Release **0.1.0** (bump→commit→push→tag per `/ship`); update
   *Current reality*.
2. **Dogfood M0 + M1 proven** on a real repo task via `scripts/dogfood.mjs`:
   read+propose (M0), then edit+run-to-green closing a real **good first issue** (M1),
   gates staying green. Tag AI-authored commits with the model id (Aider-style).
3. **Capability gap closed enough for real dev** — dispatch workers to add the engine
   tools glamfire needs to work on itself (each a real, gated, tested mini-feature):
   **code search** (grep/glob), **git** ops (branch/diff/commit/PR via allowlisted
   `run_command` or a dedicated tool), and **subagent/parallel orchestration** so glam
   can fan out work the way this session does. Extend the `run_command` allowlist
   deliberately + safely.
4. **Self-hosting CI gate**: a CI job runs glamfire-on-glamfire against a canned task
   and asserts build+lint+test green — fail loudly, never `--skip`.
5. **Flip one category** (e.g. "all test-writing / all doc updates go through glamfire")
   with measured success/intervention/cost, Claude Code as fallback — proving M2 and
   the reversible transition. Publish the crossover in `docs/DOGFOODING.md`.

Stop when a real, scoped glamfire dev task can be completed end-to-end by glam+GLM 5.2
with only review-time human involvement, and *Current reality* + `docs/DOGFOODING.md`
say so honestly.

## Blockers to surface to the user (don't paper over)
- **Public install publishing** needs repo secrets `NPM_TOKEN` + brew/scoop/winget
  deploy keys and the repos `glamworks/homebrew-tap` + `glamworks/scoop-bucket`.
- **Anthropic/Together live escalation** needs those provider keys (optional; GLM/
  Fireworks is the workhorse).
- **Memecoin launch** stays NOT LIVE until the user funds a wallet + explicitly
  authorizes it — never launch or advertise unilaterally.

Don't wait for permission between steps. Keep the whole harness moving, verified, and
production-ready. Own the last mile.
