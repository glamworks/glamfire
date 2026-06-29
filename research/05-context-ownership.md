# 05 — Local-First Context Ownership

Research on memory architectures for agents, local-first vector stores, RAG/GraphRAG, and the
"don't rent your company brain back from a frontier lab" thesis. The core argument: an OSS
harness should give teams a **portable, self-owned context layer** rather than letting their
accumulated working knowledge accrete inside a vendor's product.

---

## The thesis: own your context, don't rent it

- **"AI without sovereignty isn't a competitive advantage, it's just very fast dependence."**
  The strategic question is whether you *own* your AI future or are *renting* someone else's.
- When you feed proprietary data into a third-party model, that data passes through systems you
  don't own, under governance you don't set. Rented intelligence comes with **invisible terms**:
  the model can change overnight, pricing can shift, the vendor can be acquired or sunset the
  product or silently alter behavior — all without your consent.
- **Data sovereignty** = hosting/running AI within infrastructure you control so sensitive
  business data never transits public APIs or third-party servers, while still giving agents
  deep access to proprietary data.
- "Without control of where your AI runs, you cannot control who builds it... you end up
  *consuming* intelligence rather than *owning* it."
- Market signal: reporting cited that data sovereignty has become the primary vendor-selection
  criterion for a large majority of large enterprises — shifting selection away from pure
  features/pricing.
- The sharper framing (Dataiku): **sovereignty isn't where your AI runs, it's whether it
  answers to you** — i.e. ownership is about control over the context/knowledge layer and the
  ability to switch substrate, not merely on-prem hosting.

**Why this matters for an agent harness specifically:** the most valuable artifact an agent
accumulates isn't the model weights (rented) — it's the **memory**: the team's decisions,
preferences, past tasks, corrections, and project facts. If that lives inside a frontier lab's
product, the lab owns your company brain and rents it back to you per token. A harness that
keeps memory local inverts the dependency.

---

## Agent memory architectures (the layer to own)

Production agents generally need **four kinds of memory**:

1. **Working / core memory** — current context, active task, user persona (always in context).
2. **Episodic / recall memory** — specific past events and conversation history.
3. **Semantic memory** — extracted facts, preferences, entities/relationships (retrieved on demand).
4. **Procedural memory** — the agent's own learned instructions/playbooks.

(MemGPT/Letta framing: **core** memory + **recall** memory + **archival** long-term memory
retrieved on demand.)

### Frameworks
- **Mem0** — a memory *layer* you bolt onto any agent framework; handles storage + retrieval,
  embeds content into a vector DB for semantic recall. Higher tier adds a **knowledge graph**
  (entity/relationship extraction) enabling multi-hop queries.
  - **OpenMemory** — Mem0's **local-first** memory layer, runs as an **MCP-compatible memory
    server**, works with Claude Desktop, Cursor, Windsurf, VS Code, etc., **memory stored
    locally**. This is the closest existing pattern to what glamfire wants.
- **Letta (MemGPT)** — an agent *runtime* that manages memory as part of an OS-inspired
  platform where agents live and execute (memory paging between context and storage).
- **Zep / Graphiti** — temporal knowledge-graph memory.
- **Cognee** — highlighted as **best for local-first, privacy-critical** deployments with graph
  reasoning.
- **LangMem / LangChain Memory** — memory primitives within the LangChain ecosystem.

---

## Local-first vector stores (the storage substrate)

