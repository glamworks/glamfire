# 26 — Ornith-1.0 (DeepReinforce AI): self-scaffolding open agentic-coding models

Research date: **2026-07-03**. Release date: **2026-06-25**. Status: 9 days old —
vendor-reported numbers only, no independent reproduction yet, essentially no
serverless US hosting yet.

---

## 1. Who is DeepReinforce AI

- AI startup + research team founded by **Dr. Jiwei Li** — Stanford CS PhD (reportedly
  first to finish in 3 years), founder of Shannon.AI (NLP startup), former Chief AI
  Officer at Altonomy, MIT TR35 winner, highly cited NLP researcher
  ([alby13/X](https://x.com/alby13/status/2070275969575981567), search-aggregated bio).
- Prior public track record: **CUDA-L1** (Jul 2025, arXiv 2507.14111) — contrastive-RL
  CUDA kernel optimization claiming ~3x average speedups
  ([GitHub](https://github.com/deepreinforce-ai/CUDA-L1)). So Ornith is their second
  major release; company positioning is "agents that replace manual specialized
  engineering." Simon Willison notes he "found limited information about
  DeepReinforce" beyond the CUDA paper
  ([simonwillison.net](https://simonwillison.net/2026/Jun/29/ornith/)).
- **Funding: undisclosed.** No Series A/investor announcements found; some Fusion Fund
  network affiliation for the founder, nothing confirmed for the company. Treat as a
  small, credible-researcher-led lab, not an established model vendor.
- Community traction (as of 2026-07-03):
  - GitHub `deepreinforce-ai/Ornith-1`: **~1.1k stars, 103 forks, 10 commits** (thin repo).
  - Hugging Face (last-month downloads): **Ornith-1.0-9B ≈ 1.47M**, 9B-GGUF ≈ 288k,
    **35B ≈ 665k** (page also shows 211k figure — HF stat ambiguity), 35B-GGUF ≈ 323k,
    35B-FP8 ≈ 51.8k, 397B ≈ 8.1k, 397B-FP8 ≈ 65k
    ([HF org page](https://huggingface.co/deepreinforce-ai)). Real adoption at the
    small/local end; the 397B is barely pulled.
  - HN thread (~200+ points, ~40 comments) split camps; skeptics: "These are simply
    benchmaxxed versions of either Qwen or Gemma 4"; one tester: "only found the one
    bug that almost every model found… performs poorly in a chat without tools,
    exhibiting an enthusiasm for hallucination"
    ([HN 48722052](https://news.ycombinator.com/item?id=48722052), quoted via
    [developersdigest](https://www.developersdigest.tech/blog/ornith-1-open-source-self-improving-coding-model)
    and [atcyrus](https://www.atcyrus.com/stories/ornith-1-0-agentic-coding-model)).
  - Simon Willison's hands-on (35B quantized in LM Studio): positive — competent
    multi-tool-call agent behavior on a Datasette repo task, ~103 tok/s locally
    ([simonwillison.net](https://simonwillison.net/2026/Jun/29/ornith/)).

**Verdict:** credible researcher, real small-model adoption, but a 9-day-old release
from a lab with no prior model-serving track record, vendor-only benchmarks, and
active benchmaxxing skepticism.

## 2. Licensing fine print — no landmine found

- **All released weights are MIT**, "globally accessible, and free from regional
  limitations" ([HF 9B card](https://huggingface.co/deepreinforce-ai/Ornith-1.0-9B),
  [GitHub](https://github.com/deepreinforce-ai/Ornith-1)).
- The Gemma-contamination worry is **defused**: Google released **Gemma 4 under
  Apache 2.0** (Apr 2026), explicitly dropping the old Gemma Terms of Use
  (prohibited-use policy, downstream-enforcement clauses, synthetic-data reach)
  ([VentureBeat](https://venturebeat.com/technology/google-releases-gemma-4-under-apache-2-0-and-that-license-change-may-matter),
  [Slashdot](https://tech.slashdot.org/story/26/04/02/1735238/google-announces-gemma-4-open-ai-models-switches-to-apache-20-license)).
  Qwen 3.5 is likewise Apache 2.0. Willison independently verified compatibility
  ([simonwillison.net](https://simonwillison.net/2026/Jun/29/ornith/)).
- Residual footnote, not a landmine: Apache-2.0 derivatives should carry the upstream
  Apache NOTICE/attribution even when the derivative is offered as MIT. Compliance
  burden is on DeepReinforce, not on glamfire users.
- **Base-model mapping** (per [ornith.site](https://ornith.site/)): 9B Dense ← Qwen 3.5;
  **31B Dense ← Gemma 4**; 35B MoE (~3B active) ← Qwen 3.5; 397B MoE ← Qwen 3.5.
- **Real catch: the 31B Dense is announced but has NO public checkpoint.** It is absent
  from the HF org, and its model URL returns 401. Only 9B / 35B / 397B (+ FP8/GGUF
  variants) are downloadable ([HF org](https://huggingface.co/deepreinforce-ai)).

## 3. Hosting availability NOW (2026-07-03)

- **None of the respected US serverless per-token providers serve Ornith.** Not on
  Fireworks, Together, Baseten, DeepInfra, Novita, or Parasail model libraries; not on
  OpenRouter. The HF 397B card literally shows "no inference providers deployed" with
  **33 'Ask for provider support' requests**
  ([HF 397B](https://huggingface.co/deepreinforce-ai/Ornith-1.0-397B)).
- Fringe availability:
  - **Featherless.ai** serves `deepreinforce-ai/Ornith-1.0-9B` (FP8) on its flat-rate
    subscription (from ~$10/mo), but **context capped at 32k** — unusable for serious
    agentic coding ([featherless.ai](https://featherless.ai/models/deepreinforce-ai/Ornith-1.0-9B)).
  - **Friendli.ai** lists Ornith-1.0-9B as a deployable dedicated endpoint (you pay GPU
    time, not per-token) ([friendli.ai](https://friendli.ai/models/deepreinforce-ai/Ornith-1.0-9B)).
- **Self-host is the real story** (weights: `deepreinforce-ai/Ornith-1.0-{9B,35B,397B}`
  + `-FP8` + `-GGUF` on HF). Requirements: Transformers ≥ 5.8.1, vLLM ≥ 0.19.1 or
  SGLang ≥ 0.5.9; all models 262,144-token context; reasoning model emitting
  `<think>…</think>` blocks; OpenAI-compatible tool calls.
  - **9B Dense:** ~19 GB bf16 (single 24GB card w/ headroom via FP8; ~6 GB at Q4 GGUF —
    laptop-class). Vendor says "serves comfortably on a single 80GB GPU" at full
    precision/context ([HF 9B](https://huggingface.co/deepreinforce-ai/Ornith-1.0-9B),
    [ornith.site](https://ornith.site/)).
  - **35B MoE (~3B active):** ~25 GB at Q5_K_M GGUF — runs on a MacBook Pro / single
    consumer GPU; fast because only ~3B active params
    ([ornith.site](https://ornith.site/), Willison got 103 tok/s locally).
  - **397B MoE:** ~400 GB bf16 → 8×80GB node, `tensor-parallel-size 8`; **~200 GB FP8**
    checkpoint published ([HF 397B](https://huggingface.co/deepreinforce-ai/Ornith-1.0-397B)).

## 4. Benchmark verification — vendor-only, and harness-dependent

- **No independent reproduction found as of 2026-07-03.** No Artificial Analysis
  listing; all published numbers trace to DeepReinforce's own eval runs (Terminus-2
  framework, parser=json, temp=1.0, top_p=1.0, 128K ctx, 4-hour timeout, 32 CPU cores /
  48 GB RAM, avg of 5 runs per [GitHub](https://github.com/deepreinforce-ai/Ornith-1)).
  HN testers report real-world results below benchmark expectations (hallucination in
  tool-free chat; missed bugs).
- Headline vendor numbers ([HF 397B](https://huggingface.co/deepreinforce-ai/Ornith-1.0-397B),
  [HF 35B](https://huggingface.co/deepreinforce-ai/Ornith-1.0-35B),
  [HF 9B](https://huggingface.co/deepreinforce-ai/Ornith-1.0-9B)):

| Model | SWE-bench Verified | SWE-bench Pro | TB 2.1 (Terminus-2) | TB 2.1 (Claude Code) |
|---|---|---|---|---|
| Ornith-1.0-9B | 69.4 | 42.9 | 43.1 | — |
| Ornith-1.0-35B | **75.6** | 50.4 | 64.2 | 62.8 |
| Ornith-1.0-397B | 82.4 | **62.2** | 77.5 | 78.2 |
| GLM-5.2-744B | — | **62.1** | **81.0** | **82.7** |
| DeepSeek-V4-Pro | 80.6 | 55.4 | 64 | 66.5 |
| Claude Opus 4.8 | 87.6 | 69.2 | 85 | 78.9 |

- Note even in **their own table** GLM-5.2 beats Ornith-397B on Terminal-Bench under
  both harnesses (81.0/82.7 vs 77.5/78.2) and on NL2Repo (48.9 vs 48.2); the
  "≈ GLM-5.2" claim rests on the SWE-bench Pro near-tie (62.2 vs 62.1).
- **Harness-dependence pairs (messaging gold — same model, same benchmark, different
  harness):** Terminal-Bench 2.1, Terminus-2 vs Claude Code:
  - Claude Opus 4.8: **85 → 78.9 (−6.1)**
  - Qwen3.5-397B: **53.5 → 48.6 (−4.9)**
  - Qwen3.7-Max: 73.5 → 69.8 (−3.7)
  - DeepSeek-V4-Pro: 64 → 66.5 (**+2.5**)
  - GLM-5.2: 81.0 → 82.7 (+1.7)
  - Ornith-397B: 77.5 → 78.2 (+0.7); Ornith-35B: 64.2 → 62.8 (−1.4)
  - Spread up to **6 points on the same model** purely from swapping the harness —
    direct evidence for glamfire's core thesis: *the harness changes the score*.
    (All from the vendor's own table on the
    [HF 397B card](https://huggingface.co/deepreinforce-ai/Ornith-1.0-397B).)

## 5. The scaffold-RL idea — what's internalized vs what stays external

- **Training-time mechanism** (per [MarkTechPost](https://www.marktechpost.com/2026/06/25/deepreinforce-releases-ornith-1-0-an-open-source-coding-model-family-that-learns-its-own-rl-scaffolds/),
  [ornith.site](https://ornith.site/), vendor blog): each RL step is two-stage —
  (1) conditioned on the task + the previous scaffold, the model **proposes a refined
  scaffold**; (2) conditioned on that scaffold + task, it generates a solution rollout.
  Rollout reward propagates to **both** stages (token-level GRPO, async pipeline-RL),
  so the model is optimized to author the orchestration that elicits its best answers.
  High-reward scaffolds are mutated/selected across training — per-task strategies
  emerge without hand-engineered harness design.
- **What the learned scaffold covers:** task decomposition/planning, which tools to
  call and when, retry policy, inspection of intermediate results, error handling,
  rewriting failing steps — i.e., the *inner agent loop policy and prompts*.
- **What stays outside the model (explicitly, as anti-reward-hacking trust
  boundary):** the environment, the **tool surface/definitions**, test isolation, a
  deterministic monitor (reading withheld paths or editing verification scripts ⇒ zero
  reward), and a frozen LLM judge with veto. At inference the models are ordinary
  OpenAI-compatible reasoning models (`<think>` block + well-formed tool calls) that
  "integrate into standard agent frameworks without code changes."
- **Implication for the harness-product wedge:** Ornith internalizes the *micro-loop*
  (plan/retry/tool-sequencing skill) but not the *macro-harness*: model routing,
  cost/budget enforcement, context ownership and persistence, permissions/sandboxing,
  cross-model portability, receipts/observability. Those are exactly glamfire's layer.
  If self-scaffolding models get good, they **commoditize hand-tuned per-model agent
  loops** (a threat to harnesses whose value is prompt/loop tuning) while **raising the
  value** of the model-agnostic control plane — glamfire's wedge is the latter.
  Meanwhile their own tables prove the outer harness still swings scores by ±6 pts.

## 6. Recommendation for glamfire

- **Catalog:** list Ornith-1.0-**35B** and **9B** in `glam models` now, flagged
  `self-host` / `no serverless US host` — availability is HF weights + vLLM/SGLang/
  Ollama only. Do **not** list 397B as routable (no provider; 8×80GB self-host is not a
  realistic user path) and do not list 31B (unreleased). Revisit when Fireworks /
  Together / DeepInfra pick it up (33 pending HF provider requests suggest demand).
- **Adapter:** cheap to support — OpenAI-compatible chat + tool calls + `<think>`
  blocks means the existing Qwen-style adapter path likely covers it; a conformance run
  against a local Ollama/vLLM 9B is the right first step. Worth doing as the flagship
  **local/offline tier** proof (private, $0/token, 262K ctx claimed — verify usable ctx
  at Q4/Q5 quant; Featherless caps at 32k, a hint that long-ctx serving is expensive).
- **Default workhorse (GLM 5.2): unchanged.** GLM-5.2 still wins Terminal-Bench in
  Ornith's own tables, has mature, cheap, fast serverless hosting on Fireworks, and
  Ornith has zero per-token US hosting. No routing change.
- **Budget tier (DeepSeek V4 Flash): unchanged for hosted routing** — Ornith can't be
  routed to any US pay-per-token endpoint today. But Ornith-35B (~3B active, ~25 GB
  quantized) is the strongest candidate yet for a **local-free tier below the budget
  tier** (SWE-bench Verified 75.6 vendor-claimed at laptop cost), pending independent
  verification.
- **Messaging:** cite the Terminus-2 vs Claude Code pairs (esp. Opus 4.8: 85 vs 78.9)
  in positioning material — a model vendor's own release notes demonstrating the
  harness moves scores more than many model upgrades do.

---

## Key takeaways for glamfire

- Ornith-1.0 (MIT, released 2026-06-25) is real and credible-adjacent but **vendor-
  benchmarked only**; HN skeptics call it benchmaxxed; wait for independent evals
  before trusting 35B=75.6 SWE-bench Verified.
- **No license landmine:** Gemma 4 moved to Apache 2.0 (Apr 2026), so MIT-on-top is
  clean; the Gemma-based **31B is unreleased anyway**.
- **No respected US serverless host serves it** (not Fireworks/Together/Baseten/
  DeepInfra/Novita/Parasail/OpenRouter as of 2026-07-03); the story is **self-host
  9B/35B** (35B MoE ≈ 3B active, ~25 GB quantized, 103 tok/s on a MacBook).
- Their own tables show **same model, same benchmark, ±6-point swings by harness**
  (Opus 4.8: 85 Terminus-2 vs 78.9 Claude Code) — first-party ammunition for "the
  harness changes the score."
- Self-scaffolding RL internalizes the inner loop but leaves routing, budgets,
  context, permissions external — it commoditizes per-model loop tuning and
  **strengthens** the case for a model-agnostic harness.
- Action: add 9B/35B to the catalog as a self-host/local tier, run adapter conformance
  against local vLLM/Ollama, keep GLM-5.2 default and DeepSeek V4 Flash budget tier
  unchanged.

## Sources

- https://github.com/deepreinforce-ai/Ornith-1
- https://huggingface.co/deepreinforce-ai
- https://huggingface.co/deepreinforce-ai/Ornith-1.0-9B
- https://huggingface.co/deepreinforce-ai/Ornith-1.0-35B
- https://huggingface.co/deepreinforce-ai/Ornith-1.0-397B
- https://ornith.site/
- https://simonwillison.net/2026/Jun/29/ornith/
- https://news.ycombinator.com/item?id=48722052
- https://www.marktechpost.com/2026/06/25/deepreinforce-releases-ornith-1-0-an-open-source-coding-model-family-that-learns-its-own-rl-scaffolds/
- https://www.developersdigest.tech/blog/ornith-1-open-source-self-improving-coding-model
- https://www.atcyrus.com/stories/ornith-1-0-agentic-coding-model
- https://venturebeat.com/technology/google-releases-gemma-4-under-apache-2-0-and-that-license-change-may-matter
- https://tech.slashdot.org/story/26/04/02/1735238/google-announces-gemma-4-open-ai-models-switches-to-apache-20-license
- https://featherless.ai/models/deepreinforce-ai/Ornith-1.0-9B
- https://friendli.ai/models/deepreinforce-ai/Ornith-1.0-9B
- https://x.com/alby13/status/2070275969575981567
- https://github.com/deepreinforce-ai/CUDA-L1
- https://www.testingcatalog.com/deepreinforce-releases-ornith-1-0-open-source-coding-models/
- https://decrypt.co/372361/ornith-open-source-coding-model-built-for-agents
