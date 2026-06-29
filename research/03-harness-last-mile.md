# The Harness / Last Mile in Agentic AI

Research date: 2026-06-29. Why glamfire is a *harness*, not an API wrapper.

## The core thesis

- An agent's quality is determined more by its **harness** than by the raw model. The harness is everything around the model call: **scaffolding, system prompts, tool definitions, context/memory architecture, feedback loops, routing, and architectural constraints**.
- OpenAI formalized this as **"harness engineering"**: "scaffolding, feedback loops, documentation, and architectural constraints" encoded into machine-readable artifacts that guide agent behavior. The harness — not the model — establishes the operating environment, so engineers shift focus *from model capability to environmental design*.
- Consequence: **switching models is not a one-line API change.** The harness encodes assumptions about a specific model's capabilities, tool-call format, reasoning style, context limits, and quirks. Change the model and those assumptions break — you rework the work-system.

## What "the last mile" actually contains

1. **Context engineering** — organizing and exposing the *right* information so the agent can reason, "similar to onboarding a new teammate on product principles, engineering norms, and team culture." Structured docs as a single source of truth, cross-linked, validated by linters/CI. Garbage/over-stuffed context degrades even a frontier model.
2. **Memory architecture** — what persists across turns/threads, how it's retrieved, summarized, and pruned. Codex models this with **threads** (create/resume/fork/archive, persisted event history so clients reconnect to a consistent timeline).
3. **Per-model tool-call adaptation** — every model emits/consumes tool calls differently (OpenAI JSON tools vs Anthropic XML-ish blocks; streamed-fragment args; interleaved reasoning between calls). The harness must parse, validate, and repair each model's dialect.
4. **System-prompt tuning** — prompts are model-specific. A prompt tuned for Claude under-performs on DeepSeek/GLM and vice-versa; you re-tune until offline scores match.
5. **Routing** — choosing model/tier per task (cheap model for the center of the distribution, premium for the hard tail), with fallbacks.
6. **Feedback loops & evals** — offline evals that replay real tasks, plus staged online rollout and retention metrics.

## Why switching models = rewriting the work-system

### Example 1 — Lindy moves 100% off Claude to DeepSeek (June 2026)

- Flo Crivello (CEO, Lindy, ~25-person startup) **switched 100% of traffic from Anthropic Claude to DeepSeek V4** after AI spend exceeded personnel cost. Reported **~90% inference-cost reduction ("millions saved")** and an *increase* in performance on many core use cases.
- The migration was **not** a swap — it took **~6–9 months** of evaluation, gradual rollout, and **significant prompt re-engineering**. What it actually required:
  - A **GEPA prompt-optimization loop** — iteratively rewriting prompts until offline scores matched the prior Claude/Sonnet baseline.
  - **Extensive offline evals** replaying real tasks ("offline evals are necessary; they are not enough").
  - Treating **"a model, a provider, an inference stack, and your own prompts as one system"** — the *same* model scored differently across providers/inference stacks.
  - Staged rollout: internal users → monitored online evals + retention → full cutover.
  - A failed candidate (Kimi K2.5) "felt like the assistant had brain surgery overnight" — capturing how model swaps silently break behavior the evals didn't cover.
- Crivello: he'd switch back if Anthropic cut prices — "a matter of survival for the business." The lesson for glamfire: the harness must make the model a **swappable, eval-gated component**, because economic pressure forces switches.

### Example 2 — Codex as a harness decoupled from OpenAI's model

- OpenAI's **Codex App Server** is a bidirectional protocol that **decouples the agent's core logic from client surfaces** (CLI, IDE, web) behind one stable API — harness logic (thread lifecycle, persistence, tool orchestration) lives independently of any model.
- Codex CLI supports **multi-model**: OpenAI Responses API, **Amazon Bedrock, Ollama, and any OpenAI-compatible endpoint** via `config.toml`. So the *harness* (Codex) runs **without an OpenAI model** — proving the harness is the durable asset and the model is pluggable. This is exactly glamfire's posture: a Codex-class harness pointed at GLM-5.2.
- Codex CLI also adds **environment hardening** (macOS Seatbelt read-only jail, outbound network blocked by default) — harness responsibilities the model never sees.

### Example 3 — Team-level harnesses

- Harness engineering scales to **teams**: machine-readable architectural rules (e.g. enforced dependency layering **Types → Config → Repo → Service → Runtime → UI**), structural tests that validate agents respect modular boundaries, and shared context docs as the org's single source of truth.
- The harness encodes *team* norms so any agent (any model) produces aligned output — the harness, not the model, carries institutional knowledge.

## Key takeaways for glamfire

- **glamfire's moat is the harness, not the model.** Build the durable layer — context engineering, memory/threads, tool-call adaptation, prompt sets, routing, evals — and treat GLM-5.2 (via Fireworks) as a swappable component.
- **Make models eval-gated and swappable from day one.** Lindy's 6–9 month, eval-heavy, prompt-rewriting migration is the cost of *not* having a model-agnostic harness. glamfire should ship the GEPA-style "tune prompts until offline scores match baseline" loop as a built-in.
- **Per-model adapters are mandatory.** Encapsulate each model's tool-call dialect (GLM: OpenAI-schema tools, fragmented streamed args, interleaved reasoning), reasoning controls (`reasoning_effort`), and prompt variant behind one interface. Swapping models = swapping an adapter + prompt set, not rewriting the loop.
- **Treat (model, provider, inference stack, prompts) as one unit.** Re-run evals when *any* changes — same GLM-5.2 behaves differently on Fireworks vs Z.ai vs self-host.
- **Route by the distribution.** Cheap GLM-5.2 for the center (front-end/web/decks/routine synthesis); premium fallback for the long-horizon/novel tail. Make routing + fallback a harness feature.
- **Own the non-model last mile**: memory/threads (resume/fork/persist), context assembly, sandboxing/hardening, observability (logs/metrics/spans), and team-level constraint docs — these survive every model swap.

## Sources

- https://openai.com/index/harness-engineering/
- https://www.infoq.com/news/2026/02/openai-harness-engineering-codex/
- https://openai.com/index/unlocking-the-codex-harness/
- https://www.infoq.com/news/2026/02/opanai-codex-app-server/
- https://www.lindy.ai/blog/migrating-from-claude-to-deepseek
- https://the-decoder.com/ai-startup-lindy-ditched-claude-entirely-for-deepseek-saving-millions-as-cost-pressure-mounts-on-anthropic/
- https://thenewstack.io/lindy-deepseek-anthropic-switch/
- https://whatthefuture.ai/blog/why-lindys-deepseek-switch-raises-pressure-on-anthropic
- https://www.cnbc.com/2026/06/26/openai-anthropic-new-ai-spending-reality-as-users-shift-to-efficiency.html
- https://x.com/Altimor/status/2062389885437366342
