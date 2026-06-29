# 09 — Observability & Evals for Agent Systems

Research for glamfire — a model-agnostic harness for the "last mile" of agentic AI.
Core thesis: a team's task distribution has a **center** (routine work routable to a
cheap/fast model like GLM 5.2 on Fireworks) and an **edge** (novel/hard work needing a
frontier model). To route correctly, you must **measure** the distribution. That means
instrumenting traces, scoring difficulty/outcomes, and continuously evaluating.

_Last updated: June 2026._

---

## 1. Tracing / Observability Tools for LLM & Agent Systems

A practical north star: **OpenTelemetry (OTel) is the integration layer.** Every tool
below either is OTel-native or accepts OTel traces, so a harness should emit standard
OTel spans (with GenAI semantic-convention attributes) and let the team point them at
whichever backend they prefer.

### OpenTelemetry GenAI Semantic Conventions (the emerging standard)

- **What it is:** A standardized set of span/metric attribute names for GenAI workloads,
  developed in the OpenTelemetry project (the GenAI / LLM Semantic Convention working
  group, which Traceloop helps lead). Defines attributes like `gen_ai.system` (vendor,
  e.g. `openai`, `anthropic`), `gen_ai.request.model`, `gen_ai.usage.input_tokens` /
  `output_tokens`, prompt/completion capture, plus newer agent-lifecycle conventions
  (tool execution, multi-agent coordination, memory, workflow orchestration).
- **Status:** The conventions are now part of OpenTelemetry (development/experimental
  maturity in places, stabilizing). Note ongoing churn: older `gen_ai.prompt` /
  `gen_ai.completion` span attributes are being deprecated/restructured (e.g. toward
  event-/log-based capture), so a harness should track convention versions.
- **Why it matters for glamfire:** Emit OTel + GenAI conventions once and the team gets
  vendor portability across Langfuse, Phoenix, Grafana/Tempo, Dynatrace, Datadog, etc.,
  without re-instrumenting. This is the single most leverage-y instrumentation decision.

### Langfuse

- **What it is:** Open-source LLM/AI engineering platform: tracing/observability, evals,
  metrics, prompt management, playground, datasets. Widely regarded as the OSS leader by
  adoption (tens of thousands of GitHub stars). YC W23.
- **OSS vs SaaS:** Both. Self-host the OSS, or use Langfuse Cloud (managed SaaS).
- **License:** Repo is **MIT, except the `ee/` (enterprise edition) folders**, which
  carry a separate commercial license. Core tracing/observability is MIT and fully
  self-hostable; some enterprise features (e.g. RBAC/SSO enforcement, certain
  org-management features) are gated.
- **OpenTelemetry:** Yes — first-class. The SDK v4 is a thin layer over the official
  OTel client; spans from any OTel-instrumented library can be exported to Langfuse, and
  Langfuse exposes an OTel ingestion endpoint. Also integrates with LangChain, OpenAI
  SDK, LiteLLM, etc.
- **Key features:** Nested trace/observation tree; token + cost tracking; prompt
  management with versioning; LLM-as-judge + code evaluators, user feedback, manual
  labeling, custom eval pipelines; datasets for offline testing; analytics dashboards.
- **Strengths:** Broad feature coverage in one OSS tool; strong prompt management;
  OTel-native; easy self-host. **Weaknesses:** EE gating on some org/security features;
  evals less deep than dedicated eval frameworks; self-host has operational overhead
  (Postgres, ClickHouse, Redis, S3 for full stack).

### OpenLLMetry (Traceloop)

- **What it is:** A set of OpenTelemetry extensions/instrumentations that give
  end-to-end observability of an LLM/GenAI app. Built and maintained by Traceloop. It is
  fundamentally an **instrumentation SDK**, not a backend — it produces OTel data you
  send anywhere (Traceloop's SaaS, or any OTel-compatible backend: Datadog, Honeycomb,
  Grafana, Dynatrace, etc.).
