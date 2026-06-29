# 08 — MCP & Agent Tool-Use Design

Research notes for **glamfire**, a model-agnostic AI harness for the "last mile" of
agentic AI (primary target: GLM 5.2 served via Fireworks). Focus: how the Model Context
Protocol (MCP) and tool-use design patterns let a harness expose tools portably across
model vendors.

_Current as of June 2026. All facts verified via web fetches; URLs in **Sources**._

---

## 1. The MCP Specification

### What it is
- MCP is an **open protocol that standardizes how LLM applications connect to external
  data sources and tools** — described by its authors as analogous to the Language Server
  Protocol (LSP), but for "context and tools" instead of programming-language features.
- Created and open-sourced by **Anthropic** (first announced November 2024). It is now
  governed in the open at `github.com/modelcontextprotocol` with a community Standards
  Track / SEP (Spec Enhancement Proposal) process.
- The protocol defines three roles:
  - **Hosts** — LLM applications that initiate connections (e.g. Claude Desktop, an IDE).
  - **Clients** — connectors living inside the host, one per server connection.
  - **Servers** — services that expose context and capabilities.

### Wire format: JSON-RPC 2.0
- All MCP messages use **JSON-RPC 2.0** (requests, responses, notifications).
- The current stable spec (`2025-11-25`) uses **stateful connections** with explicit
  client/server **capability negotiation** during an `initialize` handshake.
- Utilities layered on top: progress tracking, cancellation, error reporting, logging,
  configuration.

### Core primitives
**Server → client (things a server offers):**
- **Tools** — functions the model can invoke (the action layer; arbitrary code execution).
- **Resources** — readable context/data exposed by URI for the user or model.
- **Prompts** — reusable, parameterized message/workflow templates (often surfaced as
  slash commands or menu items in clients).

**Client → server (things a client offers back):**
- **Sampling** — a server asks the host's LLM to generate a completion (enables
  server-driven, recursive/agentic behavior without the server holding its own model key).
- **Roots** — the client tells the server which URI/filesystem boundaries it may operate in.
- **Elicitation** — a server requests additional **structured input from the user**
  mid-task (added in the 2025-06 revision).

### Transports
- **stdio** — server runs as a local subprocess; JSON-RPC over stdin/stdout. Lowest
  latency, simplest, ideal for local tools. No network exposure.
- **Streamable HTTP** — single HTTP endpoint accepting **POST and GET**, with the server
  optionally upgrading to **Server-Sent Events (SSE)** to stream multiple messages.
  Introduced in the **2025-03-26** revision; supports session management via the
  `Mcp-Session-Id` header.
- The older **HTTP+SSE** transport (from `2024-11-05`) was **deprecated in 2025-03-26** in
  favor of Streamable HTTP. Streamable HTTP simplifies security: a standard
  `Authorization: Bearer` header can ride on every request rather than a long-lived SSE
  channel.

### Authorization (OAuth)
- HTTP-based MCP servers use an **OAuth 2.1** authorization framework. The MCP server acts
  as an OAuth **resource server**; clients obtain access tokens and present them as bearer
  tokens. The spec emphasizes audience-restricting tokens to the specific MCP server.
- The upcoming `2026-07-28` revision (see below) further hardens this with mandatory `iss`
  (issuer) validation and OpenID Connect alignment.

### Recent spec revisions (timeline)
- **2024-11-05** — initial public release (stdio + HTTP+SSE).
- **2025-03-26** — Streamable HTTP introduced, HTTP+SSE deprecated, OAuth framework.
- **2025-06-18** — added **elicitation**, structured tool output, security clarifications.
- **2025-11-25** — current **stable** revision; full JSON-RPC 2.0, stateful core,
  primitives as above.
