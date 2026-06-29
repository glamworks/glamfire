# 07 — Competitive Landscape

*Last updated: June 2026. Facts verified against primary sources (GitHub LICENSE files, official docs, vendor sites). GitHub star counts are approximate live figures and drift over time.*

## Framing the landscape

The "agentic AI" tooling market splits into four overlapping camps, and glamfire has to be honest about which one it competes in:

1. **Agent / orchestration frameworks** (LangChain/LangGraph, LlamaIndex, Mastra, Vercel AI SDK, CrewAI, AutoGen) — libraries/SDKs for *building* agents. They are mostly model-agnostic by design (a unified provider interface is their core value), but they are construction kits: routing and context curation are primitives you hand-assemble, not finished capabilities.
2. **Coding agents / CLIs** (Continue.dev, Aider, OpenHands, Cline, Roo Code, Codex CLI, Claude Code, Goose) — finished agents that operate on a repo. This is glamfire's true neighborhood. The open ones are uniformly model-agnostic and own their own repo context locally; the vendor ones (Codex CLI, Claude Code) are tied to a single model family.
3. **Low-code agent platforms** (Dify, Flowise) — visual builders for non-engineers. Model-agnostic and they own context inside a self-hosted platform, but carry license restrictions and trade flexibility for a drag-and-drop canvas.
4. **Orchestration glue** (LangGraph, AutoGen → Microsoft Agent Framework) — the durable-execution / multi-agent control layer, increasingly a commercial-hosted upsell.

The recurring theme across all four camps: **model-agnostic is table stakes, intelligent cost/capability routing is a near-universal gap, and owned context is mixed.** glamfire's thesis — model-agnostic + automatic center/edge routing + owned, curated context, focused on the coding *last mile* — lands in genuine white space on the routing axis. The closest single competitor is **Block/Goose**, which already ships a coarse Lead/Worker routing pattern.

---

# Agent / orchestration frameworks

## LangChain / LangGraph

**What it is:** The largest open-source framework for building LLM apps and agents by chaining interoperable components. LangGraph is its lower-level orchestration layer for stateful, durable, graph-modeled agents (persistence, human-in-the-loop, multi-agent). Both reached v1.0 in the 2025/2026 cycle, backed by the commercial LangSmith / LangGraph Platform.

**Strengths**
- Largest ecosystem and integration catalog in the space; a single standard interface so providers swap without rewriting logic.
- LangGraph orchestration: durable execution/state persistence, pause-inspect-resume, supervisor/hierarchical/collaborative multi-agent patterns.
- Production traction with named enterprises; deep observability via LangSmith tracing.
- Built-in reliability primitives: automatic fallbacks (`init_chat_model`), exponential-backoff retries, rate limiting.
- Exposes model capability metadata (`model.profile`, sourced from models.dev) so apps can build their own routing.

**Weaknesses**
- No built-in intelligent routing by cost/capability — routing logic is hand-built.
- Licensing trap: framework is MIT, but the production server runtime (`langgraph-api`) is Elastic License 2.0, pushing real deployments toward a commercial Platform license.
- Long-standing reputation for abstraction bloat and version churn (classic vs v1).
- Best-in-class observability (LangSmith) is a separate, vendor-hosted commercial SaaS.
- Largely a pass-through to vendor APIs; it provides interfaces, not an owned context layer.

**License:** Dual/split. Core (`langchain`, `langchain-core`, `langgraph`, integrations) is **MIT**; server runtime `langgraph-api` is **Elastic License 2.0**; LangGraph Platform / LangSmith are **proprietary SaaS**.

**Truly model-agnostic?** **Yes** (for the OSS framework) — provider packages implement one standard interface; new model names work without a LangChain update.

**Routing?** **Partial/no** — building blocks exist (unified interface, runtime-configurable models, error fallbacks, capability metadata) but the developer implements the actual cost-optimization logic.

**Owned context?** **No/partial** — standardized interfaces pass context through to whichever vendor you choose; context ownership is left to the developer, and trace curation lives in the closed LangSmith SaaS.

**GitHub:** LangChain ~140k stars · LangGraph ~36k — <https://github.com/langchain-ai/langchain>, <https://github.com/langchain-ai/langgraph>

## LlamaIndex

**What it is:** Open-source Python/TS data framework for context-augmented and agentic LLM apps, focused on connecting LLMs to private data via ingestion, indexing, retrieval (RAG), and workflow orchestration. Paired with a commercial cloud (LlamaCloud / LlamaParse) for enterprise document parsing.

**Strengths**
- Best-in-class RAG and data-ingestion tooling: 100+ data connectors, indices/graphs, advanced retrieval purpose-built for grounding on private data.
- Broad provider/integration ecosystem (100+ integrations across LLMs, embeddings, vector stores).
- Strong document understanding via LlamaParse/LlamaCloud (VLM parsing of 50+ file types, tables, charts) plus a local LiteParse option.
- Layered API: high-level for beginners, low-level for advanced users; "Workflows" for agentic orchestration.

**Weaknesses**
- No built-in routing between models by cost/capability — typically delegated to LiteLLM.
- Its routers (RouterQueryEngine/RouterRetriever) route between query engines/retrievers/tools/data sources, **not** between LLM backends.
- Core strength is retrieval/data, not the control loop; production stacks often bolt on LangGraph/Agent SDKs.
- The most differentiated capability (LlamaParse/LlamaCloud) sits behind a closed, credit-priced SaaS.