- **OSS vs SaaS:** OpenLLMetry (the SDK) is OSS; Traceloop offers a managed platform.
- **License:** **Apache 2.0**.
- **OpenTelemetry:** It _is_ OTel — auto-instruments popular LLM SDKs/frameworks and
  emits GenAI-semantic-convention spans. Traceloop co-leads the OTel GenAI semantic
  conventions WG and ships an `opentelemetry-semantic-conventions-ai` package.
- **Key features:** Auto-instrumentation for many providers/frameworks; standardized
  prompt/completion/token/cost attributes; vendor-neutral export; nascent agent
  semantic conventions.
- **Strengths:** Most "standards-pure" choice; zero backend lock-in; great if you
  already run an OTel pipeline. **Weaknesses:** It's plumbing, not a product — you bring
  your own backend/UI, evals, and prompt management; less turnkey than Langfuse/Phoenix.

### Arize Phoenix (and Arize AX)

- **What it is:** Open-source AI observability & evaluation tool from Arize AI.
  Distributed tracing of every LLM call, retrieval, and agent step via OTel +
  OpenInference auto-instrumentation; built-in evals; experiments; embedding/cluster
  analysis. Arize also sells **Arize AX**, the enterprise SaaS platform.
- **OSS vs SaaS:** Phoenix is OSS and self-hostable (laptop, notebook, Docker, K8s);
  Arize AX is the commercial cloud product.
- **License:** Phoenix is under the **Elastic License 2.0 (ELv2)** — source-available,
  not OSI-approved. ELv2 notably **forbids offering Phoenix as a hosted/managed
  service**. Fine for internal self-hosting; relevant if glamfire ever wanted to resell
  it as a service.
- **OpenTelemetry:** Native OTel + OpenInference. Vendor/framework agnostic with
  out-of-the-box support for OpenAI Agents SDK, Claude Agent SDK, LangGraph, Vercel AI
  SDK, CrewAI, LlamaIndex, DSPy, and providers incl. OpenAI, Anthropic, Bedrock,
  OpenRouter, LiteLLM.
- **Key features (notable for glamfire):** **Embedding analysis with clustering
  (HDBSCAN) + UMAP visualizations, ordered by drift** — surfaces groups of traces
  degrading/diverging from a baseline. LLM-as-judge + code + human-label evals;
  experiments comparing changes on the same inputs; retrieval/RAG analysis.
- **Strengths:** Best-in-class embedding/drift/cluster tooling (directly useful for
  measuring task distribution); strong eval library; deep framework coverage.
  **Weaknesses:** ELv2 (not true OSS, no-SaaS clause); the richest drift/analytics live
  partly in paid Arize AX.

### Helicone

- **What it is:** Open-source LLM observability platform + **AI Gateway/proxy**. "One
  line of code" (or proxy your traffic) to monitor, evaluate, and experiment. YC W23.
- **OSS vs SaaS:** Both — self-host the OSS or use Helicone Cloud (free tier ~10k
  requests/month).
- **License:** **Apache 2.0**.
- **OpenTelemetry:** Supports OTel-based ingestion and integrates broadly (LiteLLM,
  Vercel AI SDK, etc.); historically proxy-first.
- **Key features:** Request logging/monitoring; **cost tracking** (precise via Gateway's
  Model Registry v2, or best-effort via an open-source cost repo covering 300+ models);
  caching; rate limiting; prompt management/versioning; experiments/evals. Because it can
  sit inline as a **gateway**, it is well positioned to also _do the routing_.
- **Strengths:** Trivial to adopt (proxy); strong cost/caching/rate-limit story; gateway
  architecture overlaps naturally with a routing harness. **Weaknesses:** Proxy-in-path
  adds a latency/availability dependency; evals lighter than dedicated frameworks; some
  advanced features cloud-tier oriented.

### Quick comparison

