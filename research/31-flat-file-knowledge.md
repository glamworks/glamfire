# 31 — Flat-File Knowledge: killing the "opaque database" objection

Research on the grep + markdown thesis for agent memory, prior-art flat-file knowledge
systems, and the DB↔markdown sync patterns that let glamfire keep its SQLite/D1+R2
substrate **and** offer a local, grep-friendly, git-versioned markdown knowledge base.
The adoption-killer objection this answers: *"glamfire uses an opaque database, not a
flat markdown knowledge base."*

Grounding in current reality (read first): SPEC §5.2 (`@glamfire/brain`),
`packages/brain/src/store.ts` (SQLite + sqlite-vec, FTS5, four record types
`fact|document|episode|pointer`, `Provenance {source, uri, author, timestamp, note}`,
`Scope private|project|team`, JSONL export/import invariant), and
`research/05-context-ownership.md` (own-your-context thesis).

---

## 1. The thesis: grep + markdown is (mostly) all you need

### Karpathy's LLM Wiki (April 2026 gist) — the canonical statement

Karpathy published an "idea file" gist describing an **LLM Knowledge Base**: a living
markdown wiki maintained by the LLM itself, explicitly positioned against classic RAG.
Key structure — and note the **first-class source/summary distinction** baked in:

- **Layer 1 — raw sources.** Immutable curated documents (articles, papers, notes).
  "The LLM reads but never modifies these." Ground truth.
- **Layer 2 — the wiki.** LLM-generated markdown: entity pages, concept pages,
  summaries, an `index.md`, a `log.md`. "The LLM owns this layer entirely." Generated
  pages *change* as new information arrives; only raw sources are immutable truth.
- **Layer 3 — the schema.** A CLAUDE.md/AGENTS.md config that "makes the LLM a
  disciplined wiki maintainer rather than a generic chatbot."
- **Operations:** *ingest* (one source → 10–15 wiki pages updated + index), *query*
  (search index → drill into pages → synthesize with citations; good answers get
  filed back so "explorations compound"), *lint* (periodic pass for contradictions,
  stale claims, orphan pages).
- **Retrieval pattern:** "The LLM reads the index first to find relevant pages, then
  drills into them" — markdown summaries/indexes with drill-down to source docs.
- **Version control:** the wiki is "just a git repo of markdown files. You get version
  history, branching, and collaboration for free."
- Quote: *"Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."*
- Karpathy also popularized "context engineering" (June 2025): "the art of providing
  an LLM with exactly the right context to accomplish its task."

### Agentic search beats index-first RAG (the grep discourse)

- Anthropic **removed vector search from Claude Code** (May 2025), replacing the
  embedding pipeline + local vector DB + chunking with grep-driven agentic search.
  Creator Boris Cherny: the result "outperformed everything. By a lot." Cursor,
  Windsurf, Cline, Devin, and Amp followed, dropping vectors for tool-driven search.
- Measured results: agentic keyword search beat traditional RAG by ~6 pts on
  FinanceBench answer correctness; an Amazon Science paper (AAAI 2026) put agentic
  keyword search at 94.5% of RAG faithfulness with **zero vector store**.
- Why it wins: exact-match precision, no index to build or go stale ("a pre-built
  index drifts from the corpus during active editing"), privacy (nothing leaves the
  machine to be embedded), and retrieval as an *active reasoning loop* (search →
  read → refine) instead of a one-shot preprocessing step.
- Jason Liu / Augment ("Why grep beat embeddings in our SWE-bench agent"): the agent's
  ability to iterate on queries compensates for grep's lexical brittleness.

### Claude Code's own memory design — the pattern users now expect

- Two systems, both plain markdown: **CLAUDE.md** hierarchies (global/team/project
  instruction files, read every session) and **auto memory** — "a directory of
  Markdown files Claude owns and maintains," loading an index (`MEMORY.md`) that
  points to topic files, stored under `~/.claude/projects/<project>/memory/`.
- Design is "deliberately boring — no embeddings, no similarity search, no magic,
  just files with names that describe what they contain." Users can "read them, edit
  them, delete them, commit them, and grep them."