**License:** **MIT** core (verified LICENSE); LlamaCloud / LlamaParse are a separate **proprietary** hosted product.

**Truly model-agnostic?** **Partial-to-yes** — vendor-agnostic at the integration layer, but the differentiated parsing value lives in proprietary LlamaCloud and there is no provider-neutral routing.

**Routing?** **No** (not built-in) — routers select among query engines/tools/data, not among LLMs by price/capability.

**Owned context?** **Partial** — genuinely owns/curates context for RAG (you control ingestion, chunking, indexing, retrieval over your own stores), *but* the highest-value parsing step routes documents through closed LlamaCloud (local LiteParse mitigates).

**GitHub:** ~50.5k stars — <https://github.com/run-llama/llama_index>

## Mastra

**What it is:** Open-source TypeScript framework for AI agents and apps — typed agents, graph workflows, memory, RAG, evals/observability, and MCP server support in one modular stack. Targets the JS/TS ecosystem as an alternative to Python-first frameworks.

**Strengths**
- Comprehensive batteries-included TS stack: typed agents, workflows (`.then()`/`.branch()`/`.parallel()`), human-in-the-loop suspend/resume, memory, evals.
- Broad model reach via its own Model Router — 40+ providers / 600+ models as `provider/model` strings with TS autocomplete, plus gateway support.
- Developer-owned memory/context: pluggable storage (`@mastra/libsql`, self-hosted, in-memory) with explicit history retention, filtering, per-request context controls.
- Strong native TS/JS fit (embeds in web apps or runs standalone).

**Weaknesses**
- No built-in *intelligent* routing — model choice is manual/string-based; cost/capability switching must be coded.
- Dual-license: enterprise features (RBAC, SSO, ACL in `ee/`) are source-available and require a paid license for production.
- Young and fast-moving; APIs churn (recently rebuilt model handling around its own Model Router).
- TS-only excludes Python shops.

**License:** **Dual** — core framework **Apache-2.0**; `ee/` enterprise modules under the source-available **Mastra Enterprise License**. (GitHub reports SPDX `NOASSERTION` due to the mix.)

**Truly model-agnostic?** **Yes** — 40+ providers / 600+ models through one interface; its own Model Router now routes directly to official provider APIs (no longer strictly dependent on Vercel AI SDK).

**Routing?** **Partial/no** — no built-in cost/capability router; models are strings so dynamic selection and per-provider fallback are possible, but the decision logic is hand-written.

**Owned context?** **Yes** — context/memory is owned and curated by the developer (pluggable LibSQL/self-hosted/in-memory storage, explicit retention/filtering), not ceded to a closed vendor.

**GitHub:** ~25.6k stars — <https://github.com/mastra-ai/mastra>

## Vercel AI SDK

**What it is:** Free, open-source TypeScript toolkit from the creators of Next.js for building AI apps and agents (`vercel/ai`). Standardizes model integration across many providers and JS frameworks. As of June 2026 at AI SDK 6/7 — first-class agents, tool-execution approval, full MCP support, DevTools, durable workflows.

**Strengths**
- Best-in-class TS/JS DX: clean unified API (`generateText`, `streamText`, `generateObject`, tool calling) with tight Next.js/React integration.
- Genuinely model-agnostic: one interface across 40+ providers (OpenAI, Anthropic, Google, Bedrock, Vertex, Mistral, xAI, DeepSeek, Groq, etc.).
- Mature, well-documented ecosystem with frequent major releases adding agent depth.
- Optional AI Gateway adds provider fallbacks, BYOK, caching, and no-markup access.

**Weaknesses**
- TypeScript/JavaScript only — no first-party Python.
- No built-in intelligent routing; cost/capability routing requires a developer-built classifier — the Gateway only does ordering, fallback, and metric-based *sorting*.
- The most powerful production features (AI Gateway, spend dashboards, durable workflows) pull toward Vercel's hosted platform.
- Context management (memory, retrieval, curation) largely left to the developer.

**License:** **Apache-2.0** (verified). AI Gateway hosted product is a separate commercial service.

**Truly model-agnostic?** **Yes** — genuine unified, provider-agnostic interface; switching models is effectively a config change.

**Routing?** **Partial** — Vercel's own KB ("Cost-aware model routing through AI Gateway") *explicitly states the Gateway does NOT provide automatic intelligent routing*; it offers `sort: 'cost'|'ttft'|'tps'`, provider selection, fallbacks, timeouts. Capability-aware routing is roll-your-own.

**Owned context?** **Partial/no** — does not own/curate context in an opinionated way; memory/RAG/curation delegated to the developer and external integrations/MCP.

**GitHub:** ~25.2k stars — <https://github.com/vercel/ai>

## CrewAI

**What it is:** Open-source, lean Python framework for orchestrating role-playing multi-agent systems, with two primitives: "Crews" (autonomous agent collaboration) and "Flows" (event-driven deterministic workflows). A paid hosted "CrewAI AMP/Enterprise" platform sits on top of the OSS core.

