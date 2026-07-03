# 25 — Open-Model & Inference-Provider Landscape (as of 2026-07-03)

Evergreen brief seeding the `glam models` catalog. Every price cited with source and
access date. All prices are USD per 1M tokens, serverless/on-demand, standard tier
unless noted. Accessed 2026-07-03 unless noted.

---

## A. Top-tier open-weight models (current generation, July 2026)

### DeepSeek V4 family — current DeepSeek flagship (R2 does NOT exist)
- **Released 2026-04-24, MIT license**, weights on Hugging Face/ModelScope.
  Two variants:
  - **DeepSeek-V4-Pro** — 1.6T total params, **49B active** MoE.
  - **DeepSeek-V4-Flash** — 284B total, **13B active** MoE.
- Both: **1M-token context, 384K max output**; hybrid attention (Compressed Sparse
  Attention + Heavily Compressed Attention) for long-context efficiency.
- **DeepSeek R2 has never been released** (as of June 2026) — V4 is the 2026 flagship.
  Do not list "R2" in any catalog.
- First-party API (China-hosted): V4-Pro **$0.435 in / $0.87 out** after a 75% price
  cut made **permanent on 2026-05-22**; V4-Flash **$0.14 / $0.28**; cache-hit input
  ~$0.0036–0.004; off-peak (16:30–00:30 UTC) discounts stack.
- Best at: frontier-class reasoning + coding at commodity cost; V4-Flash is the
  cheapest 1M-context capable model anywhere.
- Commonly served FP8 (Fireworks, Baseten) and FP4 (DeepInfra "Max" routes).

### GLM-5.2 (Zhipu / Z.ai) — top open model on intelligence indexes
- **Released 2026-06-16, MIT license**, weights on Hugging Face. **753B MoE**,
  **1M-token context** (Fireworks serves 1,048,576 ctx).