- This is now the *reference expectation* for developer-facing agent memory. A tool
  whose memory can't be catted/grepped/committed reads as opaque by comparison —
  that is the exact source of the objection glamfire must kill.

---

## 2. Prior art: flat-file and hybrid knowledge systems

### Files-as-truth + SQLite-as-index (the winning hybrid pattern)

- **basic-memory** (basicmachines-co) — "AI conversations that actually remember."
  Standard markdown files on disk are authoritative; a local **SQLite index** is a
  "searchable abstraction layer, not the source of truth," rebuildable via
  `basic-memory doctor`. Frontmatter: `title`, `type`, `permalink`, `tags`.
  Semantic patterns inside the body: observations (`- [category] fact #tag (context)`)
  and relations via wikilinks (`pairs_well_with [[Target]]`) that index into a
  knowledge graph. File watching gives real-time bidirectional updates; hybrid FTS +
  FastEmbed vector ranking on SQLite/Postgres. Integrates with Obsidian directly.
- **memweave** — "zero-infra agent memory with markdown and SQLite." Markdown is
  authoritative; SQLite (FTS5 BM25 + sqlite-vec) is a "**derived cache — always
  rebuildable, never irreplaceable**." **SHA-256 content hashes per chunk** drive
  incremental reindex (unchanged chunks skip embedding calls via a hash-keyed
  embedding cache). Naming convention encodes temporality: `YYYY-MM-DD.md` files
  decay, evergreen files score full. Designed for hundreds of thousands of files.
- **sqlite-memory** (sqlite.ai) — markdown-based agent memory with hybrid search and
  offline-first multi-agent sync. Content-hash change detection (identical content
  skipped, modified files atomically replaced, deletions cleaned transactionally);
  block-level **LWW CRDT** merges between agents; embeddings stay local, only
  portable content syncs. (Note: here the DB is treated as authoritative index —
  the minority position.)
- **beads** (Steve Yegge) — git-backed issue tracker as coding-agent memory, solving
  the "50 First Dates" problem. Architecture is the cleanest statement of the
  pattern: **source of truth is files in `.beads/` committed to git (JSONL —
  append-friendly, merge-resistant); SQLite is only a local read-model cache**. The
  `--json` interface is primary; the tool does dependency-graph "thinking" so the
  LLM doesn't have to.
- **backlog.md** — markdown-native task manager: every task is a plain `.md` file
  with YAML metadata in a `backlog/` dir; "every change to the project is a git
  commit"; works with Claude Code/Codex/MCP; 100% private and offline.
- **Letta MemFS / Context Repositories** — Letta projects agent memory blocks into
  **markdown files with YAML frontmatter in a local git repo**: `system/` files are
  always in-context; other files are visible via file tree + `description`
  frontmatter but loaded on demand; **every memory edit is a git commit** with an
  informative message ("a full changelog of what your agent has learned").
- **Obsidian-as-agent-memory** — Obsidian shipped official Agent Skills teaching
  agents wikilinks/frontmatter/Bases; community patterns treat "path as readable
  primary key, frontmatter as schema"; indexers extract frontmatter/wikilinks/tags
  into SQLite with mtime + content-hash incremental reindex.
- **mem0/OpenMemory** (contrast) — API-first memory layer over a vector DB; the
  local-first OpenMemory variant is MCP-based but still DB-shaped, not file-shaped.
  The market has visibly split: *file-first with DB index* (basic-memory, beads,
  Letta MemFS, memweave) vs *DB-first with export* (mem0, Zep). The file-first camp
  owns the developer-trust narrative.

### What fails at scale (the honest counterpoint)

- **Zep: "Markdown is not agent memory."** Failure modes: (1) file selection degrades
  once there are "more files than the agent can reliably choose between"; (2) markdown
  "records what was written, not what it replaced or why" — superseded facts persist;
  (3) git tracks commits, not fact derivation — no provenance for *why a belief is
  held*; (4) concurrent agents produce logically divergent facts across files even
  when textual merges succeed; (5) no retention/isolation governance. Their answer:
  temporal knowledge graphs with validity intervals.