- **2026-07-28 (Release Candidate, locked 2026-05-21)** — the **largest revision since
  launch**. Highlights:
  - **Stateless protocol core**: eliminates the `initialize` handshake and
    `Mcp-Session-Id`; client info/capabilities travel in `_meta` on every request — lets
    servers run behind a plain round-robin load balancer with no sticky sessions.
  - **Extensions framework**: extensions become first-class, identified by reverse-DNS
    IDs, versioned independently of the core spec.
  - **MCP Apps** (extension): servers can ship interactive HTML UIs rendered in sandboxed
    iframes.
  - **Tasks** (extension): long-running work via `tasks/get` / `tasks/update` /
    `tasks/cancel`, redesigned around stateless operations.
  - **Authorization hardening**: six SEPs aligning with OAuth 2.0 / OIDC, mandatory `iss`
    validation, `application_type` on client registration.
  - **Formal deprecation policy**: ≥12 months between deprecation and removal. Notably,
    **Roots, Sampling, and Logging are now deprecated** in this RC.
  - Full **JSON Schema 2020-12** support for tool schemas; **W3C Trace Context**
    propagation; caching headers (`ttlMs`, `cacheScope`).
  - _Note: RC, not final — details may shift before the July 2026 release._

---

## 2. The MCP Ecosystem

### Official SDKs (from modelcontextprotocol.io/docs/sdk, tiered)
- **Tier 1** (most complete/supported): **TypeScript**, **Python**, **C#** (with
  Microsoft), **Go**.
- **Tier 2**: **Java** (Spring AI backing), **Rust**.
- **Tier 3**: **Swift**, **Ruby**, **PHP**, **Kotlin** (JetBrains).
- All SDKs support building both servers and clients, expose tools/resources/prompts, and
  support local (stdio) + remote transports with type safety.
- The TypeScript SDK is the flagship reference (tens of millions of npm downloads,
  thousands of dependents). **FastMCP** (Python) is a popular higher-level authoring
  framework on top of the official SDK.

### Notable servers
- **Actively maintained reference servers** (in `modelcontextprotocol/servers`):
  **Everything, Fetch, Filesystem, Git, Memory, Sequential Thinking, Time**.
- **Archived reference servers → now vendor-maintained**: GitHub, GitLab, Slack, Google
  Drive, Postgres, Sentry, SQLite, Puppeteer, Redis, Google Maps, Brave Search, etc.
  (The trend is that vendors own first-party servers for their own products.)
- Browser automation: **Playwright MCP** (Microsoft) uses accessibility-tree snapshots
  (low token, deterministic); **Puppeteer / Chrome DevTools MCP** use CDP for
  screenshots/PDF and pixel-level control.
- **Postgres** reference server is deliberately **read-only** (queries + schema
  inspection) — a good safety pattern.

### Registries / directories
- **Official MCP Registry** at `registry.modelcontextprotocol.io` — Anthropic retired its
  hand-maintained list in favor of this central index.
- Third-party directories: **Smithery**, **Glama**, **MintMCP**, plus many "awesome-mcp"
  lists. Community directories claim 2,000–5,000+ servers (mid-2026), though the
  practically useful set is far smaller.

### Clients that support MCP
- **Claude Desktop**, **Claude Code**, **Cursor**, **Windsurf**, **Cline**, **VS Code**
  (native MCP since v1.99, via Copilot Chat), **Codex**, **Gemini CLI**, **Goose**,
  **JetBrains** IDEs, **Zed**, **Replit**, **Sourcegraph**, and more.
- Core value prop: **write a server once, use it in any compliant client** — but each
  client still has its own config file/location for registering servers.

### Security considerations
- **Tool safety**: tool descriptions/annotations **must be treated as untrusted** unless
  from a trusted server (per the spec). Tools are arbitrary code execution; the spec
  requires explicit **user consent** before tool invocation.
- **Tool poisoning**: a form of indirect prompt injection where malicious instructions are
  hidden in a tool's `description`/metadata (invisible to users) and injected into the
  model's context at registration. Invariant Labs reported ~5.5% of in-the-wild servers
  showing poisoning patterns and ~33% allowing unrestricted network access.
