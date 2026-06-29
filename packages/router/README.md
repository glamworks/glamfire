# @glamfire/router

Center/edge, cost-aware routing with confidence-based escalation; GLM 5.2 on Fireworks is
the default workhorse for center-of-distribution work (SPEC §5.3).

**Status:** working end-to-end (offline). See [`../../SPEC.md`](../../SPEC.md) §5.3 and the
repo [`README.md`](../../README.md) → *Current reality* for exactly what is real today.

## What it does

- **Classification** (`classify`) — pure, deterministic, feature-based scoring of a task
  into `center` ↔ `edge` with a calibrated **confidence**. Signals: task shape, prompt
  length, code-ness, novelty/complexity keywords, retrieval-hit quality, and historical
  outcomes. Confidence is computed from the *features* (boundary distance, signal
  agreement, evidence strength) — **not** by asking a model "how sure are you" (research/04
  shows verbalized confidence underperforms). The signal pipeline is extensible.
- **Policy engine** (`evaluatePolicy`) — evaluates `routing.rules` (from `@glamfire/config`)
  top-to-bottom, first match wins; filters each rule's `candidates` by adapter-declared
  **capabilities** (the `requires` tokens) and by projected **`maxUsd`**, then picks the
  **cheapest surviving** candidate. Falls back to `routing.default`.
- **Escalation cascade** (`Router`) — runs the cheap candidate, **verifies** its output
  (rubric / heuristic / any pluggable `Verifier`), and on failure **escalates** to the
  next-stronger candidate, emitting a real engine `escalation` step. Budget-bounded.
- **Cost accounting** (`buildReport` / `formatReport`) — projected vs actual cost per
  decision and a **distribution report**: how much work was center vs edge, and dollars
  saved by routing versus always sending everything to the frontier.

## Integration

The `Router` implements the engine's neutral `RouterHook`: `runTask({ ..., router })` lets
the router pick the model and drive escalation while the engine keeps owning the loop,
budget, and permission gate. The CLI exposes it as `glam route "<prompt>"` (offline
dry-run) and `glam run --explain` (live decision).