- Grep-only retrieval gets brittle as corpora grow: synonyms/paraphrases miss, common
  keywords over-match, uncertain agents load big slices "just in case" (token bloat,
  context dilution). Stale context "surfaces confidently alongside fresh knowledge"
  with no recency preference.
- Practitioner consensus: raw grep over a small set of markdown files (a Claude Code
  setup, a spec) is "perfectly sufficient"; past a few thousand notes you want ranked
  hybrid retrieval (FTS + vectors + recency + trust) — **exactly what glamfire's
  Brain already does**. The mistake is presenting the *index* as the *knowledge*.

---

## 3. Design tension: DB as index/cache vs DB as source of truth

Patterns observed across the prior art:

| Pattern | Who | Truth | Sync mechanism |
|---|---|---|---|
| Files-truth, DB-cache | beads, memweave, basic-memory, Letta MemFS | git-tracked files | content hash / watcher; DB fully rebuildable |
| DB-truth, files-export | mem0, Zep, sqlite-memory | database | export snapshots; CRDT between DBs |
| Dual-write, hash-reconciled | Obsidian indexers | files | mtime + content hash incremental reindex |

Conflict-avoidance techniques that recur:

- **Stable ID in frontmatter** (basic-memory `permalink`, Letta block IDs) so renames
  and edits don't fork identity.
- **Content hashes, not mtimes**, as the change signal (memweave SHA-256/chunk,
  sqlite-memory content-hash detection) — mtimes lie across git checkouts and syncs.
- **Single-writer-per-side rule:** agents write through the API (which updates both
  DB and file atomically); humans edit files; a watcher/sync command reindexes. Never
  two writers on the same artifact in the same instant.
- **Append-friendly formats** where merges are likely (beads JSONL: comments append
  a line; "git merges tend to handle this well").
- **Git as the actual team merge layer** — every file-first system punts multi-writer
  reconciliation to git (branch/PR/merge), and that is a feature: teams already have
  review, blame, history, and access control there. Letta goes furthest: one commit
  per memory edit.
- Newest-wins (LWW) only for machine-generated layers; human-edited source files
  should never be silently overwritten.

## 4. Source-of-truth vs summary: metadata conventions

- Karpathy's three layers make the distinction *structural* (separate directories,
  separate write permissions: LLM never writes `sources/`, human never needs to write
  the wiki).
- basic-memory makes it *typed*: frontmatter `type:` plus categorized observations
  with `(context)` provenance and typed relations to other entities.
- Letta makes it *positional*: `system/` (always-loaded durable truth) vs on-demand
  files, each with `description` frontmatter for progressive disclosure.
- Zep's critique defines the bar for summaries: a summary should carry **source
  linkage for every claim** and enough metadata to detect staleness/supersession.
- Citation-grounded pattern to adopt: summary pages carry `derived_from:` entries
  pointing at source record IDs + spans (chunk ordinal or line range), so lint can
  verify a summary against its sources and flag drift. glamfire's existing
  `Provenance {source, uri, author, timestamp}` and `typeTrust` weighting already
  encode "trust sources over summaries" in retrieval — the flat-file layer just needs
  to surface it.

---

## 5. Recommended design for glamfire

### Principle

**The markdown is the brain; SQLite/D1 is the index.** Invert the current framing
(today `store.ts` treats SQLite as the store with JSONL export). Knowledge content —
facts, documents, pointers, summaries — becomes authoritative in a flat markdown tree;
the SQLite file keeps everything derived and heavy: chunks, embeddings (`vec_chunks`),
FTS5 index, retrieval receipts, embedder metadata, recency stats. The existing
export/import invariant generalizes to a stronger, marketable invariant: **delete the
`.sqlite` file and rebuild it losslessly from the markdown.** (High-volume `episode`
run logs stay DB-authoritative, mirrored to markdown digests — they are telemetry,
not knowledge.)

### Directory layout (`<project>/brain/`, git-tracked; private scope under `~/.glam/brain/`, never committed)

