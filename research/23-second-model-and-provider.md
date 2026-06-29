# 23 — Second open-weight model + second inference provider

**Purpose:** Ground glamfire's choice of (a) a *second open-weight model* to sit
alongside GLM-5.2 (Qwen strongly preferred, DeepSeek as a cross-family fallback) and
(b) a *second US inference provider* — a respected, US-hosted, shared-GPU peer to
Fireworks AI that can serve **both** GLM-5.2 and the chosen second model behind an
OpenAI-compatible surface.

**Date:** 2026-06-29. Prices/IDs move fast; everything here is dated and flagged where
unverified. Verify exact IDs/prices against each provider's live model page before
wiring an adapter.

**Baseline being matched (from the existing `fireworks-glm` path):** Fireworks serves
GLM-5.2 at FP8, OpenAI- **and** Anthropic-compatible, zero-retention, not a router,
~**$1.40 in / $4.40 out** per 1M (same list price Fireworks used for GLM-5.1 —
[Fireworks coding roundup](https://fireworks.ai/blog/best-llms-for-coding)). That is the
bar.

---

## 1. The second model — Qwen for a coding/agentic harness

### TL;DR pick
- **Capability pick: `Qwen/Qwen3-Coder-Next`** (Apache-2.0, open weights) — purpose-built
  for coding *agents* and CLI/IDE scaffolds, which is exactly glamfire's dogfooding
  workload. Cheap to serve (80B total / **3B active** MoE), 256K context, FP8 checkpoint
  shipped by Qwen.
- **Broadly-served alternate: `Qwen/Qwen3.6-35B-A3B`** (Apache-2.0, Apr 2026) — newer,
  general+agentic, also 3B-active MoE, 262K→1M context; pick this if a target provider
  lists it but not Coder-Next.
- **Cross-family fallback: DeepSeek** — `deepseek-ai/DeepSeek-V3.2` (open) or the newer
  **DeepSeek-V4** line (V4-Pro / V4-Flash, MIT). DeepSeek-V4-Pro is currently the top
  open-weight coder by aggregate index.

### Why Qwen3-Coder-Next over the bigger Qwen flagships
Qwen's 2026 "Plus/Max" models (`qwen3p6-plus`, `qwen3p7-plus`) are **closed/licensed
weights, API-only** — they fail glamfire's open-weight requirement outright
([Fireworks: Qwen 3.7 Plus](https://fireworks.ai/blog/qwen-3p7-plus) confirms "The Plus
weights are not on HuggingFace. They are licensed"). The open-weight Qwen coder line is
the relevant set:

| Model | Open license | Params | Context | Tool calling | Notes |
|---|---|---|---|---|---|
| **Qwen3-Coder-Next** | Apache-2.0 | 80B total / **3B active** MoE (hybrid Gated DeltaNet + Gated Attention + MoE) | **256K** native | Yes — RL-trained for Qwen-Code, Claude-Code, Cline, Kilo, Trae, Cline; **non-thinking** (no `<think>` blocks) | Released **2026-02-04**. SWE-Bench Verified **70.6** ([Qwen3-Coder-Next report](https://arxiv.org/html/2603.00729v1), [MarkTechPost](https://www.marktechpost.com/2026/02/03/qwen-team-releases-qwen3-coder-next-an-open-weight-language-model-designed-specifically-for-coding-agents-and-local-development/)) |
| Qwen3.6-35B-A3B | Apache-2.0 | 35B total / **3B active** MoE | 262K → ~1M (YaRN) | Yes; thinking + non-thinking modes | Released **2026-04-16**, BF16 on HF ([Qwen blog](https://qwen.ai/blog?id=qwen3.6-35b-a3b), [HF card](https://huggingface.co/Qwen/Qwen3.6-35B-A3B)) |
| Qwen3-Coder-480B-A35B-Instruct | Apache-2.0 | 480B total / 35B active MoE | 256K → 1M (YaRN) | Yes; Claude-Sonnet-4-level tool fluency claimed | Older flagship; heavier/pricier to serve. Several providers (incl. Baseten) have **deprecated** its turnkey serverless API in favor of dedicated deployments ([Baseten changelog](https://www.baseten.co/resources/changelog/model-api-deprecation-qwen3-coder-480b-a35b-instruct/)) |

**Capability vs GLM-5.2 (the workhorse):** GLM stays ahead on the hardest agentic
coding. On SWE-Bench Verified, Qwen3-Coder-Next = **70.6**, roughly tied with
DeepSeek-V3.2 (70.2, 671B) and **below GLM-4.7 (74.2)**; GLM-5.2 is a further step up
from the GLM-4.x line ([report](https://arxiv.org/html/2603.00729v1),
[DeepInfra GLM-5.2](https://deepinfra.com/zai-org/GLM-5.2)). But Qwen3-Coder-Next wins
decisively on **cost-per-token and latency** (3B active) and on **SWE-Bench Pro** (44.3
vs GLM-4.7 40.6). So the natural glamfire routing story is: **GLM-5.2 = default capable
workhorse; Qwen3-Coder-Next = cheaper/faster second tier for high-volume, tool-heavy
agent loops**, with frontier escalation above both. This fits the spec's "route each
task to the cheapest capable model" thesis cleanly.

### Model IDs as served (verify live)
- **Fireworks:** open-weight Qwen coder models use `accounts/fireworks/models/<slug>`
  (e.g. `accounts/fireworks/models/qwen3-coder-30b-a3b-instruct` is live —
  [Fireworks model page](https://fireworks.ai/models/fireworks/qwen3-coder-30b-a3b-instruct)).
  A Fireworks serverless listing + price for **Qwen3-Coder-Next** specifically could
  **not be confirmed** as of this date — **flag: verify on
  <https://fireworks.ai/models>** before assuming the primary provider carries it. Qwen's
  own ecosystem notes a "FireworksFast" variant, so availability is likely but unproven.
- **Together AI:** `Qwen/Qwen3-Coder-Next` exists as a model page, FP8, 262K, listed as
  **Code/Chat** — **but Together's page states it is "not available on Together's
  Serverless API"**; you must stand up a **dedicated endpoint** for it
  ([Together model page](https://www.together.ai/models/qwen3-coder-next)). Aggregators
  list a Together FP8 blended ~$0.68/1M @ ~127 t/s, which may reflect a dedicated/Turbo
  deployment — treat as **unconfirmed for serverless**.
- **Baseten:** Qwen family is in the library; Qwen3-Coder-Next is reachable via
  **Dedicated Deployment** (sglang/vLLM, OpenAI-compatible), not a turnkey pay-per-token
  Model API ([Baseten Qwen family](https://www.baseten.co/library/family/qwen/)).
- **DeepInfra / Parasail / Novita:** serverless FP8 available. Artificial Analysis
  currently tracks **Parasail (FP8, $0.15 in / $0.80 out, 98 t/s, 1.15s TTFT)**,
  **Novita (FP8, $0.20 / $1.50, 179 t/s)**, **Amazon Bedrock ($0.50 / $1.20)**
  ([AA providers](https://artificialanalysis.ai/models/qwen3-coder-next/providers)).
  Qwen's reference list price is **$0.11 in / $0.80 out** per 1M
  ([pricepertoken](https://pricepertoken.com/pricing-page/model/qwen-qwen3-coder-next)).
  Official FP8 checkpoint: [`Qwen/Qwen3-Coder-Next-FP8`](https://huggingface.co/Qwen/Qwen3-Coder-Next-FP8).

> **Reality check that shapes everything below:** Qwen3-Coder-Next is *new* and its
> turnkey **serverless** footprint on the most-trusted US hosts is still thin —
> Together and Baseten currently want a **dedicated endpoint** for it. If glamfire needs
> a single shared-GPU serverless endpoint that serves **both** GLM-5.2 *and* the second
> Qwen pay-per-token **today**, the model choice and provider choice must be
> co-optimized (see §2 recommendation).

### DeepSeek fallback (cross-family)
- **`deepseek-ai/DeepSeek-V3.2`** — open weights, 671B MoE, ~SWE-Bench Verified 70.2;
  widely served. Safe, well-supported fallback.
- **DeepSeek-V4** line — `deepseek-v4-pro` (MIT, 1M context, top open AA coding index
  ~47.5, Terminal-Bench-Hard leader) and `deepseek-v4-flash` (MIT, 1M, ~$0.14/$0.28 on
  the DeepSeek API) ([Fireworks roundup](https://fireworks.ai/blog/best-llms-for-coding),
  [DeepInfra V4-Pro](https://deepinfra.com/blog/deepseek-v4-pro-deepinfra)). DeepSeek-V4-Pro
  is on Fireworks at `deepseek-v4-pro` (~$1.74/$3.48). Use DeepSeek if a target provider
  lacks Qwen3-Coder-Next but has DeepSeek (most do).

---

## 2. The second provider — peer to Fireworks that serves both models

Evaluated against the user's shortlist. All are OpenAI-compatible; the differentiators
are **jurisdiction, quantization, retention, and whether they actually serve both
models on shared GPUs.**

### Together AI
- **Jurisdiction:** US company; SOC 2 Type 2 audited
  ([Together SOC 2](https://www.together.ai/blog/soc-2-compliance)); HIPAA + BAA.
- **Self-serves weights, not a router.** Serverless + dedicated endpoints.
- **Retention:** default logging, but an explicit **Zero Data Retention (ZDR)** opt-in
  (Settings → Profile) under which prompts/outputs are not stored or trained on
  ([Together privacy](https://www.together.ai/privacy)).
- **Compat:** OpenAI Chat Completions **and** Anthropic Messages (beta) — same dual
  surface as Fireworks. Base URL `https://api.together.xyz/v1`.
- **Models:** **GLM-5.2 serverless** as `zai-org/GLM-5.2` — **but the model page lists it
  at FP4**, 256K ctx, $1.40 in / **$0.26 cached** / $4.40 out
  ([Together GLM-5.2](https://www.together.ai/models/glm-52)). **Flag:** FP4 GLM-5.2 is a
  quantization *downgrade* vs Fireworks FP8 — verify whether Together offers an FP8 GLM
  tier (their "Turbo"=FP8 convention exists but the GLM page said FP4). **Qwen3-Coder-Next
  is dedicated-endpoint-only**, not serverless.
- **Verdict:** Best *posture* twin of Fireworks (dual API, ZDR, SOC2/HIPAA, owns serving),
  but **fails "both on shared-GPU serverless"** today (Qwen Coder-Next = dedicated) and
  serves GLM-5.2 at FP4.

### Baseten
- **Jurisdiction:** US; **SOC 2 Type II** + HIPAA
  ([Baseten Model APIs](https://www.baseten.co/products/model-apis/)).
- **Self-serves weights (Baseten Inference Stack), not a router.**
- **Retention:** **never stores inference inputs or outputs** — strongest, most
  Fireworks-like zero-retention statement of the set
  ([Baseten Model APIs](https://www.baseten.co/products/model-apis/)).
- **Compat:** OpenAI Chat Completions **and** Anthropic Messages (beta), function calling.
  Base URL `https://inference.baseten.co/v1`.
- **Models:** **GLM-5.2 live on Model APIs** (FP8-class, OpenAI-compatible, list ~$0.96/1M
  "max" tier) — Baseten is explicitly benchmarked head-to-head with Fireworks/Telnyx on
  GLM-5.2 ([Baseten GLM-5.2](https://www.baseten.co/library/glm-52/),
  [Telnyx benchmark page](https://telnyx.com/resources/glm-5-2-inference-benchmarks-provider)).
  **Qwen3-Coder-Next** = **Dedicated Deployment** (their turnkey Qwen3-Coder-480B Model
  API was *deprecated* 2026-02-06).
- **Verdict:** Best **trust + FP8 + brand** match to Fireworks for **GLM-5.2**; but the
  second Qwen needs a dedicated deployment, so not a pure pay-per-token "both" endpoint.

### Telnyx
- **Jurisdiction:** US telco; runs models on **owned GPU infrastructure**, **in-region by
  default** (data stays where the user is) — strong jurisdiction/privacy story
  ([Telnyx Inference](https://telnyx.com/products/inference)).
- **Self-serves weights, not a router.** OpenAI-compatible; base URL
  `https://api.telnyx.com/v1` (Telnyx key).
- **Models:** **GLM-5.2 live** as `zai-org/GLM-5.2` (1M ctx). **No Qwen3-Coder / Coder-Next
  in the catalog** — it carries `Kimi-K2.6`, `GLM-5.1-FP8`, `MiniMax-M3` and (older)
  Qwen3-235B, not the coder line ([Telnyx models](https://developers.telnyx.com/docs/inference/models)).
- **Verdict:** Good US/privacy posture and a real GLM-5.2 host, but **fails the "serves
  both" test** — no Qwen coder model. Out for this purpose (would only work if the second
  model were Qwen3-235B or Kimi/MiniMax instead).

### DeepInfra
- **Jurisdiction:** US; **SOC 2 + ISO 27001**; **zero data retention** (logs only request
  metadata) ([DeepInfra data privacy](https://deepinfra.com/docs/data)).
- **Self-serves 150+ open models, not a router.** OpenAI-compatible; base URL
  `https://api.deepinfra.com/v1/openai`.
- **Models:** **GLM-5.2 serverless** as `zai-org/GLM-5.2` (1M ctx) — **but served FP4**
  (DeepInfra confirms GLM-5.1 is fp4; GLM-5.2 follows the same pattern —
  [DeepInfra GLM-5.1](https://deepinfra.com/blog/glm-5-1-deepinfra-agentic-engineering-model)).
  Qwen line incl. Coder-Next FP8 is in their wheelhouse (official `Qwen3-Coder-Next-FP8`
  exists; DeepInfra routinely lists new Qwen serverless). **Cheapest** of the set.
- **Verdict:** The one host most likely to serve **both models on shared-GPU
  serverless pay-per-token today** — at the cost of the **FP4 GLM caveat** the user
  already flagged. Cleanest single "both" endpoint, weakest on FP8 fidelity for GLM.

### Recommendation

There is **no perfect single twin** of Fireworks that serves *both* GLM-5.2 *and*
Qwen3-Coder-Next on shared-GPU serverless at FP8 with zero retention today. The evidence
splits, so recommend a **tiered** choice:

1. **Primary respected peer → Baseten.** Closest match to Fireworks in *posture* (zero
   inputs/outputs retention, SOC 2 Type II + HIPAA, FP8 GLM-5.2, OpenAI **+** Anthropic
   surfaces, owns its serving). Use Baseten as the second **GLM-5.2** host immediately;
   serve **Qwen3-Coder-Next via a Baseten Dedicated Deployment** when the second model is
   needed. This keeps FP8 fidelity and the strongest privacy story.
2. **Pragmatic "both on serverless" fallback → DeepInfra.** When you want a *single*
   pay-per-token endpoint serving GLM-5.2 **and** Qwen3-Coder-Next right now, DeepInfra is
   the answer — accept the **GLM-5.2 FP4** quantization caveat (document it in *Current
   reality*; it is a real quality/quant downgrade vs Fireworks/Baseten FP8).
3. **Broad alternative → Together AI.** Best dual-API enterprise posture, but only a
   partial fit until Qwen3-Coder-Next reaches its serverless tier and/or GLM-5.2 is
   offered at FP8.

**Co-optimization note:** if glamfire prefers a single shared-GPU peer that serves the
second model **serverless** *and* at FP8 alongside GLM, the lowest-friction move is to
pick **Qwen3.6-35B-A3B** or keep **DeepSeek-V3.2/V4** as the "second model" on that peer,
since Qwen3-Coder-Next's turnkey serverless footprint on the most-trusted US hosts is
still maturing. Keep Qwen3-Coder-Next as the capability target and promote it the moment
Baseten/Together/Fireworks expose it serverless.

**Avoid (confirmed):** OpenRouter (router; can silently land on Z.ai-China or FP4
backends), Nebius (ex-Yandex jurisdiction), SiliconFlow/Novita (China-linked — note Novita
*does* serve Qwen3-Coder-Next FP8 but is excluded on jurisdiction).

---

## 3. Adapter implications — generalizing `fireworks-glm` to a provider-parameterized adapter

All six relevant hosts (Fireworks, Together, Baseten, Telnyx, DeepInfra, Parasail) expose
an **OpenAI-compatible `/v1/chat/completions`** with **tool/function calling**. So the
existing OpenAI-compatible `fireworks-glm` adapter can be generalized into one
**`openai-compatible` adapter parameterized by `{baseURL, apiKey, modelIdMap}`**. Quirks
to encode:

- **Base URLs differ — must be a parameter:**
  - Fireworks: `https://api.fireworks.ai/inference/v1`
  - Together: `https://api.together.xyz/v1`
  - Baseten (Model APIs): `https://inference.baseten.co/v1`
  - DeepInfra: `https://api.deepinfra.com/v1/openai`
  - Telnyx: `https://api.telnyx.com/v1`
- **Model-id namespacing differs — needs a per-provider map:**
  - Fireworks: `accounts/fireworks/models/<slug>` (e.g. `.../glm-5p2`, `.../qwen3-coder-...`).
  - Together / DeepInfra / Telnyx: **HF-style** `org/name` (e.g. `zai-org/GLM-5.2`,
    `Qwen/Qwen3-Coder-Next`).
  - Baseten Model APIs: short slugs (`glm-5.2`) **or** per-deployment endpoint IDs for
    Dedicated Deployments. Coder-Next will be a **deployment-specific** model id, not a
    shared slug.
  - → glamfire should map a *logical* model name (e.g. `glm-5.2`, `qwen3-coder-next`) to a
    provider-specific id, not hardcode provider strings.
- **Auth:** all use `Authorization: Bearer <key>` — uniform. Only the key source/env var
  differs per provider.
- **Anthropic Messages surface (for Claude-Code-style scaffolds):** available on
  **Fireworks, Together, Baseten** (beta); **not** assumed on DeepInfra/Telnyx — keep the
  Anthropic path a per-provider capability flag, default OpenAI-only.
- **Reasoning content:** **GLM-5.2** emits reasoning/`reasoning_content` and supports
  effort levels; **Qwen3-Coder-Next is non-thinking** (no `<think>` blocks). The adapter
  must tolerate presence/absence of `reasoning_content` and not assume a thinking trace.
- **Tool-call streaming:** vLLM/SGLang-backed hosts (Together, DeepInfra, Baseten
  dedicated) stream `tool_calls` deltas with an `index`; reassemble by index. Minor
  differences in when arguments are flushed — the conformance suite should assert
  reassembled tool-call JSON parity rather than byte-stream equality across providers.
- **Quantization is not in the API** — it is a provider/deployment property. glamfire
  should **record the served quant per provider×model** (Fireworks GLM-5.2 FP8; Baseten
  FP8; DeepInfra/Together GLM-5.2 **FP4**; Qwen3-Coder-Next FP8 everywhere) in config so
  routing/quality expectations are explicit, since FP4 GLM is a real fidelity downgrade.
- **Conformance gating:** run the existing adapter conformance suite against each new
  `{provider, model}` pair before marking it supported — especially tool-call round-trips
  and long-context (256K/1M) handling, which is where FP4 and dedicated-vs-serverless
  backends diverge.

---

## Key takeaways for glamfire

- **Second model — capability pick: `Qwen/Qwen3-Coder-Next` (Apache-2.0, 80B/3B-active,
  256K, FP8, non-thinking, RL-tuned for coding agents).** It is the right *dogfooding*
  model: cheap, fast, tool-fluent. It trails GLM-5.2 on the hardest agentic coding
  (SWE-Bench Verified 70.6 vs GLM-4.7 74.2, GLM-5.2 higher) but wins on cost/latency —
  perfect "cheaper second tier" under the route-to-cheapest-capable thesis.
- **Qwen "Plus/Max" are closed-weight** and disqualified. The open Qwen coder line is
  Coder-Next → Qwen3.6-35B-A3B → Qwen3-Coder-480B.
- **Cross-family fallback: DeepSeek-V3.2 (open) or DeepSeek-V4 (MIT).** DeepSeek-V4-Pro is
  the strongest open coder by aggregate index and is broadly served — keep it as the
  fallback when a provider lacks Qwen3-Coder-Next.
- **No host is a perfect Fireworks twin for *both* models on FP8 serverless today.** Pick
  by priority:
  - **Baseten** = primary respected peer (zero retention, SOC2 Type II + HIPAA, **FP8**
    GLM-5.2, OpenAI+Anthropic) — Qwen Coder-Next via dedicated deployment.
  - **DeepInfra** = pragmatic single serverless endpoint for **both** today — accept the
    **GLM-5.2 FP4** caveat.
  - **Together** = best enterprise posture/dual-API, but Qwen Coder-Next is
    dedicated-only and GLM-5.2 listed at FP4.
  - **Telnyx** = good US/owned-GPU/privacy story and a real GLM-5.2 host, but **no Qwen
    coder model** → fails "both."
- **If you want one clean shared-GPU serverless FP8 peer serving both, co-optimize the
  model choice:** use **Qwen3.6-35B-A3B** or **DeepSeek** as the second model on that peer
  now, and promote Qwen3-Coder-Next once Baseten/Together/Fireworks expose it serverless.
- **Adapter:** generalize `fireworks-glm` into one OpenAI-compatible adapter parameterized
  by `{baseURL, apiKey, logical→provider model-id map}`. Uniform Bearer auth; per-provider
  base URLs; HF-style vs `accounts/...` vs Baseten-slug id namespacing; gate the Anthropic
  surface and `reasoning_content` behind capability flags; record served quantization per
  provider×model; gate every new pair through the conformance suite (tool calls +
  long-context).
- **Hard avoids stand:** OpenRouter (router/FP4/China routing), Nebius (jurisdiction),
  SiliconFlow/Novita (China-linked).

---

## Sources
- https://fireworks.ai/blog/best-llms-for-coding
- https://fireworks.ai/blog/qwen-3p7-plus
- https://fireworks.ai/models/fireworks/qwen3-coder-30b-a3b-instruct
- https://fireworks.ai/models
- https://arxiv.org/html/2603.00729v1 (Qwen3-Coder-Next Technical Report)
- https://www.marktechpost.com/2026/02/03/qwen-team-releases-qwen3-coder-next-an-open-weight-language-model-designed-specifically-for-coding-agents-and-local-development/
- https://qwen.ai/blog?id=qwen3-coder-next
- https://qwen.ai/blog?id=qwen3.6-35b-a3b
- https://huggingface.co/Qwen/Qwen3.6-35B-A3B
- https://huggingface.co/Qwen/Qwen3-Coder-Next
- https://huggingface.co/Qwen/Qwen3-Coder-Next-FP8
- https://pricepertoken.com/pricing-page/model/qwen-qwen3-coder-next
- https://artificialanalysis.ai/models/qwen3-coder-next/providers
- https://www.together.ai/models/qwen3-coder-next
- https://www.together.ai/models/glm-52
- https://www.together.ai/blog/soc-2-compliance
- https://www.together.ai/privacy
- https://www.baseten.co/products/model-apis/
- https://www.baseten.co/library/glm-52/
- https://www.baseten.co/library/family/qwen/
- https://www.baseten.co/resources/changelog/model-api-deprecation-qwen3-coder-480b-a35b-instruct/
- https://www.baseten.co/resources/changelog/glm-52-available-on-baseten/
- https://telnyx.com/products/inference
- https://developers.telnyx.com/docs/inference/models
- https://telnyx.com/resources/glm-5-2-inference-benchmarks-provider
- https://deepinfra.com/zai-org/GLM-5.2
- https://deepinfra.com/docs/data
- https://deepinfra.com/blog/glm-5-1-deepinfra-agentic-engineering-model
- https://deepinfra.com/blog/deepseek-v4-pro-deepinfra