- Benchmarks: **SWE-bench Pro 62.1** (vs GPT-5.5's 58.6), **Terminal-Bench 2.1: 81.0**
  (Claude Opus 4.8: 85.0), long-horizon task completion 74.4% (GPT-5.5 72.6%). Ranked
  **#1 open-weights model** on Artificial Analysis Intelligence Index.
- Best at: agentic/long-horizon coding, terminal agents, design/frontend. This is the
  model glamfire already targets as default workhorse — the choice holds.
- Served FP8 by Z.ai, Fireworks, Novita, GMI, SiliconFlow; **FP4 by DeepInfra, Nebius,
  Parasail (NVFP4)** — FP4 routes are cheaper but measurably worse for coding and some
  cap output (DeepInfra OpenRouter route caps output at 32,768 tokens).

### Kimi K2.6 / K2.7 Code (Moonshot AI)
- **K2.6**: released 2026-04-20, **Modified MIT**, 1T total / **32B active** MoE.
  **SWE-bench Verified 80.2, SWE-bench Pro 58.6** (first open model to lead SWE-bench
  Pro at release), HLE-with-tools 54.0, Toolathlon 50.0. Excellent tool-use stamina
  (12-hour autonomous runs reported).
- **K2.7 Code**: released **2026-06-12**, same 1T/32B-active architecture, coding-
  specialized, **~30% fewer reasoning tokens than K2.6** — cheaper long agent sessions.
- Best at: agentic tool use, long autonomous coding sessions.

### Qwen family (Alibaba) — best small/mid open models
- **Qwen3.5** (2026-02-16, Apache-2.0): flagship 397B total / 17B active; 27B dense
  ties GPT-5 mini on SWE-bench Verified (72.4).
- **Qwen3-Coder-Next** (Feb 2026, open weights): 80B total / **3B active**, >70%
  SWE-bench Verified with SWE-Agent scaffold — absurd cost-efficiency for coding.
- **Qwen3.6** (Apr 2026): incl. open **Qwen3.6-35B-A3B**. **Qwen3.7-Max (June 2026) is
  closed**; Fireworks serves a "Qwen 3.7 Plus" endpoint ($0.40/$1.60) — verify
  open-weight status before cataloging it as open.
- Best at: cheapest capable tier, local/edge, high-QPS routing and summarization.

### MiniMax M2.5 / M3
- **M2.5** (2026-02-12, weights fully open on HF): 230B total / **10B active**, 205K
  context. **SWE-bench Verified 80.2**, Multi-SWE-Bench 51.3, BrowseComp 76.3 — first
  open model past Claude Sonnet tier. Priced **$0.30 / $1.20** first-party.
- **M3** (2026-06-01, open weights): multimodal (text+image+video in), **1M context**,
  MiniMax Sparse Attention (9× faster prefill, 15× faster decode at long context).
- Best at: cheap agentic work, office-document workflows, multimodal at rock-bottom cost.

### Llama 4 (Meta) — fading
- Llama 4 Scout (109B/17B active, 10M ctx) and Maverick (400B/17B active), Apr 2025,
  Llama community license (not OSI). **Behemoth effectively shelved** — never released.
  No Llama 4.x refresh through mid-2026; Llama is no longer benchmark-competitive with
  the Chinese open flagships. Keep for compatibility only.

### Mistral Large 3
- **mistral-large-2512** (Dec 2025), **Apache-2.0**, 675B total / 41B active MoE.
  #2 OSS non-reasoning on LMArena at release. The only US/EU-aligned open flagship;
  useful when customers exclude Chinese-origin weights. Available on Azure AI Foundry.

---

## B. Providers (US-based, on-demand)

### Fireworks AI — glamfire default provider (confirmed sound)
- US (San Francisco). Serverless + dedicated; FP8 serving on flagships.
- Prices (docs.fireworks.ai/serverless/pricing, accessed 2026-07-03):
  - **GLM 5.2: $1.40 / $4.40** (Priority $1.75/$5.50); GLM 5.1 same standard price.
  - **DeepSeek V4 Pro: $1.74 / $3.48**; **DeepSeek V4 Flash: $0.14 / $0.28**.
  - **Kimi K2.7 Code and K2.6: $0.95 / $4.00**.
  - **Qwen 3.7 Plus: $0.40 / $1.60**; **MiniMax M3: $0.30 / $1.20**.
  - Size-based for unlisted models: <4B $0.10, 4–16B $0.20, >16B $0.90 per 1M.
  - **Batch = 50% of serverless**; cached input ≈ 20% of standard rate.
- Model IDs: `accounts/fireworks/models/glm-5p2`, `.../deepseek-v4-pro`,
  `.../deepseek-v4-flash`, `.../kimi-k2p6`, etc. Tool calling / function calling
  supported on DeepSeek V4 and GLM lines. ~329 t/s on GLM-5.2 (Artificial Analysis).
- Free tier: $1 signup credit only.

### Together AI
- US (San Francisco); owns large NVIDIA GPU clusters.
- **DeepSeek V4 Pro $2.10 / $4.40** (cached input $0.20 — 10.5× discount);
  **Kimi K2.6 $1.20 / $4.50**; **GLM-5.2 $1.40 / $4.40**. Fastest measured GLM-5.2
  throughput of the big serverless hosts (374.6 t/s per Artificial Analysis).

### DeepInfra — cheapest, but FP4
- US (Palo Alto). Aggressive pricing, typically **FP4** on flagships.
- **DeepSeek V4 Pro $1.74 / $3.48** (cached $0.145); **Kimi K2.6 (FP4) $0.75 / $3.50**;
  **GLM-5.2 (FP4) ~$0.93–0.95 / $3.00**, but low throughput (~40 t/s) and the
  OpenRouter route caps output at 32K. Use for cost-floor tiers where FP4 quality is
  acceptable; not for the default coding path.

### Baseten
- US (San Francisco). Model APIs + dedicated GPUs (H100 $0.10833/min, B200
  $0.16633/min, scale-to-zero). **DeepSeek V4 $1.74 / $3.48; Kimi K2.7 Code & K2.6
  $0.95 / $4.00; GLM 4.7 $0.60 / $2.20**; serves GLM-5.2 (294.6 t/s). Production-
  reliability reputation is strong.

### Groq
- US; own LPU silicon. Catalog: Llama, DeepSeek R1 distills, GPT-OSS, **Kimi K2
  ($1.00 / $3.00)**, Qwen. 300–476 t/s. Persistent free tier (Llama 3.3 70B, Llama 4
  Scout, Qwen3 32B, Kimi K2). No GLM-5.x or DeepSeek V4 as of July 2026 — speed
  niche, not flagship coverage.

### Cerebras
- US; wafer-scale engines, ~3,000 t/s class. **Free tier: 1M tokens/day, no card**
  (Llama 3.3 70B, Qwen3 32B/235B, GPT-OSS-120B). Great for speed-critical small-model
  routing; no Chinese flagships.

### SambaNova
- US; RDU hardware. Intel acquisition talks failed; raised **$350M (Feb 2026, Vista-led,
  Intel co-investing)** — going concern resolved for now. SambaCloud active; added
  **Anthropic Messages API compatibility 2026-07-02**. Persistent free tier. Catalog
  skews Llama/Qwen/Gemma.

### Parasail
- US inference cloud. Serves GLM-5 line (FP8 blended ~$0.66/1M on GLM-5; GLM-5.2 as
  NVFP4). Cheap capacity-broker model; fine as overflow, verify quant per route.

### Lambda
- US; owns datacenters (GPU cloud first, inference API second). Open-model API exists
  but catalog/pricing less prominent than the above; treat as dedicated-capacity option.

### Novita AI
- **US (San Francisco HQ)** despite common assumption otherwise. Serves **GLM-5.2 in
  FP8**; broad cheap catalog (Llama/Qwen/DeepSeek/GLM/gpt-oss). Reputation: budget
  tier, improving.

### Hyperscalers
- **AWS Bedrock** (Feb 2026, "Project Mantle" engine): added **DeepSeek V3.2, MiniMax
  M2.1, GLM 4.7 + 4.7 Flash, Kimi K2.5, Qwen3 Coder Next** as fully managed open
  models. **DeepSeek V4 and GLM-5.x not yet on Bedrock** as of July 2026 — hyperscalers
  lag the current generation by ~1 release.
- **Azure AI Foundry**: DeepSeek on Western-managed infra; Mistral 3 / Large 3 as
  first-class partner models.
- **Google Vertex**: serves GLM-5 line (blended ~$0.59/1M per Artificial Analysis).
- Use hyperscalers for enterprise-compliance escalation, not price.

### Other FP8 GLM-5.2 hosts worth watching
- **GMI Cloud (US)**: cheapest FP8 GLM-5.2 at **$1.12 / $3.52** (~$0.72 blended),
  329.9 t/s. Less battle-tested than Fireworks/Together but undercuts list by 20%.

---

## C. Price signals (July 2026)

- **DeepSeek's permanent 75% V4-Pro cut (2026-05-22)** → $0.435/$0.87 first-party.
  US hosts charge 4× that ($1.74/$3.48) — the "US-hosting premium" on DeepSeek is
  now the single biggest arbitrage in the catalog. Expect US host prices to fall.
- **GLM-5.2 launched at $1.40/$4.40** and within 3 weeks had ~20 OpenRouter provider
  brands, sub-list routes at $0.93–1.20 input. Price erosion on GLM-5.2 is fast;
  re-poll monthly.
- **Batch**: Fireworks bills batch at 50% of serverless. DeepSeek first-party off-peak
  window (16:30–00:30 UTC) stacks with caching.
- **Prompt caching**: Together V4-Pro cached input $0.20 (10.5×), Fireworks ~20% of
  standard, DeepInfra $0.145–0.15. glamfire's router should treat cached-input price
  as a first-class routing signal.
- **Free tiers**: Cerebras 1M tokens/day (persistent); SambaNova persistent free tier;
  Groq free tier; Fireworks $1 signup credit only.
- **MiniMax pricing shock**: M2.5/M3 at $0.30/$1.20 — output at 1/10–1/20 of
  comparable closed models; "$1/hour at 100 TPS" framing.

---

## D. Recommended default catalog (cheapest-capable ordering)

Machine-usable version: `research/25-registry-seed.json`.

| # | Model | Provider / endpoint | $/1M in | $/1M out | Quant | Ctx | Capabilities |
|---|-------|--------------------|---------|----------|-------|-----|--------------|
| 1 | DeepSeek V4 Flash | Fireworks `accounts/fireworks/models/deepseek-v4-flash` | 0.14 | 0.28 | FP8 | 1M | tools, json, long_context |
| 2 | MiniMax M3 | Fireworks `accounts/fireworks/models/minimax-m3` | 0.30 | 1.20 | FP8 | 1M | tools, json, vision, long_context |
| 3 | Qwen 3.7 Plus | Fireworks `accounts/fireworks/models/qwen3p7-plus` | 0.40 | 1.60 | FP8 | 256K | tools, json (verify open-weight status) |
| 4 | Kimi K2.6 (budget) | DeepInfra `moonshotai/Kimi-K2.6` | 0.75 | 3.50 | **FP4** | 256K | tools, json — FP4 caveat |
| 5 | Kimi K2.7 Code | Fireworks `accounts/fireworks/models/kimi-k2p7-code` | 0.95 | 4.00 | FP8 | 256K | tools, json — agentic coding |
| 6 | **GLM-5.2 (default workhorse)** | Fireworks `accounts/fireworks/models/glm-5p2` | 1.40 | 4.40 | FP8 | 1M | tools, json, long_context |
| 7 | **DeepSeek V4 Pro (open escalation)** | Fireworks `accounts/fireworks/models/deepseek-v4-pro` | 1.74 | 3.48 | FP8 | 1M | tools, json, long_context |
| 8 | Claude Opus 4.8 | Anthropic (closed, frontier escalation) | — | — | — | — | tools, json, vision |

**DeepSeek adapter target:** `accounts/fireworks/models/deepseek-v4-pro` on
**Fireworks** — US-hosted, FP8, tool calling supported, $1.74/$3.48, 1M context, batch
at 50%, same auth/endpoint plumbing as the existing GLM/Fireworks path. Ship
`deepseek-v4-flash` on the same adapter as the budget sibling ($0.14/$0.28) — one
adapter, two price tiers. Do **not** target DeepSeek's first-party API by default
(China-hosted, data-jurisdiction concerns) but surface it as an opt-in cheap route.

---

## Key takeaways for glamfire

1. **"GLM 5.2 on Fireworks as default workhorse" survives contact with July 2026** —
   GLM-5.2 (MIT, 753B, 1M ctx, SWE-bench Pro 62.1) is the #1 open model and Fireworks
   holds list price ($1.40/$4.40, FP8). No change needed to the core bet.
2. **But GLM-5.2 should not be the cheap tier.** DeepSeek V4 Flash ($0.14/$0.28) and
   MiniMax M3 ($0.30/$1.20) on the *same Fireworks account* are 5–16× cheaper and
   capable enough for a large share of routed tasks. The router's value comes from
   using them.
3. **One DeepSeek adapter, two tiers**: `deepseek-v4-pro` + `deepseek-v4-flash` on
   Fireworks. R2 doesn't exist; V3.x is legacy.
4. **Quantization is a routing dimension**: FP4 routes (DeepInfra, Parasail NVFP4,
   Nebius) are cheaper but worse for coding and sometimes output-capped. The catalog
   must record quant per endpoint, and glamfire should default coding tasks to FP8.
5. **Prices decay in weeks, not quarters** (GLM-5.2 undercut within 3 weeks of launch;
   DeepSeek's permanent 75% cut). The `glam models` catalog needs a refresh cadence
   (monthly poll of provider pricing pages) rather than a static table.
6. **Batch + cache discounts are big enough to route on**: 50% batch on Fireworks,
   ~5–10× cached-input discounts everywhere.
7. Hyperscalers lag one model generation; use them only for compliance-driven
   escalation. Groq/Cerebras are speed niches without the Chinese flagships.

## Sources

- https://docs.fireworks.ai/serverless/pricing (accessed 2026-07-03)
- https://fireworks.ai/pricing (accessed 2026-07-03)
- https://fireworks.ai/models/fireworks/deepseek-v4-pro (accessed 2026-07-03)
- https://www.together.ai/pricing (accessed 2026-07-03)
- https://www.together.ai/models/deepseek-v4-pro (accessed 2026-07-03)
- https://deepinfra.com/pricing (accessed 2026-07-03)
- https://deepinfra.com/blog/kimi-k2-6-pricing-guide-deployment-tradeoffs (accessed 2026-07-03)
- https://deepinfra.com/blog/glm-5-2-pricing-benchmarks-cost-comparison (accessed 2026-07-03)
- https://www.baseten.co/products/model-apis/ (accessed 2026-07-03)
- https://groq.com/pricing (accessed 2026-07-03)
- https://pricepertoken.com/endpoints/cerebras/free (accessed 2026-07-03)
- https://api-docs.deepseek.com/quick_start/pricing (accessed 2026-07-03)
- https://apidog.com/blog/deepseek-v4-pro-permanent-price-cut/ (accessed 2026-07-03)
- https://www.infoworld.com/article/4176709/deepseeks-steep-v4-pro-price-cut-escalates-ai-pricing-war.html
- https://api-docs.deepseek.com/news/news260424 (V4 release)
- https://venturebeat.com/technology/z-ais-open-weights-glm-5-2-beats-gpt-5-5-on-multiple-long-horizon-coding-benchmarks-for-1-6th-the-cost
- https://openrouter.ai/z-ai/glm-5.2 (accessed 2026-07-03)
- https://artificialanalysis.ai/models/glm-5-2/providers (accessed 2026-07-03)
- https://www.digitalapplied.com/blog/glm-5-2-api-access-providers-price-comparison-2026
- https://qwen.ai/blog?id=qwen3.5 ; https://qwen.ai/blog?id=qwen3-coder-next ; https://qwen.ai/blog?id=qwen3.6-35b-a3b
- https://www.minimax.io/news/minimax-m25 ; https://huggingface.co/MiniMaxAI/MiniMax-M2.5
- https://codersera.com/blog/minimax-m3-release-date-whats-new-2026/
- https://codersera.com/blog/kimi-k2-7-complete-guide-2026/ ; https://llm-stats.com/models/kimi-k2.6
- https://mistral.ai/news/mistral-3/ ; https://docs.mistral.ai/models/overview
- https://ai.meta.com/blog/llama-4-multimodal-intelligence/ ; https://codersera.com/blog/llama-4-complete-guide-2026/
- https://aws.amazon.com/about-aws/whats-new/2026/02/amazon-bedrock-adds-support-six-open-weights-models/
- https://azure.microsoft.com/en-us/blog/introducing-mistral-large-3-in-microsoft-foundry-open-capable-and-ready-for-production-workloads/
- https://www.datacenterdynamics.com/en/news/sambanova-seeking-500m-in-funding-after-acquisition-talks-with-intel-stall-report/ ; https://www.eetimes.com/sambanova-abandons-intel-acquisition-raises-funding-instead/
- https://www.crunchbase.com/organization/novita-ai
- https://github.com/cline/cline/issues/11640 (Fireworks GLM 5.2 / K2.6 model IDs)
- https://www.typingmind.com/guide/fireworks-ai/accounts-fireworks-models-deepseek-v4-pro