**Strengths**
- Lightweight and standalone (no LangChain dependency); fast to stand up for multi-agent role/task patterns.
- Large mindshare and community (~54.6k stars) with a big certification/course ecosystem.
- Clear, opinionated abstractions (agents, tasks, crews, flows) that lower the barrier to multi-agent design.
- Broad LLM connectivity via LiteLLM, including local models (Ollama, LM Studio).

**Weaknesses**
- Opinionated role/task abstraction can constrain non-conversational or highly custom orchestration.
- Production observability/governance largely lives in the paid Enterprise tier (open-core tension).
- Autonomous loops still need heavy guardrailing; less deterministic than graph-based frameworks.
- Context management is left to the developer; no strong built-in owned-context store.

**License:** **MIT** (framework). Open-core: hosted "CrewAI AMP/Enterprise" is a separate commercial SaaS.

**Truly model-agnostic?** **Yes** — routes all LLM calls through LiteLLM (OpenAI, Anthropic, Google, Azure, local, etc.).

**Routing?** **Partial** — you can assign different LLMs per-agent/per-task (cheap model for simple agents, strong for hard), but there is no automatic cost/capability router; routing is manual and static.

**Owned context?** **Partial** — provides memory (short/long-term, entity) and knowledge sources the developer controls, but curation is DIY, not a first-class owned-context engine.

**GitHub:** ~54.6k stars — <https://github.com/crewAIInc/crewAI>

## AutoGen (Microsoft)

**What it is:** A Microsoft research-originated framework for multi-agent conversational AI. As of 2026 it is in **maintenance mode** — its capabilities have been folded into the new **Microsoft Agent Framework (MAF)**, which unifies AutoGen's agent abstractions with Semantic Kernel's enterprise features.

**Strengths**
- Pioneered the multi-agent conversation pattern; mature, well-documented patterns (group chat, etc.).
- Strong research lineage and large community footprint (~59.4k stars).
- Cross-language (Python and .NET) with a clean migration path to MAF.
- Permissively licensed (MIT), so existing code remains freely usable.

**Weaknesses**
- **In maintenance mode** — bug/security fixes only, no new features; Microsoft directs new users to MAF.
- Effectively a dead-end for greenfield projects; adopting now implies a future MAF migration.
- Historically fragmented (0.2 vs 0.4 rewrites) caused churn.
- Enterprise/governance features now center in MAF/Semantic Kernel, not AutoGen itself.

**License:** **MIT** (code); docs CC-BY-4.0.

**Truly model-agnostic?** **Partial** — supports multiple model clients (OpenAI, Azure OpenAI, others) but is historically Azure/OpenAI-centric; MAF continues with stronger Azure integration.

**Routing?** **Partial/no** — different agents can use different model clients (manual), but there is no cost/capability router.

**Owned context?** **Partial** — conversation/agent state is managed in-framework (MAF adds session state), but it is not a dedicated owned-context/RAG engine; Azure is the natural home.

**GitHub:** ~59.4k stars — <https://github.com/microsoft/autogen> (successor: <https://github.com/microsoft/agent-framework>)

---

# Coding agents / CLIs

## Continue.dev

**What it is:** Open-source AI coding assistant delivered as VS Code and JetBrains extensions plus a CLI, positioned as a customizable "coding agent" platform with a hub for sharing model configs, rules, and tools.

**Strengths**
- Deeply customizable config (`config.yaml`) with model "roles": chat, edit, apply, autocomplete, embed, rerank — assign different models to different jobs.
- Broad provider support and a model hub for sharing/reusing configurations.
- Strong autocomplete + chat + edit integration directly in mainstream IDEs.
- Permissive license; self-hostable, BYO-key.

**Weaknesses**
- Large configuration surface; can be complex to tune well.
- More an assistant/IDE-extension framework than a fully autonomous long-horizon agent.
- Quality depends heavily on user-supplied model/config choices.
- No automatic cost/capability routing (manual per-role assignment).

**License:** **Apache-2.0** (verified).

**Truly model-agnostic?** **Yes** — Anthropic, OpenAI, Azure, Gemini, Mistral, Ollama, Bedrock, xAI, more; BYO key.

**Routing?** **Partial** — multiple providers and per-role/per-task model assignment plus a model picker, but routing is manually configured, not automatic dispatch.

**Owned context?** **Yes** — the harness builds/curates repo context (indexing/embeddings, @-context providers, rules) locally; not ceded to a closed vendor.

**GitHub:** ~34.6k stars — <https://github.com/continuedev/continue>

## Aider

**What it is:** Terminal-based "AI pair programming" tool that edits code in your local git repo via LLMs, automatically committing each change. CLI-first, no IDE required.

**Strengths**
- Excellent git integration — auto-commits each change with sensible messages, easy to review/revert.
- Automatic "repository map" gives the model concise whole-repo context efficiently.
- Well-known model-evaluation leaderboard; supports 100+ languages.
- Very wide model support with simple per-model CLI flags; works with local models.

**Weaknesses**
- Terminal-only UX; no GUI/IDE-native experience.
- Less autonomous multi-step "agent" behavior than agentic competitors (more interactive pairing).
- Manual model selection per session; no automatic routing.
- Quality and cost depend on the user choosing the right model.

**License:** **Apache-2.0** (verified).

**Truly model-agnostic?** **Yes** — GPT-5/4o, Claude, Gemini, DeepSeek, xAI Grok, Ollama/self-hosted, OpenRouter, OpenAI-compatible APIs.