| Tool | OSS license | SaaS | OTel | Standout for glamfire |
|------|-------------|------|------|-----------------------|
| Langfuse | MIT (core; `ee/` commercial) | Yes | Native (SDK v4) | All-in-one OSS: tracing + prompts + evals |
| OpenLLMetry | Apache 2.0 | Yes (Traceloop) | _Is_ OTel | Pure instrumentation, zero lock-in |
| Phoenix | Elastic License 2.0 | Arize AX | Native (+OpenInference) | Embedding clustering + drift detection |
| Helicone | Apache 2.0 | Yes | Yes | Gateway + cost tracking inline |

---

## 2. Measuring a Team's Task Distribution (Center vs Edge)

Goal: decide **what is safe to route to a cheap model (GLM 5.2)** vs **what must go to a
frontier model** — backed by data, not vibes. This is fundamentally a measurement +
clustering + outcome-tracking problem layered on the observability data from §1.

### Signals to capture per task/trace

- **Inputs/prompts** (for embedding + clustering) and task metadata (repo, tool, user,
  task type).
- **Difficulty proxies** — research-backed, cheap to compute:
  - Chain-of-Thought / reasoning length (longer CoT ≈ harder; AdaptiveLLM clusters
    coding tasks by CoT length).
  - Token-level entropy / cross-entropy loss / output diversity of a small "proxy"
    model — high uncertainty ≈ hard.
  - Prompt-derived features: task type, reasoning patterns, complexity indicators,
    syntactic cues (cf. LLMRank's human-readable features + lightweight proxy solver).
  - Psychometric **Item Response Theory** (IRT-Router) to jointly model query
    difficulty and per-model ability.
- **Outcomes:** success/failure (eval pass, test pass, user accept/reject, thumbs),
  per task type.
- **Cost/perf distributions:** input/output tokens, latency, $ per task — capture the
  full distribution (p50/p90/p99), not just means.
- **Confidence/uncertainty:** logprobs, self-consistency spread, judge scores, retrieval
  relevance.
- **Escalation/fallback rates:** how often a cheap-model answer is rejected, retried, or
  escalated to a bigger model (the empirical "edge" rate).
- **Drift:** embedding-centroid / token-distribution shift over time via **PSI,
  KL-divergence, or Jensen-Shannon divergence**; embedding-drift monitoring (Phoenix/
  Arize) to detect when the "center" itself is moving.

### Practical methodology a harness could implement

1. **Capture traces.** Instrument with OTel + GenAI semantic conventions (§1). Log
   prompt, model, tokens, latency, cost, tool calls, and outcome for every task.
2. **Embed.** Encode each task/prompt with a sentence encoder (e.g. all-MiniLM-L6-v2 or
   a stronger embedding model) into a vector.
3. **Cluster.** Group tasks into types (K-means, HDBSCAN, or Leiden community detection;
   compute a cluster centroid via mean/median pooling). Each cluster ≈ a "task type."
4. **Label center vs edge.** For each cluster, compute the outcome/cost/difficulty
   profile: success rate of the cheap model, escalation rate, difficulty proxy, cost
   variance. **Center** = high cheap-model success + low escalation + low difficulty +
   stable. **Edge** = low cheap-model success, high uncertainty/escalation, or high
   variance.
5. **Set routing policy.** Route center clusters to GLM 5.2; route edge clusters (or
   high-difficulty individual tasks via P(hard) thresholding, cf. LLMRank top-k) to the
   frontier model. Optionally a **cascade**: try cheap first, verify, escalate on low
   confidence/failed check.
6. **Monitor & close the loop.** Continuously re-score: track per-cluster success,
   escalation, drift (PSI/KL/JS). When a cluster's cheap-model success degrades or its
   embedding drifts, re-label and re-route. Mine failures back into eval sets (§3).

### Related work — LLM routers & cascades

- **RouteLLM (LMSYS):** OSS framework for serving and _evaluating_ LLM routers from
  preference data; reported ~85% cost reduction on MT-Bench while keeping ~95% of GPT-4
  quality (GPT-4 vs Mixtral-8x7B). Good reference implementation + benchmarking harness.
- **Not Diamond:** Commercial router that picks the best LLM per query; maintains the
  community **awesome-ai-model-routing** list.
- **Martian:** Commercial real-time router; published **RouterBench** for evaluating
  routers.
- **OpenRouter:** Production multi-provider gateway/marketplace; de-facto routing infra.
- **Unify, LiteLLM, Amazon Bedrock (intelligent prompt routing):** other real-world
  routing infra.
- **Cascading approaches:** Process a request through models in increasing cost/quality;
  stop when an early cheap model meets a quality threshold. General taxonomy:
  **pre-request rules** (cheapest), **at-inference cascades** (most accurate),
  **post-response retry/escalation** (safety net). glamfire's "center→cheap,
  edge→frontier, verify-and-escalate" is precisely a measured cascade.
- **Benchmarks/research:** RouterBench, RouterArena, LLMRank, IRT-Router, AdaptiveLLM —
  useful for validating glamfire's router offline.

---

## 3. Eval Frameworks for Agents

Evals are how you _earn the right_ to route to a cheap model and keep it there: prove the
cheap model is good enough on the center, and catch regressions when models/prompts
change. Teams typically run **two layers**: a lightweight CI/CD-gating framework
(DeepEval / promptfoo / Ragas / Inspect) **plus** a platform for human annotation,
regression tracking, and dashboards (Braintrust / LangSmith / Arize/Phoenix / Langfuse).

### Open-source / framework tier

- **OpenAI Evals** — MIT. Framework for evaluating LLMs and LLM systems + an OSS registry
  of benchmarks. Supports evaluating prompt chains and **tool-using agents** via the
  Completion Function Protocol. Battle-tested, but more benchmark-/registry-oriented than
  a modern agent-trajectory harness.
- **promptfoo** — OSS (Apache-2.0-style), YAML-driven CLI. Strong at **red-teaming /
  adversarial / security testing** (40+ red-team plugins) and multi-model prompt
  comparison; great for CI gating. **Note: OpenAI agreed to acquire promptfoo
  (announced March 9, 2026)**; it will be integrated into OpenAI Frontier but **remains
  open source** under its current license.
- **DeepEval (Confident AI)** — OSS, "the pytest of LLM evals." 50+ metrics (G-Eval,
  DAG-based metrics), pytest integration, and a full **agentic eval harness**
  (tool-correctness, task-completion, trajectory). Best developer ergonomics for
  CI-style unit tests of LLM/agent output. Confident AI is the paid cloud companion.
- **Ragas** — OSS, focused on **RAG** evaluation (faithfulness, answer relevancy,
  context precision/recall). Minimal config, often no labeled dataset required — fastest
  path to meaningful RAG metrics. Narrow by design (RAG, not general agents).
- **Inspect AI (UK AISI)** — MIT, maintained by the UK AI Security Institute. Python-first
  eval framework: prompt engineering, tool use, multi-turn dialog, model-graded evals,
  200+ pre-built evaluations, extensible via Python packages. Strong for capability /
  safety / red-team style suites; increasingly a standard for rigorous agent evals.

### Commercial / platform tier

- **LangSmith (LangChain)** — Eval + observability platform. Offline (dataset) and online
  (production-traffic) evals; **trajectory vs output** evaluation for agents;
  LLM-as-judge, human review queues, regression tracking. Tight LangChain/LangGraph
  integration but framework-agnostic via SDK.
- **Braintrust** — Commercial eval-lifecycle platform (eval → production monitoring →
  team collaboration → release gating) on one platform; well funded (reported $800M
  valuation after an $80M Series B). Positioned as the "full lifecycle" complement to
  OSS frameworks.
- **Arize / Phoenix** — see §1; Phoenix's eval + experiment tooling doubles as an OSS
  eval platform with embedding/drift analysis.
- **Langfuse** — see §1; its datasets + LLM-as-judge/code/human evals cover the
  regression-testing loop alongside tracing.

### Methodology that matters for glamfire

- **LLM-as-judge:** Scales evaluation beyond manual review, but needs **structured
  rubrics, multiple judge passes, and calibration against human-labeled examples** to
  control bias/drift. For objective tasks (code passes tests, JSON valid, exact match),
  **prefer deterministic checks** — they give cleaner regression signal than a flaky
  judge.
- **Offline vs online evals:**
  - _Offline:_ run against curated datasets during development — "unit tests" for the
    app/agent; gate CI; catch regressions before deploy.
  - _Online:_ run judges/heuristics on a **random sample of production traffic** in real
    time; set thresholds and alert on quality drift.
- **Agent-trajectory evaluation:** Score the **step-by-step path** (tool calls, LLM
  responses, observations, state transitions), not just the final output — e.g. tool
  selection correctness, redundant/looping steps, recovery from errors. Critical for
  agentic glamfire where the cheap model may reach the right answer via a worse path (or
  the wrong answer via a plausible-looking one).
- **Regression testing for prompts/models:** Maintain versioned prompt/model configs and
  a growing eval set. **Mine failures** (low judge score, user-reported issues, anomalous
  trajectories) into labeled regression cases so the suite grows weekly from real
  failures, not just manual curation. Re-run on every prompt/model change — essential
  before swapping or upgrading GLM 5.2 / Fireworks endpoints.

---

## Key takeaways for glamfire

- **Instrument once, in OTel + GenAI semantic conventions.** It is the single highest-
  leverage decision: portability across Langfuse, Phoenix, Helicone, Grafana, Datadog,
  Dynatrace with zero re-instrumentation. Track convention versions (prompt/completion
  attributes are churning).
- **For self-hosted OSS, Langfuse (MIT core) is the safest all-in-one** for tracing +
  prompt management + evals. **Phoenix (ELv2)** is the strongest for the distribution-
  measurement job (embedding clustering + drift) but its license forbids reselling it as
  a service. **Helicone (Apache-2.0)** is attractive because its **gateway** sits exactly
  where glamfire's router lives. **OpenLLMetry (Apache-2.0)** is the cleanest pure
  instrumentation if glamfire wants zero backend lock-in.
- **The "measure the distribution" thesis maps to a concrete pipeline:** capture OTel
  traces → embed prompts → cluster (HDBSCAN/Leiden/K-means) → label clusters center vs
  edge by cheap-model success / escalation / difficulty / variance → set routing policy
  → monitor with PSI/KL/JS drift and per-cluster success → re-label as the center moves.
- **glamfire's routing is a measured cascade.** Prior art (RouteLLM, Not Diamond, Martian,
  OpenRouter, LiteLLM, Bedrock routing; benchmarks RouterBench/RouterArena/LLMRank) shows
  ~85% cost cuts at ~95% quality are achievable — but only with measurement; don't ship a
  static rule.
