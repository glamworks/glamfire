# 04 — Model-Agnostic / Cost-Aware Routing

Research on detecting "center of distribution" (common, cheap-model-suitable) vs "edge of
distribution" (needs a frontier model) tasks on the fly, and the existing approaches that
glamfire can borrow or beat.

---

## The core idea

- **Every request carries an implicit difficulty.** A routing layer estimates that difficulty
  and dispatches to the cheapest model that will still produce a "good enough" answer.
  ("Every request carries an implicit difficulty; a routing layer estimates that difficulty
  and dispatches accordingly.")
- **Center of distribution** = routine, repetitive work: summaries, extraction, classification,
  reformatting, simple Q&A. These belong on small/cheap/local models.
- **Edge of distribution** = multi-step reasoning, ambiguous instructions, novel/long-tail
  tasks, high-stakes generation. These escalate to a frontier model.
- The economic incentive is large: the 2026 price spread across models is roughly **100×** —
  e.g. DeepSeek V4 at ~$0.44/M input tokens vs GPT-5.5-pro at ~$30 input / $180 output per M.
  Spending frontier tokens only when needed is the whole game.

---

## Approaches to difficulty detection

### 1. Classifier-based (predictive) routing
- A trained model looks at the prompt *before* inference and predicts which tier is needed.
- **RouteLLM** (lm-sys, ICLR 2025) ships 4 router architectures trained on Chatbot Arena
  human-preference data: similarity-weighted ranking, **matrix factorization**, a **BERT
  classifier**, and a **causal LLM classifier**.
- Reported results: matrix-factorization router cut cost **85% on MT-Bench while keeping ~95%
  of GPT-4-Turbo quality**, sending only **~14% of queries** to the strong model; a BERT
  classifier hit **~45% cost savings on MMLU** at comparable quality.
- Key practical finding: **routers transfer across model pairs** — a router trained on
  GPT-4/Mixtral preference data generalizes to e.g. Claude/Llama pairs without retraining.
- Latency cost: rule-based routers add <1ms; embedding/semantic routers ~5ms; ML classifiers
  ~50–100ms — all negligible vs typical 500–2,000ms LLM inference.

### 2. Embedding / semantic routing
- Compute the query embedding, match against pre-labeled clusters/examples (vector similarity),
  route by nearest cluster.
- ~5ms overhead. Good for routing by *topic/intent* (e.g. "this is a SQL question → model X")
  rather than raw difficulty.
- **vLLM Semantic Router** is an open-source "Mixture-of-Models" router in this family.
- Pattern: maintain labeled exemplars of "cheap-suitable" vs "needs-frontier" queries; route
  by cosine distance to each set. Cheap, transparent, locally ownable, easy to tune.

### 3. Cascade / escalation (reactive) routing
- Answer with the **small model first**, then escalate to a stronger model only if a
  confidence or verification check fails. Can beat a single frontier model on *both* cost and
  quality because frontier tokens are spent only on requests that prove they need them.
- Lineage: **FrugalGPT** and **AutoMix** cascade queries through models ordered by cost until
  a response is "good enough."
- **Cluster, Route, Escalate** (arXiv 2606.27457): two-stage cascade — cluster incoming
  queries, assign each cluster its most cost-effective model, then a quality-estimation cascade
  escalates low-quality outputs. Retained **97–99% of the strongest model's accuracy** while
  cutting Time-Per-Output-Token.

### 4. Confidence / uncertainty-based fallback
- Route or escalate based on the *model's own uncertainty* on a given output.
- **Self-REF**: train an LLM to emit explicit confidence tokens that trigger escalation.
- **CP-Router**: uses **conformal prediction** on output uncertainty to route between standard
  LLMs and large reasoning models.
- **UCCI** (arXiv 2605.18796): calibrated uncertainty for cost-optimal cascade routing.
- Important empirical result (Chuang et al., 8 UQ methods benchmarked for on-device SLM→LLM
  routing): **probe-based methods (trained classifiers) and perplexity-based methods
  significantly outperform verbalized self-reported confidence.** Don't trust a model's
  self-stated "I'm confident" — measure it.

---

## Commercial / OSS routers (what to integrate or learn from)

| Tool | Type | Notes |
|---|---|---|
| **OpenRouter** Auto Router | Managed, powered by NotDiamond | `cost_quality_tradeoff` dial 0 (most capable) → 10 (cheapest), default 7; provider-level routing deprioritizes any provider with outages in last 30s; ~5% credit markup. 1 API, many providers. |
| **NotDiamond** | Managed, ML quality-aware | Learned routers pick the cheapest model that yields a "good enough" answer; objectives: max quality / quality-cost balance / quality-latency balance; ~50–100ms classifier overhead. Maintains the `awesome-ai-model-routing` list. |
| **LiteLLM** | Self-hosted gateway | 100+ providers, 5 routing strategies — the natural OSS, self-owned gateway to embed. |
| **Vercel AI Gateway** | Managed | <20ms overhead; sort by cost/ttft/tps across 40+ providers. |
| **Portkey** | OSS (Apache-2.0) | 250+ providers, 40+ guardrails. |
| **Azure AI Foundry Model Router** | Managed | Three modes: Balanced / Cost / Quality across 27+ models. |
| **RouteLLM** | OSS framework | Train/serve/evaluate your own routers; the reference implementation to fork. |
| **vLLM Semantic Router** | OSS | Embedding-based Mixture-of-Models routing. |

---

## The big risk: silent quality regression

- The dominant failure mode of routing is **subtle answer degradation** — missed nuance,
  hallucinations, failed tool calls — that surfaces *days later* in customer tickets, not at
  route time.
- Recommended mitigation: a **pre-merge CI gate** running 50–500 representative cases with
  groundedness checks + LLM-as-judge eval, so routing changes can't silently drop quality.
- This matters doubly for an agent harness, where a wrong cheap-model decision can cascade
  through a multi-step plan.

---

## Key takeaways for glamfire

- **Make routing a first-class, owned layer, not an outsourced dial.** Because glamfire keeps
  its own context, it can route locally: classify difficulty against the *team's own* labeled
  history of past tasks (which were easy, which needed escalation) rather than a generic
  vendor classifier. This is a structural advantage the SaaS routers don't have.
- **Default architecture: cheap/local first → cascade escalate on low confidence.** Use a
  probe/perplexity confidence signal (not verbalized confidence) plus optional verification to
  decide when to escalate to a frontier model. This is the cost/quality sweet spot per the
  cascade literature (97–99% of frontier accuracy).
- **Add a cheap predictive pre-router** (semantic/embedding, ~5ms) so obviously-routine work
  never even touches a frontier model. Keep exemplar sets of "center" vs "edge" tasks that the
  team can edit — transparent and self-tunable.
- **Be genuinely model-agnostic via an OSS gateway (LiteLLM-style)** so the team can swap
  DeepSeek/Llama/Qwen/Claude/GPT without lock-in and exploit the ~100× price spread. Routers
  transfer across model pairs, so the routing brain survives model churn.
- **Ship the eval gate by default.** Glamfire should bundle a routing-regression harness (golden
  task set + LLM-judge) so users can change models/thresholds and *prove* quality held — turning
  routing's biggest risk into a selling point.
- **Expose a single tunable knob** (à la OpenRouter's cost_quality_tradeoff) backed by the
  cascade machinery, so non-experts get one slider while power users can edit the classifier,
  thresholds, and exemplars.

---

## Sources

- RouteLLM (lm-sys) — https://github.com/lm-sys/RouteLLM
- LLM Model Routing in 2026: Cost-Quality Optimization — https://www.digitalapplied.com/blog/llm-model-routing-2026-cost-quality-optimization-engineering-guide
- Not-Diamond / awesome-ai-model-routing — https://github.com/Not-Diamond/awesome-ai-model-routing
- OpenRouter vs LiteLLM (managed vs self-hosted gateway) — https://openrouter.ai/blog/insights/openrouter-vs-litellm/
- LLM Gateway 2026 (OpenRouter vs LiteLLM vs Portkey vs Helicone) — https://klymentiev.com/blog/llm-gateway-guide
- vLLM Semantic Router — https://vllm-semantic-router.com/
- Cluster, Route, Escalate: Cascaded Framework for Cost-Aware LLM Serving — https://arxiv.org/abs/2606.27457
- UCCI: Calibrated Uncertainty for Cost-Optimal LLM Cascade Routing — https://arxiv.org/html/2605.18796
- Is Escalation Worth It? Decision-Theoretic Characterization of LLM Cascades — https://arxiv.org/html/2605.06350
- Dynamic Model Routing and Cascading for Efficient LLM Inference: A Survey — https://arxiv.org/html/2603.04445v2
- LLM Routing in production (TianPan) — https://tianpan.co/blog/2025-10-19-llm-routing-production
- Intelligent LLM Routing (TrueFoundry) — https://www.truefoundry.com/blog/llm-routing-cost-quality-aware-model-selection