**Routing?** **Partial** — many providers and BYO key with model selection via flags (and a separate weak/editor model can be set), but no automatic cost/capability router.

**Owned context?** **Yes** — Aider builds/curates the repo map and selects files/context locally; not ceded to a closed vendor.

**GitHub:** ~46.8k stars — <https://github.com/Aider-AI/aider>

## OpenHands (formerly OpenDevin)

**What it is:** Open-source autonomous software-development agent platform ("self-hosted developer control center for coding agents and automations") that runs agents locally, in Docker, on VMs, or in the cloud, with workflow/automation integrations (GitHub, Slack, Linear).

**Strengths**
- Fully autonomous, long-horizon agent that runs commands, browses, and edits across files.
- Sandboxed execution (Docker/VM) and self-hostable; strong automation/scheduling/webhook story.
- "LLM profiles" save multiple model configs and switch mid-conversation without losing context.
- Context "condenser" compresses long histories (scales linearly vs quadratically), preserving goals/files/failing tests.

**Weaknesses**
- Heavier to set up/run (Docker/infra) than an IDE extension.
- Autonomous agents can be token-costly on long tasks.
- Reliability/cost varies with chosen model; many moving parts.
- The `enterprise/` directory carries a separate non-MIT license.

**License:** **MIT** for the core (verified); note the `enterprise/` directory uses a separate license.

**Truly model-agnostic?** **Yes** — "use with any LLM," configurable LLM profiles; can also wrap Claude Code, Codex, Gemini, or any ACP-compatible agent.

**Routing?** **Partial-to-yes** — LLM profiles enable mid-task model switching (cheap for exploration, strong for reasoning); config includes a `multimodal_router` for switching by input type. Switching is largely user-driven, not fully automatic cost-based dispatch.

**Owned context?** **Yes** — the harness owns context via condensers (plug-in objects that decide whether/how to compress history before each LLM call).

**GitHub:** ~78.7k stars — <https://github.com/All-Hands-AI/OpenHands>

## Cline

**What it is:** Open-source autonomous coding agent that runs as a VS Code extension, JetBrains plugin, CLI, and SDK. Reads project structure, makes coordinated multi-file edits, runs shell commands, with plan/act workflows and human approval gates.

**Strengths**
- Strong agentic plan/act loop with human-in-the-loop approval controls.
- Very broad model support, including OpenRouter (200+ models) and any OpenAI-compatible endpoint; BYO key.
- Multiple surfaces (IDE, JetBrains, CLI, SDK) from one project.
- Apache-2.0; transparent, no proprietary backend required.

**Weaknesses**
- Autonomous edits + command execution require careful supervision.
- Token costs can be high on large agentic tasks.
- No automatic cost/capability routing (manual model picker).
- Effectiveness depends on the user-chosen model.

**License:** **Apache-2.0** (verified).

**Truly model-agnostic?** **Yes** — Anthropic, OpenAI, Gemini, OpenRouter (200+), Bedrock, Azure/Vertex, Ollama/LM Studio, any OpenAI-compatible API; BYO key.

**Routing?** **Partial** — multiple providers, BYO key, model picker, separate plan-vs-act model selection — but selection is manual.

**Owned context?** **Yes** — the agent assembles/curates context from the repo locally; not ceded to a closed vendor.

**GitHub:** ~64k stars — <https://github.com/cline/cline>

## Roo Code (a Cline fork)

**What it is:** Open-source VS Code extension ("a whole dev team of AI agents in your editor"), forked from Cline, with role-specific Modes (Code, Architect, Ask, Debug, Test) and optional Roo Code Cloud agents launchable from GitHub/web/Slack. Actively maintained (updates as recent as May 2026).

**Strengths**
- Role-specific Modes constrain the agent's scope per task (Architect/Code/Debug/Test/Ask).
- Explicitly model-agnostic, BYOK across dozens of providers and hundreds of models; per-mode model selection.
- Ships features fast (multiple updates per week); free-forever local extension plus optional Cloud agents.
- Apache-2.0; inherits Cline's broad provider support plus experimental VS Code Language Model API support.