| Store | Form factor | Strengths | Best for |
|---|---|---|---|
| **sqlite-vec** | SQLite extension, in-process | Already on every machine; zero infra; "for local AI agents, SQLite handles embeddings just fine" | Embedded, single-file, portable agent memory |
| **LanceDB** | Embedded, Lance columnar format, in-process zero-copy | **Disk-based IVF-PQ indexing → index datasets larger than RAM** (Chroma can't do this efficiently); scales better than Chroma on same hardware; edge/local-first | Local-first apps with large-than-memory data |
| **Chroma** | Embedded-first, single Python pkg or Docker | Simplest API, fastest start; "carries you prototype→production for most use cases" | New RAG projects, fast prototyping |
| **pgvector** | Postgres extension | HNSW + IVFFlat; cosine/L2/inner product; with **pgvectorscale** ~471 QPS @ 99% recall on 50M vectors (~11.4× Qdrant) | Teams already on Postgres |

- Practical guidance from the field: start with **Chroma or LanceDB** on a cheap VPS; if you
  outgrow it you'll know exactly why. For an embedded/portable single-file design, **sqlite-vec**
  is the lightest path and travels with the project.

---

## RAG → GraphRAG → Agentic RAG

- **Basic RAG**: retrieve relevant text chunks via vector similarity, stuff into context.
- **GraphRAG**: build a **knowledge graph** from documents, explicitly modeling entities and
  relations — captures relational semantics and enables **multi-hop reasoning** over
  interconnected facts that flat chunk retrieval misses. OSS implementations include **RAGFlow**
  and **R2R**; research frameworks include ROGRAG, GraphSearch, SAGE.
- **Agentic RAG**: not a fixed pipeline — an autonomous loop that plans, retrieves, reasons,
  critiques, rewrites, and reflects until confident or out of budget (e.g. LangGraph-style).
- A fully self-hosted RAG stack (e.g. ChromaDB/pgvector + Docker + Ollama) "eliminates both the
  per-query API costs and third-party data exposure" — explicitly positioned for legal,
  healthcare, finance, and IP-sensitive workloads where cloud RAG is unsuitable.
- **Onyx** is a notable integrated OSS option: connectors, **permission-aware** search,
  citations, AI chat, agents, Slack/Teams access, deep research over internal docs.

---

## Key takeaways for glamfire

- **Make the owned context layer the product's spine.** Glamfire's differentiator is that the
  team's accumulated memory (decisions, corrections, project facts, procedural playbooks) lives
  in a **portable, self-owned store** the team can back up, inspect, migrate, and delete — not
  inside a frontier lab's account.
- **Default to embedded + local-first storage.** sqlite-vec (single-file, travels with the
  repo/project) for the baseline; LanceDB when memory exceeds RAM; pgvector when a team already
  runs Postgres. Keep the storage interface pluggable so the *context* is portable even if the
  backend changes — this is the concrete expression of "answers to you, not the vendor."
- **Implement the four-tier memory model** (working / episodic / semantic / procedural) and
  expose it as plain, exportable data. Procedural memory (learned playbooks) is the stickiest,
  most defensible asset — and the one teams most need to own rather than rent.
- **Adopt MCP as the memory interface, à la OpenMemory.** Running the context layer as a
  local MCP memory server makes it model-agnostic and agent-agnostic — any tool (Claude Desktop,
  Cursor, VS Code, glamfire's own agents) reads/writes the *same* owned memory. This directly
  supports the model-routing layer (file 04): routing decisions can be informed by the team's own
  recorded history of which tasks were easy vs hard.
- **Layer GraphRAG on top of vector recall** for multi-hop questions over team knowledge; entity/
  relationship extraction turns scattered chat/doc history into a queryable company brain the team
  owns end-to-end.
- **Lead with the sovereignty pitch:** "Don't rent your company brain back from a frontier lab
  per token." Portability, deletability, no silent vendor behavior changes, and permission-aware
  access are concrete, demonstrable guarantees an OSS harness can make that closed SaaS cannot.

---

## Sources

- Sovereignty isn't where your AI runs (Dataiku) — https://www.dataiku.com/stories/blog/sovereignty-ai
- AI without sovereignty is just outsourced intelligence (CIO) — https://www.cio.com/article/4147102/ai-without-sovereignty-is-just-outsourced-intelligence
- Why you must own your AI data (Ability.ai) — https://www.ability.ai/blog/secure-ai-data-sovereignty-truth
- Establishing AI and data sovereignty (MIT Technology Review) — https://www.technologyreview.com/2026/05/14/1137168/establishing-ai-and-data-sovereignty-in-the-age-of-autonomous-systems/
- Mem0 vs Letta (MemGPT) (Vectorize) — https://vectorize.io/articles/mem0-vs-letta
- State of AI Agent Memory 2026 (Mem0) — https://mem0.ai/blog/state-of-ai-agent-memory-2026
- AI Agent Memory Systems: 2026 Engineering Guide — https://jobsbyculture.com/blog/ai-agent-memory-systems-guide-2026
- Agent Memory Techniques (NirDiamant) — https://github.com/NirDiamant/Agent_Memory_Techniques
- Best Vector Databases in 2026 (Firecrawl) — https://www.firecrawl.dev/blog/best-vector-databases
- Vector DB Comparison 2026 (Chroma/Qdrant/pgvector/Pinecone/LanceDB) — https://4xxi.com/articles/vector-database-comparison/
- Embedded Intelligence: sqlite-vec local vector search — https://dev.to/aairom/embedded-intelligence-how-sqlite-vec-delivers-fast-local-vector-search-for-ai-3dpb
- 15 Best Open-Source RAG Frameworks 2026 (Firecrawl) — https://www.firecrawl.dev/blog/best-open-source-rag-frameworks
- Awesome-GraphRAG — https://github.com/DEEP-PolyU/Awesome-GraphRAG
- Self-hosted RAG: Build a Private AI Knowledge Base — https://webhost365.net/self-hosted-rag-guide/
- Onyx (self-hosted enterprise RAG) — https://onyx.app/insights/enterprise-rag-platforms-2026