- **The lethal trifecta** (Simon Willison's framing) — exploitable when an agent
  simultaneously has: **(1) access to private data**, **(2) exposure to untrusted
  content**, and **(3) an exfiltration vector** (outbound request, link/image render, API
  call). No "rogue" model needed — it just follows injected instructions.
- A widely cited real incident: the **GitHub MCP server** could be steered via a malicious
  public issue to read private repos and exfiltrate data through a PR.
- **Client-side validation is weak** in practice: many clients accept server-provided tool
  metadata without rigorous checks; cross-tool poisoning and hidden-parameter exploits
  have been demonstrated against popular clients.

---

## 3. How a Model-Agnostic Harness Should Adopt MCP

MCP is the **single most important lever for tool portability** in a model-agnostic
harness, because it decouples the *tool definitions and execution* from any one model
vendor's API.

- **MCP as the tool layer, not the model layer.** glamfire should own the agent loop and
  the model adapters, but treat MCP servers as the canonical source of tools/resources.
  Tools are authored once (any language SDK) and reused regardless of whether the
  underlying model is GLM 5.2, Claude, GPT, or an open model on vLLM.
- **Decoupling from the model vendor.** A tool defined as an MCP server has **no
  dependency on a model provider's tool-call API**. The harness pulls the JSON-Schema tool
  definitions from MCP and re-emits them in whatever shape the target model expects
  (OpenAI `tools`, Anthropic `tools`, Gemini `functionDeclarations`). This is the heart of
  the model-agnostic story.
- **Dynamic tool discovery.** Use `tools/list` (and `list_changed` notifications) to
  discover tools at runtime rather than hardcoding them. Cache the schemas, and re-fetch on
  change notifications.
- **Gating / allowlisting.** Given tool poisoning and the lethal trifecta, the harness
  must:
  - default-deny and **allowlist** servers and individual tools,
  - require explicit consent (or policy) for write/network/destructive tools,
  - pin/verify server identity and hash tool descriptions to detect silent changes
    ("rug-pull" mutations after approval),
  - separate trust domains so a server that reads untrusted content cannot also exfiltrate
    (break the trifecta architecturally).
- **Namespacing.** When aggregating many servers, prefix tool names by server
  (`server__tool`) to avoid collisions and to make allowlist policy and audit logs
  unambiguous. This also matters for models that get confused by duplicate tool names.
- **Context ownership.** Since glamfire owns context, it should decide which MCP
  resources/prompts get injected, summarize large tool outputs, and keep tool schemas out
  of the way until relevant (lazy/scoped tool exposure) to control token budget and reduce
  injection surface.
- **Transport choice.** Prefer **stdio** for local trusted tools (no network surface) and
  **Streamable HTTP + OAuth** for remote/shared tools. The 2026 stateless core makes
  remote MCP cheap to scale behind load balancers — relevant if glamfire hosts shared tool
  servers.

---

## 4. Agent Loop & Tool-Use Design Patterns

### The core loop: Plan → Act → Observe (ReAct)
- **ReAct** interleaves **Thought → Action (tool call) → Observation (tool result)**,
  looping until the model emits a final answer. Reasoning and acting reinforce each other.
- Most modern frameworks (Vercel AI SDK, LangGraph, OpenAI Agents SDK, Mastra) are
  essentially ReAct loops plus machinery: tool routing, structured outputs, retries,
  parallel calls.
- **Modern reasoning models (GPT-5.x, latest Claude, Gemini, GLM 5.2) do the
  reason-act-observe loop natively** through built-in tool calling, so explicit
  "Thought:/Action:" prompt scaffolding is usually unnecessary — the harness drives the
  loop in code, not in the prompt.

### Function / tool calling mechanics
- **No model executes anything.** The model emits **structured JSON** naming a tool and its
  arguments; the **harness executes** the tool and feeds the result back as a new message.
- **Structured / JSON tool calls**: tools are declared with JSON Schema; the model is
  fine-tuned (or constrained) to emit conforming argument objects.
- **Parallel tool calls**: a single model turn can request multiple independent tool calls;
  the harness should fan them out concurrently and return all results. (LangChain's
  LLMCompiler reported ~3.6× speedup over sequential ReAct by parallelizing independent
  steps.) The harness must preserve call IDs to map results back correctly.

### Error handling & retries
- Tool errors should be returned to the model as **observations** (so it can adapt), not
  thrown away. Distinguish *recoverable* tool errors (return error text, let the model
  retry/adjust) from *fatal* harness errors.
- Guard against malformed tool-call JSON: validate against the schema, and on failure
  either re-ask the model with the validation error or repair. Add **retry caps and loop
  limits** to prevent infinite act/observe cycles.

### Sub-agents / multi-agent patterns
- **Manager / tools pattern**: a central agent delegates subtasks to specialized
  sub-agents exposed *as tools* (OpenAI Agents SDK style).
- **Orchestrator–worker**: a lead agent spawns workers for parallel exploration
  (Anthropic's multi-agent Research system).
- **Handoff**: peer agents transfer control based on specialization.
- Sub-agents are also a **context-isolation** tool: a worker can churn through noisy tool
  output and return only a distilled result to the parent — directly relevant to
  glamfire's harness-owned-context goal.

### Other patterns worth noting
- **Plan-then-Execute / ReWOO**: plan all steps up front, then execute — fewer model calls,
  better for security (the plan can be audited before any tool runs), but less adaptive.
- **CodeAct**: the model writes code that calls tools as functions instead of emitting
  discrete JSON tool calls — expressive and token-efficient for complex orchestration.

---

## 5. Per-Model Differences in Tool Calling (what a harness must normalize)

Every major provider supports tool calling, but the **request/response shapes differ** and
glamfire's model adapters must translate between a single internal tool representation and
each vendor's wire format.

| Model / API | Tool declaration | Tool-call output | Notes |
| --- | --- | --- | --- |
| **OpenAI (GPT-5.x)** | `tools: [{type:"function", function:{name, parameters(JSON Schema)}}]`, `tool_choice` | `tool_calls[]` with `id`, JSON `arguments` (string) | Strict-mode structured outputs; strong, reliable schema adherence. |
| **Anthropic (Claude)** | `tools: [{name, input_schema(JSON Schema)}]`, `tool_choice` | `tool_use` content blocks with `id`, `input` (object) | Results returned as `tool_result` blocks keyed by id. |
| **Google Gemini** | `functionDeclarations` (OpenAPI-subset schema) | `functionCall` parts | Distinct naming; also offers an OpenAI-compatible endpoint and SDK auto-schema from Python fns; client-side validation advised. |
| **GLM 5.2** | OpenAI-style `tools` schema (native function calling) | OpenAI-style `tool_calls` | Reported clean/consistent tool calling and structured JSON; 1M-token context. |
| **Open models via Fireworks / vLLM** | OpenAI-compatible `tools` + `tool_choice` (`auto`/`none`/`required`/named) | OpenAI-style `tool_calls`, streamed incrementally | vLLM needs a per-model `--tool-call-parser`; behavior varies by base model. |

### Key normalization challenges
- **Native vs prompted tool-calling.** Frontier and most served open models have **native**
  tool calling (the API parses tool calls for you). Some smaller/older open models only do
  **prompted** tool calling (you inject the schema into the prompt and parse the output
  yourself). The harness needs a fallback path that injects a tool grammar/JSON-Schema
  prompt and parses the result for models lacking native support.
- **JSON-Schema feature support varies.** Providers differ on advanced schema features
  (`$ref`, `$defs`, recursive refs, enums). Fireworks added recursive `$ref`, root `$id`,
  and nested `$defs`-under-a-property support only in **mid-2026** (earlier returned HTTP
  400). The harness should **simplify/normalize schemas** to a portable subset (or
  per-model-flatten) before sending.
- **Constrained decoding / structured output.** Fireworks and vLLM can enforce output via
  **JSON Schema or context-free grammar** ("grammar mode") to guarantee conforming output
  — a strong reliability lever for weaker open models that the harness can opt into.
- **`arguments` typing.** OpenAI/GLM return arguments as a JSON **string** (must be parsed);
  Anthropic/Gemini return an **object**. The adapter must unify these.
- **Parallel-call support differs.** Not all models reliably emit multiple parallel tool
  calls; the harness should detect capability and degrade to sequential when needed.
- **Tool-result threading differs.** OpenAI uses `role:"tool"` messages with
  `tool_call_id`; Anthropic uses `tool_result` blocks; Gemini uses `functionResponse`
  parts. The adapter must map a single internal "tool result" onto each.
- **Recommended settings.** For tool selection, providers (incl. Fireworks) recommend
  **low temperature (0.0–0.3)** to reduce hallucinated argument values and make tool choice
  deterministic.

---

## Key takeaways for glamfire

- **Adopt MCP as the canonical tool layer.** It is the cleanest way to make tools portable
  across GLM, Claude, GPT, Gemini, and open models — author once, re-emit per model. This
  *is* the model-agnostic story for tools.
- **Own the agent loop in code, not the prompt.** Modern models (incl. GLM 5.2) do
  reason-act-observe natively; glamfire should drive plan→act→observe, parallel fan-out,
  retries, and loop caps itself, keeping tool schemas and results under context control.
- **Build per-model tool adapters around one internal tool/result representation.**
  Normalize: declaration shape, `arguments` string-vs-object, result threading,
  parallel-call capability, and JSON-Schema feature support. Provide a **prompted/grammar**
  fallback for models without robust native tool calling.
- **Lean on Fireworks/vLLM constrained decoding** (JSON Schema / grammar mode, low temp) to
  make weaker open models reliable at tool calls — a differentiator the harness can apply
  uniformly.
- **Make security a first-class harness feature.** Default-deny + allowlist servers/tools,
  consent gates on write/network tools, namespacing (`server__tool`), description hashing
  to catch rug-pulls, and **architecturally break the lethal trifecta** (separate
  untrusted-content readers from exfiltration-capable tools). Treat all tool metadata as
  untrusted input.
- **Watch the 2026-07-28 spec.** The stateless core, Extensions framework, MCP Apps, and
  Tasks change how remote MCP scales and how UIs/long-running work are modeled — but note
  Roots/Sampling/Logging are being **deprecated**, so don't build hard dependencies on
  them.
- **Prefer stdio for local trusted tools, Streamable HTTP + OAuth for remote/shared tools.**

---

## Sources

- [MCP Specification — 2025-11-25 (current stable)](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Transports — 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [The 2026-07-28 MCP Specification Release Candidate (MCP Blog)](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- [The 2026 MCP Roadmap (MCP Blog)](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [MCP Specification & docs repo (GitHub)](https://github.com/modelcontextprotocol/modelcontextprotocol)
- [MCP Official SDKs (tiers + languages)](https://modelcontextprotocol.io/docs/sdk)
- [MCP TypeScript SDK (GitHub)](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Reference Servers (GitHub)](https://github.com/modelcontextprotocol/servers)
- [Chrome DevTools MCP (GitHub)](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Why MCP deprecated SSE for Streamable HTTP (fka.dev)](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [MCP Streamable HTTP & security (Auth0)](https://auth0.com/blog/mcp-streamable-http/)
- [Understanding the Lethal Trifecta of AI Agents (Oso)](https://www.osohq.com/learn/lethal-trifecta-ai-agent-security)
- [MCP Tool Poisoning — How it works (MCP Manager)](https://mcpmanager.ai/blog/tool-poisoning/)
- [Indirect Prompt Injection in MCP: Toxic Triad (Practical DevSecOps)](https://www.practical-devsecops.com/glossary/mcp-indirect-prompt-injection/)
- [MCP Security: Why Best Practices Aren't Enough (Repello AI)](https://repello.ai/blog/mcp-security)
- [Agentic Loops: From ReAct to Loop Engineering — 2026 Guide (Data Science Dojo)](https://datasciencedojo.com/blog/agentic-loops-explained-from-react-to-loop-engineering-2026-guide/)
- [Agentic AI Design Patterns: ReAct, ReWOO, CodeAct (Capabl)](https://capabl.in/blog/agentic-ai-design-patterns-react-rewoo-codeact-and-beyond)
- [What Is the AI Agent Loop? (Oracle)](https://blogs.oracle.com/developers/what-is-the-ai-agent-loop-the-core-architecture-behind-autonomous-ai-systems)
- [Function Calling Guide: GPT, Claude & Gemini — 2026 (ofox.ai)](https://ofox.ai/blog/function-calling-tool-use-complete-guide-2026/)
- [The guide to structured outputs and function calling with LLMs (Agenta)](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms)
- [Function calling with the Gemini API (Google AI for Developers)](https://ai.google.dev/gemini-api/docs/function-calling)
- [Tool Calling — Fireworks AI Docs](https://docs.fireworks.ai/guides/function-calling)
- [Tool Calling — vLLM Documentation](https://docs.vllm.ai/en/stable/features/tool_calling/)
- [GLM 5.2 API & Playground (Fireworks AI)](https://fireworks.ai/models/fireworks/glm-5p2)
- [Why do all LLMs need structured output modes? (Fireworks AI)](https://fireworks.ai/blog/why-do-all-LLMs-need-structured-output-modes)
- [Understanding MCP features: Tools, Resources, Prompts, Sampling, Roots, Elicitation (WorkOS)](https://workos.com/blog/mcp-features-guide)
- [Everything your team needs to know about MCP in 2026 (WorkOS)](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026)