**Weaknesses**
- VS Code-centric (less multi-surface than Cline's IDE/CLI/SDK spread).
- Fork dynamics — overlaps heavily with upstream Cline; differentiation is mostly modes/UX.
- Autonomous edits need supervision; token costs scale with task size.
- No automatic cost/capability routing (manual selection, though it markets choosing models "according to budget").

**License:** **Apache-2.0** (verified).

**Truly model-agnostic?** **Yes** — Anthropic, OpenAI, Gemini, DeepSeek, Ollama/local, dozens of providers/hundreds of models; BYOK.

**Routing?** **Partial** — per-mode model assignment and a model picker let users match models to budget/skill, but switching is manual.

**Owned context?** **Yes** — like Cline, builds/curates repo context locally; not ceded to a closed vendor.

**GitHub:** ~24.3k stars — <https://github.com/RooCodeInc/Roo-Code>

## Codex CLI (OpenAI)

**What it is:** A lightweight, terminal-based agentic coding tool from OpenAI, rewritten in Rust (~96% Rust). Runs locally, sandboxes execution, and is tightly integrated with ChatGPT plans / OpenAI API keys, with IDE and desktop companions.

**Strengths**
- Fast native Rust binary with a strong local sandbox model for command/file execution.
- Deep first-class integration with OpenAI's strongest coding models (gpt-5.x-codex family) and ChatGPT subscriptions.
- Genuinely open source (Apache-2.0) — auditable, forkable, large contributor community.
- Configurable custom model providers via `config.toml` (OpenRouter, Azure, Ollama, LM Studio, DeepSeek, etc.).

**Weaknesses**
- Tuned and defaulted for OpenAI; non-OpenAI use is a manual `config.toml` exercise, not a first-class path.
- The February 2026 removal of the `chat/completions` wire API broke many custom providers — only `wire_api = "responses"` works now, narrowing real-world provider compatibility.
- No automatic cost/capability routing between models.
- Onboarding/auth is funneled through ChatGPT account tiers.

**License:** **Apache-2.0** (verified).

**Truly model-agnostic?** **Partial** — open and provider-configurable, but architecturally OpenAI-first; the Responses-API requirement limits which third-party providers actually work.

**Routing?** **No** — manual model selection / profiles only; no automatic lead/worker switching.

**Owned context?** **Partial** — the OSS harness controls context assembly locally, but is oriented around OpenAI's stack and Responses API.

**GitHub:** ~94.4k stars — <https://github.com/openai/codex>

## Claude Code (Anthropic)

**What it is:** Anthropic's agentic coding tool living in the terminal (plus a redesigned macOS/Windows desktop app as of April 2026), built on the Claude Agent SDK. Understands the codebase, runs routine tasks, and handles git workflows via natural language.

**Strengths**
- Best-in-class agentic performance with Anthropic's frontier Claude models; deeply tuned harness + model co-design.
- Strong context handling (codebase understanding, MCP connectivity, subagents).
- Mature ecosystem: hooks, slash commands, MCP, IDE integrations, GitHub `@claude`.
- Clean IP story — Anthropic assigns output rights to the user.

**Weaknesses**
- Proprietary and closed — the public repo is largely a tracker/distribution + docs surface; the core CLI ships as a built artifact, not open source.
- Locked to Anthropic models only (Anthropic API, Bedrock, or Vertex — all Claude); cannot natively drive GPT/Gemini/open models.
- Usage governed by Anthropic Commercial Terms; cost tied to Anthropic pricing/plans.
- No cross-vendor routing; context strategy is ceded to a single closed vendor.

**License:** **Proprietary** — "© Anthropic PBC. All rights reserved. Use is subject to Anthropic's Commercial Terms of Service" (verified LICENSE.md).

**Truly model-agnostic?** **No** — Anthropic Claude only (multiple hosting backends, same model family).

**Routing?** **No** across vendors. Limited within-Anthropic: you can pick models (`/model`, `--model`, `ANTHROPIC_MODEL`) and assign cheaper models to subagents, but there is no automatic cost-based router.

**Owned context?** **No / ceded** — context curation is excellent but proprietary and bound to one closed vendor (precisely the concern glamfire positions against).

**GitHub:** ~135k stars (tracker repo) — <https://github.com/anthropics/claude-code>

## Goose (Block → Agentic AI Foundation / Linux Foundation)

**What it is:** An open-source, extensible, general-purpose AI agent that runs on your machine (CLI, desktop app, API) and automates the full dev loop — install, execute, edit, test, read results — with any LLM. Originally "codename goose" from Block; the project has moved from `block/goose` to the **Agentic AI Foundation (AAIF) at the Linux Foundation** (`aaif-goose/goose`).

**Strengths**
- Genuinely model-agnostic: 15+ providers (Anthropic, OpenAI, Google, Ollama, OpenRouter, Azure, Bedrock, more), including local models.
- **Has cost/capability routing via the Lead/Worker pattern** — `GOOSE_LEAD_MODEL` (strong model for planning/reasoning) auto-switches to `GOOSE_WORKER_MODEL` (cheap/fast for execution), with optional `GOOSE_LEAD_PROVIDER`. This is the closest analog to glamfire's center/edge routing.
- Permissive Apache-2.0 under neutral, vendor-independent foundation governance.
- Extensible via MCP/extensions; integrates with AI gateways/routers (Tetrate Agent Router, Zuplo) for unified billing/cost visibility.

**Weaknesses**
- Lead/Worker routing is a coarse two-tier mechanism, not fine-grained per-task cost/capability optimization (consolidation work in flight, issue #4036).
- Being model-agnostic, it lacks the tight model+harness co-tuning that OpenAI/Anthropic achieve with their own models.
- General-purpose framing (research/writing/automation) rather than laser-focused on the coding "last mile."
- Governance/repo transition (Block → AAIF) adds ecosystem churn (forks, moved links, docs catching up).

**License:** **Apache-2.0** (verified).

**Truly model-agnostic?** **Yes** — provider-pluggable across 15+ backends including local.

**Routing?** **Yes (coarse)** — automatic Lead/Worker model switching for cost optimization; integrates with external routing gateways.

**Owned context?** **Yes** — the OSS harness runs locally and owns/curates its own context, not ceded to a closed vendor.

**GitHub:** ~50.4k stars — <https://github.com/aaif-goose/goose> (formerly <https://github.com/block/goose>)

---

# Low-code agent platforms

## Dify

**What it is:** An open-source, low-code/visual LLMOps platform for building generative-AI apps and agents — a visual workflow/agent builder, RAG pipeline, prompt IDE, and observability in one. Targets teams wanting a full app-building backend rather than just a code library.

**Strengths**
- Comprehensive all-in-one platform (workflows, RAG, agents, prompt management, observability) out of the box.
- Visual, low-code builder accessible to non-engineers; fast prototyping.
- Broad model-provider support and a plugin/marketplace ecosystem.
- Self-hostable; strong for internal tooling and rapid app delivery.

**Weaknesses**
- **License is NOT true open source** — modified Apache 2.0 with commercial restrictions.
- Cannot run as a multi-tenant SaaS without a commercial license from LangGenius.
- Cannot remove/modify the Dify logo/copyright in the frontend console.
- Heavier and more opinionated; visual abstractions limit deep customization.

**License:** **Dify Open Source License = Apache 2.0 + two restrictions** (verified): (1) no multi-tenant SaaS operation without authorization; (2) no removal/modification of the Dify logo/copyright in the console frontend. Source-available, **not OSI-compliant**.

**Truly model-agnostic?** **Yes** — many providers (OpenAI, Anthropic, Azure, Google, local/Ollama, more via plugins) with system/per-app model config.

**Routing?** **Partial** — configurable model selection per app/node plus load-balancing/fallback across model configs, but not a true automated cost/capability router.

**Owned context?** **Yes** (with partial lock-in caveat) — owns/curates context via its built-in knowledge base / RAG pipeline and self-hosted datasets; context lives inside the Dify platform.

**GitHub:** 100k+ stars — <https://github.com/langgenius/dify>

## Flowise

**What it is:** An open-source, Node.js-based visual (drag-and-drop) builder for LLM apps and AI agents, with Agentflow (multi-agent), Chatflow (single-agent/RAG), and classic chain modes. **Acquired by Workday (announced August 2025).**

**Strengths**
- Highly visual, low-code canvas; very fast to prototype agents and RAG flows.
- Apache-2.0 community core; freely self-hostable for commercial use.
- Large adoption (~50k+ stars) and broad integration library; built on LangChain.
- Backing/resources of Workday post-acquisition; active releases (v3.x, LangChain v1 migration, AgentFlow SDK).

**Weaknesses**
- **Not purely Apache 2.0** — enterprise features (`packages/server/src/enterprise`) are under a separate Commercial License (open-core).
- Visual abstraction limits deep/custom logic vs code-first frameworks.
- Inherits LangChain's complexity and churn; flows can become hard to maintain at scale.
- Post-acquisition strategic direction (Workday platform focus) creates roadmap/governance uncertainty for independent users.

**License:** **Open-core / dual** — Community Edition **Apache-2.0**; enterprise modules under a separate proprietary **Commercial License** (verified LICENSE.md).

**Truly model-agnostic?** **Yes** — many providers via LangChain nodes (OpenAI, Anthropic, Google, Azure, Cohere, Mistral, local/Ollama, etc.).

**Routing?** **Partial** — wire specific model nodes into flows and build conditional routing/fallback manually (Condition nodes), but no native automatic cost/capability router.

**Owned context?** **Partial** — provides document stores/vector store and memory nodes you configure and host (context you own), but curation is manual flow-building, not a dedicated owned-context engine.

**GitHub:** ~50k+ stars — <https://github.com/FlowiseAI/Flowise>

---

# Summary comparison

| Name | Category | License | Model-agnostic | Routing | Owned context | Primary weakness |
|------|----------|---------|----------------|---------|---------------|------------------|
| LangChain/LangGraph | Framework | MIT core / Elastic 2.0 server / proprietary SaaS | Yes | Partial (DIY) | No/partial | Abstraction bloat; production runtime not MIT |
| LlamaIndex | Framework (RAG) | MIT core / proprietary LlamaCloud | Partial-yes | No | Partial | Best value behind closed LlamaCloud |
| Mastra | Framework (TS) | Apache-2.0 core / source-available `ee/` | Yes | Partial (manual) | Yes | No auto routing; TS-only; young |
| Vercel AI SDK | Framework (TS) | Apache-2.0 | Yes | Partial (Gateway sorts only) | Partial/no | TS-only; no owned-context layer |
| CrewAI | Framework (multi-agent) | MIT (open-core SaaS) | Yes | Partial (manual per-agent) | Partial | Opinionated; governance in paid tier |
| AutoGen | Framework (multi-agent) | MIT | Partial | Partial/no | Partial | Maintenance mode; superseded by MAF |
| Continue.dev | Coding agent (IDE) | Apache-2.0 | Yes | Partial (per-role manual) | Yes | Config-heavy; assistant > autonomous |
| Aider | Coding agent (CLI) | Apache-2.0 | Yes | Partial (manual flags) | Yes | Terminal-only; less autonomous |
| OpenHands | Coding agent (autonomous) | MIT core (`enterprise/` separate) | Yes | Partial-yes (profiles) | Yes | Heavy infra; token-costly |
| Cline | Coding agent (IDE/CLI) | Apache-2.0 | Yes | Partial (manual picker) | Yes | Needs supervision; no auto routing |
| Roo Code | Coding agent (IDE) | Apache-2.0 | Yes | Partial (per-mode manual) | Yes | VS Code-centric; fork overlap |
| Codex CLI | Coding agent (CLI) | Apache-2.0 | Partial (OpenAI-first) | No | Partial | OpenAI-tuned; Responses-API lock |
| Claude Code | Coding agent (CLI) | Proprietary | No (Claude only) | No (cross-vendor) | No / ceded | Single closed vendor |
| Goose | Coding agent (general) | Apache-2.0 | Yes | **Yes (coarse Lead/Worker)** | Yes | Coarse routing; general-purpose, not last-mile |
| Dify | Low-code platform | Apache-2.0 + restrictions (source-available) | Yes | Partial (load-balance/fallback) | Yes | Not OSI open source; SaaS restriction |
| Flowise | Low-code platform | Apache-2.0 core / proprietary enterprise | Yes | Partial (manual condition nodes) | Partial | Open-core; abstraction limits |

---

# Where glamfire wins / gaps to exploit

**Honest read: two of glamfire's three pillars are table stakes, and one is genuine white space.**

- **Model-agnostic is NOT a differentiator.** Every open competitor here is model-agnostic — LangChain, Mastra, Vercel AI SDK, CrewAI, Continue, Aider, OpenHands, Cline, Roo, Goose, Dify, Flowise. glamfire must *match* this, not claim it as unique. The only non-agnostic tools are Claude Code (Claude-only) and, in practice, Codex CLI (OpenAI-first). Pitch model-agnosticism as a baseline expectation, not the headline.

- **Owned context is half table stakes, half differentiator.** Every coding agent (Continue, Aider, OpenHands, Cline, Roo, Goose) already owns/curates repo context locally — so "owned context" alone won't separate glamfire from the coding-agent pack. It *does* differentiate sharply against (a) **Claude Code**, which cedes context to a single closed vendor, and (b) framework players whose best context value lives in closed SaaS (**LlamaIndex** → LlamaCloud, **LangChain** → LangSmith). The defensible version of this pillar is "owned context *with an opinionated curation engine that is vendor- and infra-neutral*," contrasted against the closed-SaaS pull of LangChain/LlamaIndex/Vercel.

- **Intelligent cost/capability routing is the real white space.** This is the strongest, most defensible wedge. **Not one framework ships automatic capability-aware routing** — LangChain, LlamaIndex, Mastra, CrewAI, AutoGen, Continue, Aider, Cline, Roo, Codex CLI, Claude Code, Dify, and Flowise all offer at most *manual* per-agent/per-role/per-mode model selection or, in Vercel's case, cost/latency *sorting* (Vercel's own docs explicitly disclaim automatic intelligent routing). The center/edge framing — route the routine "center" of the task distribution to a cheap/fast model and escalate only "edge" tasks to a frontier model — is articulated by essentially no competitor as a product thesis.

**Closest threats (ranked):**

1. **Goose (Block / AAIF)** — *the closest competitor by a wide margin.* It is the only tool that combines all three pillars: open Apache-2.0, genuinely model-agnostic, owns local context, AND already does cost routing via the **Lead/Worker** pattern. glamfire's differentiation against Goose is narrow and must be earned on execution: (a) **fine-grained per-task routing** vs Goose's coarse two-tier lead/worker split; (b) a **laser focus on the coding last mile** vs Goose's general-purpose framing; (c) an explicit **center/edge task-distribution model** as the product's organizing thesis. If Goose ships finer-grained routing first (issue #4036 hints at consolidation), the window narrows.
2. **OpenHands** — autonomous, self-hosted, owns context via condensers, and its "LLM profiles" + `multimodal_router` come closest to mid-task switching among the coding agents. Still user-driven, not automatic cost dispatch — but architecturally the nearest to glamfire's routing idea after Goose.
3. **Continue.dev** — its per-role model assignment (chat/edit/apply/autocomplete/embed) is conceptually adjacent to capability routing, just static and manual. A small step from "roles" to "automatic routing" would make it a direct threat.
4. **Claude Code** — not a routing/agnostic threat at all, but the *quality benchmark* and the strongest contrast for glamfire's narrative: it is the anti-thesis (proprietary, single-vendor, context ceded). Use it as the "why owned + agnostic matters" foil.

**White space to plant a flag in:**

- **Automatic, fine-grained, cost/capability-aware routing** as a first-class product capability (not a primitive), driven by a real classifier/policy, benchmarked on cost-savings-at-equal-quality.
- **The center/edge task-distribution thesis** as the organizing story — measure a team's task distribution, route the center cheap, escalate the edge. No competitor markets this.
- **Vendor- and infra-neutral owned context** that contrasts against the closed-SaaS pull of LangChain/LlamaIndex/Vercel and the single-vendor lock of Claude Code.
- **Coding last-mile focus** — Goose is general-purpose; the frameworks are construction kits. A finished, opinionated last-mile coding harness with routing built in is unoccupied.

---

# Key takeaways for glamfire

- **Lead with routing, not model-agnosticism.** Model-agnostic is baseline; automatic cost/capability routing is the genuine gap across all 15 competitors. Make it the headline and prove it with cost-at-equal-quality benchmarks.
- **Goose is the one to beat.** It is the only competitor with all three pillars plus working (coarse) routing. Differentiate on fine-grained per-task routing, the center/edge thesis, and last-mile coding focus — and ship before Goose's routing consolidation lands.
- **Frame owned context as vendor-neutral curation, not just "local files."** Every coding agent already keeps context local; the sharper contrast is against closed-SaaS context (LangSmith, LlamaCloud) and single-vendor lock (Claude Code).
- **Use Claude Code as the foil, not a feature comparison.** It wins on raw quality but embodies exactly what glamfire argues against — closed, single-vendor, context ceded.
- **Watch the licensing landscape.** Many "open" competitors are open-core or source-available with commercial strings (LangGraph server = Elastic 2.0; Mastra `ee/`; Dify SaaS restriction; Flowise enterprise; LlamaCloud; CrewAI Enterprise). A cleanly permissive (MIT/Apache-2.0) glamfire is itself a positioning advantage.
- **The center/edge task-distribution story is unclaimed.** No competitor frames its product around routing the routine center cheap and escalating only the edge. That narrative is glamfire's to own.

---

# Sources

**Agent / orchestration frameworks**
- LangChain — <https://github.com/langchain-ai/langchain>
- LangGraph — <https://github.com/langchain-ai/langgraph>
- LangChain models docs — <https://docs.langchain.com/oss/python/langchain/models>
- LangGraph platform — <https://www.langchain.com/langgraph>
- LlamaIndex — <https://github.com/run-llama/llama_index>
- LlamaIndex LICENSE — <https://raw.githubusercontent.com/run-llama/llama_index/main/LICENSE>
- LlamaIndex site — <https://www.llamaindex.ai/>
- LlamaIndex router docs — <https://developers.llamaindex.ai/python/framework/module_guides/querying/router/>
- Mastra — <https://github.com/mastra-ai/mastra>
- Mastra site — <https://mastra.ai>
- Mastra Model Router — <https://mastra.ai/blog/model-router>
- Mastra memory docs — <https://mastra.ai/docs/memory/overview>
- Vercel AI SDK — <https://github.com/vercel/ai>
- Vercel AI SDK LICENSE — <https://github.com/vercel/ai/blob/main/LICENSE>
- Vercel cost-aware routing KB — <https://vercel.com/kb/guide/cost-aware-model-routing-with-ai-gateway>
- Vercel AI Gateway provider options — <https://vercel.com/docs/ai-gateway/models-and-providers/provider-options>
- CrewAI — <https://github.com/crewAIInc/crewAI>
- CrewAI open source — <https://crewai.com/open-source>
- AutoGen — <https://github.com/microsoft/autogen>
- Microsoft Agent Framework overview — <https://learn.microsoft.com/en-us/agent-framework/overview/>
- AutoGen → MAF migration guide — <https://learn.microsoft.com/en-us/agent-framework/migration-guide/from-autogen/>
- Microsoft Agent Framework repo — <https://github.com/microsoft/agent-framework>

**Coding agents / CLIs**
- Continue.dev — <https://github.com/continuedev/continue>
- Continue model providers — <https://docs.continue.dev/customize/model-providers/overview>
- Continue configuring models/rules/tools — <https://docs.continue.dev/guides/configuring-models-rules-tools>
- Aider — <https://github.com/Aider-AI/aider>
- Aider leaderboards — <https://aider.chat/docs/leaderboards/>
- OpenHands — <https://github.com/All-Hands-AI/OpenHands>
- OpenHands LLM settings — <https://docs.openhands.dev/openhands/usage/settings/llm-settings>
- OpenHands context condensation — <https://www.openhands.dev/blog/openhands-context-condensensation-for-more-efficient-ai-agents>
- Cline — <https://github.com/cline/cline>
- Roo Code — <https://github.com/RooCodeInc/Roo-Code>
- Roo Code providers — <https://docs.roocode.com/providers>
- Roo Code marketplace — <https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline>
- Codex CLI — <https://github.com/openai/codex>
- Codex CLI docs — <https://developers.openai.com/codex/cli>
- Codex advanced config — <https://developers.openai.com/codex/config-advanced>
- Codex + OpenRouter tutorial — <https://openrouter.ai/blog/tutorials/codex-cli-openrouter/>
- Claude Code — <https://github.com/anthropics/claude-code>
- Claude Code LICENSE — <https://github.com/anthropics/claude-code/blob/main/LICENSE.md>
- Claude Code product page — <https://www.anthropic.com/product/claude-code>
- Goose (AAIF) — <https://github.com/aaif-goose/goose>
- Goose multi-model docs — <https://goose-docs.ai/docs/guides/multi-model/>
- Block introduces goose — <https://block.xyz/inside/block-open-source-introduces-codename-goose>
- Goose routing consolidation issue — <https://github.com/block/goose/issues/4036>

**Low-code agent platforms**
- Dify — <https://github.com/langgenius/dify>
- Dify LICENSE — <https://github.com/langgenius/dify/blob/main/LICENSE>
- Dify open-source policy — <https://docs.dify.ai/en/policies/open-source>
- Dify "is it open source" debate — <https://github.com/langgenius/dify/issues/18502>
- Flowise — <https://github.com/FlowiseAI/Flowise>
- Flowise LICENSE — <https://github.com/FlowiseAI/Flowise/blob/main/LICENSE.md>
- Workday acquires Flowise — <https://www.prnewswire.com/news-releases/workday-acquires-flowise-bringing-powerful-ai-agent-builder-capabilities-to-the-workday-platform-302530557.html>
- Flowise site — <https://flowiseai.com/>