- **Two-layer evals:** a lightweight CI gate (DeepEval / promptfoo / Inspect / Ragas) plus
  a regression/monitoring platform (Langfuse / Braintrust / LangSmith / Phoenix). Prefer
  **deterministic checks** where possible; reserve calibrated **LLM-as-judge** for
  subjective quality.
- **Evals are the trust mechanism for cheap routing.** You can only safely route the
  center to GLM 5.2 if offline + online evals (incl. **agent-trajectory** eval) prove the
  cheap model holds quality there — and a growing, failure-mined regression suite catches
  the moment it stops.
- **Watch promptfoo's OpenAI acquisition (Mar 2026):** still OSS for now, but its roadmap
  is now OpenAI Frontier-aligned — a consideration for a model-agnostic harness.

---

## Sources

- [Langfuse — GitHub](https://github.com/langfuse/langfuse)
- [Langfuse — OpenTelemetry for LLM Observability](https://langfuse.com/integrations/native/opentelemetry)
- [Langfuse — Observability overview](https://langfuse.com/docs/observability/overview)
- [Langfuse — Agent evaluation guide](https://langfuse.com/guides/cookbook/example_pydantic_ai_mcp_agent_evaluation)
- [OpenLLMetry — GitHub (Traceloop)](https://github.com/traceloop/openllmetry)
- [Traceloop — GenAI Semantic Conventions docs](https://www.traceloop.com/docs/openllmetry/contributing/semantic-conventions)
- [openllmetry — opentelemetry-semantic-conventions-ai package](https://github.com/traceloop/openllmetry/tree/main/packages/opentelemetry-semantic-conventions-ai)
- [RFC: Semantic Conventions for AI Agent Observability (issue #3460)](https://github.com/traceloop/openllmetry/issues/3460)
- [Deprecation of gen_ai.prompt / gen_ai.completion (issue #3515)](https://github.com/traceloop/openllmetry/issues/3515)
- [OpenTelemetry for GenAI and the OpenLLMetry project (Horovits)](https://horovits.medium.com/opentelemetry-for-genai-and-the-openllmetry-project-81b9cea6a771)
- [Arize Phoenix — site](https://phoenix.arize.com/)
- [Arize Phoenix — GitHub](https://github.com/arize-ai/phoenix)
- [Arize Phoenix — docs](https://arize.com/docs/phoenix)
- [Helicone — GitHub](https://github.com/Helicone/helicone)
- [Helicone — Cost Tracking & Optimization docs](https://docs.helicone.ai/guides/cookbooks/cost-tracking)
- [Helicone — site](https://www.helicone.ai/)
- [RouteLLM — GitHub (LMSYS)](https://github.com/lm-sys/RouteLLM)
- [RouteLLM: Learning to Route LLMs with Preference Data (arXiv)](https://arxiv.org/pdf/2406.18665)
- [Not Diamond — awesome-ai-model-routing](https://github.com/Not-Diamond/awesome-ai-model-routing)
- [Martian — Introducing RouterBench](https://withmartian.com/post/introducing-routerbench)
- [RouterArena: An Open Platform for Comparison of LLM Routers (arXiv)](https://arxiv.org/html/2510.00202v1)
- [LLMRank: Understanding LLM Strengths for Model Routing (arXiv)](https://arxiv.org/html/2510.01234v1)
- [Scalable Prompt Routing via Fine-Grained Latent Task Discovery (arXiv)](https://arxiv.org/pdf/2603.19415)
- [LLM-Based Difficulty Prediction (Emergent Mind)](https://www.emergentmind.com/topics/llm-based-difficulty-prediction)
- [LLM-Based Prompt Routing (Emergent Mind)](https://www.emergentmind.com/topics/llm-based-prompt-routing)
- [LLM Model Routing in 2026 (Digital Applied)](https://www.digitalapplied.com/blog/llm-model-routing-2026-cost-quality-optimization-engineering-guide)
- [OpenAI Evals — GitHub](https://github.com/openai/evals)
- [promptfoo — joining OpenAI (announcement)](https://www.promptfoo.dev/blog/promptfoo-joining-openai/)
- [OpenAI — to acquire Promptfoo](https://openai.com/index/openai-to-acquire-promptfoo/)
- [OpenAI acquires Promptfoo (TechCrunch)](https://techcrunch.com/2026/03/09/openai-acquires-promptfoo-to-secure-its-ai-agents/)
- [DeepEval — alternatives compared](https://deepeval.com/blog/deepeval-alternatives-compared)
- [Promptfoo vs DeepEval vs RAGAS comparison (genai.qa)](https://genai.qa/blog/promptfoo-vs-deepeval-vs-ragas/)
- [Inspect AI — GitHub (UK AISI)](https://github.com/UKGovernmentBEIS/inspect_ai)
- [Braintrust — DeepEval alternatives 2026](https://www.braintrust.dev/articles/deepeval-alternatives-2026)
- [LangSmith — Evaluation platform](https://www.langchain.com/langsmith/evaluation)
- [LangChain — LLM Evaluation Framework: Trajectories vs Outputs](https://www.langchain.com/resources/llm-evaluation-framework)
- [Evidently AI — LLM-as-a-judge guide](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)
- [Galileo — Best LLM Drift Monitoring Platforms 2026](https://galileo.ai/blog/best-llm-output-drift-monitoring-platforms)
- [Best LLM Observability Tools in 2026 (Firecrawl)](https://www.firecrawl.dev/blog/best-llm-observability-tools)