```
brain/
  INDEX.md               # generated catalog: one line per record + link (Karpathy index.md)
  sources/               # truth: source|  immutable ingested docs — agents never edit
    <slug>.md
  facts/                 # durable atomic facts (one per file, Claude-Code style)
    <slug>.md
  notes/                 # truth: summary|  LLM-generated syntheses, entity/concept pages
    <slug>.md
  pointers/<slug>.md     # external refs (URL/ticket/dashboard)
  episodes/YYYY/MM/…     # generated run digests (DB-authoritative mirror)
  log.md                 # append-only ingest/query/lint log, unix-parseable prefixes
```

### Frontmatter schema (Zod-validated, mirrors `MemoryRecord`)

```yaml
---
id: 019823fa-…            # stable UUID = records.id in SQLite (never changes on rename)
type: fact                 # fact | document | episode | pointer
truth: source              # source | summary   ← the first-class distinction
scope: project             # private | project | team
provenance: {source: "…", uri: "…", author: "…", timestamp: "…"}
derived_from:              # required when truth: summary
  - {id: <source-record-id>, span: "chunk:3" }   # or "L10-L42"
tags: []
created: 2026-07-03T…      # updated: …
---
```

Body = `content`. First `# heading` = `title`. `content_hash` of the body at last
sync lives in a SQLite `sync_state` table (not in the file — keeps diffs clean and
avoids hash-of-self circularity).

### Sync semantics (`glam brain sync`, plus a `--watch` daemon mode)

- **Change detection:** SHA-256 of normalized body + frontmatter, compared to
  `sync_state`. mtime is only a fast-path hint, never authoritative.
- **File changed, DB unchanged since last sync → file wins** (re-chunk, re-embed
  changed chunks only, hash-keyed embedding cache à la memweave).
- **DB changed via Brain API → write-through:** the API writes the markdown file and
  the index in one logical transaction; the file is the durable half.
- **Both changed → conflict:** never silently merge. For `truth: source`, always
  preserve the human file and re-derive; for `truth: summary`, newest-wins is
  acceptable (it's regenerable), with the loser written to `<slug>.conflict.md` and
  a line in `log.md`.
- **Deletes:** file deletion (observed via sync) tombstones the record; DB-side
  deletes remove the file. Tombstones logged in `log.md` for auditability (answers
  Zep's governance critique).
- **Team sharing = git.** `scope: team|project` records live in the committed tree;
  merge, review, blame, and history come free (beads/Letta pattern). The Cloudflare
  D1/R2 team profile remains the *hosted index and sync convenience* over the same
  files — R2 can hold the canonical mirror, but a `git clone` of the brain directory
  is always a complete, usable brain.
- **Lint (`glam brain lint`):** Karpathy's third operation — verify every `summary`'s
  `derived_from` targets exist and hashes still match (flag stale summaries), find
  orphans, contradictions, and INDEX.md drift. This directly patches the known
  failure modes of flat-file memory at scale.

### Why this beats both camps

- Grep/Karpathy purists get everything they ask for: plain markdown, drill-down
  index, git history, `rg` works, sources vs summaries structurally separated, no
  lock-in — and `rm brain.sqlite` loses nothing.
- The scale critics (Zep et al.) are answered too: hybrid ranked retrieval (vector +
  BM25 + recency + provenance/type trust — already in `store.ts`), supersession via
  lint + tombstones, provenance-per-claim via `derived_from`.
- Implementation cost is genuinely small: frontmatter (de)serializer + hash-based
  sync + INDEX/log generators on top of the existing `Brain` class; the retrieval
  engine, chunker, embedder, and export machinery are untouched.

### The marketing one-liner

> **Your brain is a folder of markdown in git. The database is just a disposable
> index — delete it and lose nothing.**

Short forms: "grep-able, git-able, own-able" / "`glam brain sync` — the whole brain
as flat markdown; SQLite is just the cache."

---

## Key takeaways for glamfire

- The objection is real and current: Claude Code, Karpathy's LLM Wiki, beads, Letta
  MemFS, and basic-memory have made "plain markdown files in git" the trust baseline
  for agent memory. A DB-only brain reads as opaque regardless of export features.
- The industry-winning pattern is **files-as-truth + SQLite-as-rebuildable-index**
  (beads, memweave, basic-memory, Letta). glamfire should adopt it, not debate it —
  the existing Brain needs only a frontmatter codec, hash-based sync, and generated
  `INDEX.md`/`log.md` to get there.
- Make the **source vs summary distinction first-class**: separate directories
  (`sources/` immutable vs `notes/` regenerable), `truth: source|summary` frontmatter,
  and `derived_from` links with spans so `glam brain lint` can detect stale summaries.
  This is Karpathy's three-layer design and it maps cleanly onto glamfire's existing
  provenance + typeTrust machinery.
- Keep hybrid retrieval as the scale answer: grep alone degrades past a few thousand
  notes (synonyms, over-matching, no recency); glamfire's vector+BM25+recency+trust
  ranking is the honest fix — positioned as *index over your files*, never as the
  knowledge itself.
- Sync rules: content hashes not mtimes; API write-through; file-wins for human-edited
  sources; newest-wins only for regenerable summaries; conflicts surfaced, never
  silent; git is the team merge/review layer; D1/R2 stays as hosted convenience over
  the same files.
- The tested invariant to ship and shout: **rebuild the entire SQLite index from the
  markdown tree, byte-for-byte retrieval-equivalent** — the flat-file sibling of the
  existing export/import invariant.
- One-liner that kills the objection: *"Your brain is a folder of markdown in git;
  the database is just a disposable index."*

---

## Sources

- Karpathy — LLM Wiki gist (Apr 2026) — https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- VentureBeat — Karpathy shares 'LLM Knowledge Base' architecture — https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an
- Gamgee — Karpathy's LLM Wiki: why the future of AI memory isn't RAG — https://gamgee.ai/blogs/karpathy-llm-wiki-memory-pattern/
- MindStudio — Why Cursor, Claude Code, and Devin use grep, not vectors — https://www.mindstudio.ai/blog/is-rag-dead-what-ai-agents-use-instead
- HarrisonSec — Agent retrieval is a cost-curve problem: why Claude Code doesn't use RAG — https://harrisonsec.com/blog/agent-retrieval-cost-curve-claude-code-grep-vs-rag/
- Vadim — Claude Code doesn't index your codebase — https://vadim.blog/claude-code-no-indexing/
- Jason Liu — Why grep beat embeddings in our SWE-bench agent (Augment) — https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/
- Claude Code docs — How Claude remembers your project — https://code.claude.com/docs/en/memory
- Ian Paterson — Claude Code memory system: MEMORY.md, topic files — https://ianlpaterson.com/blog/claude-code-memory-architecture/
- basic-memory (GitHub) — https://github.com/basicmachines-co/basic-memory
- memweave — Zero-infra agent memory with markdown and SQLite (TDS) — https://towardsdatascience.com/memweave-zero-infra-ai-agent-memory-with-markdown-and-sqlite-no-vector-database-required/
- sqlite-memory (sqlite.ai) — https://github.com/sqliteai/sqlite-memory
- Steve Yegge — Introducing Beads: a coding agent memory system — https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a
- beads (GitHub) — https://github.com/steveyegge/beads
- VirtusLab — Beads: give AI memory (architecture: files truth, SQLite cache) — https://virtuslab.com/blog/ai/beads-give-ai-memory
- Backlog.md (GitHub) — https://github.com/MrLesk/Backlog.md
- Letta — Introducing Context Repositories: git-based memory — https://www.letta.com/blog/context-repositories/
- Letta docs — MemFS — https://docs.letta.com/letta-code/memfs
- Zep — Markdown is not agent memory — https://blog.getzep.com/markdown-is-not-agent-memory/
- Nicolas Bustamante — Agent memory engineering — https://nicolasbustamante.com/blog/agent-memory-engineering
- DEV — AI agent memory management: when markdown files are all you need? — https://dev.to/imaginex/ai-agent-memory-management-when-markdown-files-are-all-you-need-5ekk
- Nuss & Bolts — On the lost nuance of grep vs. semantic search — https://www.nuss-and-bolts.com/p/on-the-lost-nuance-of-grep-vs-semantic
- Obsidian ↔ Basic Memory integration — https://docs.basicmemory.com/integrations/obsidian
- knowledge-base-server (SQLite FTS5 + Obsidian sync) — https://github.com/willynikes2/knowledge-base-server
