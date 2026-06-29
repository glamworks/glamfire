# 06 — Team-Level Harnesses

Research on team-level AI harnesses, centered on **Claude Tag** (Anthropic's "tag-Claude" Slack
teammate, public beta June 23, 2026) — why it's sticky and viral — plus Slack/Discord bot
patterns, and how an **open, self-hosted alternative captures team context the team OWNS**.

---

## Claude Tag — what it is (the thing to study and beat)

- Anthropic's replacement for the older "Claude in Slack" app: a **shared, multiplayer AI
  teammate** that lives in a Slack channel. Public beta **June 23, 2026** for Claude **Enterprise
  and Team** customers; runs on **Opus 4.8**. The old Claude-in-Slack experience migrates to
  Claude Tag on **August 3, 2026**.
- Usage: a user tags **@Claude** with a request in plain language; Claude **breaks the task into
  stages** and works through them sequentially using its available tools, then delivers the final
  result back in the Slack thread.
- Framed by press as a "**virtual employee**" / persistent AI teammate that learns, monitors, and
  works autonomously.

### Why it's sticky and viral (the mechanics to replicate)

1. **Multiplayer, single shared identity.** Within a channel there is **one Claude that interacts
   with everyone** — anyone can watch what it's doing and **pick up a half-finished task** where a
   teammate left off. This makes it a shared team surface, not a private chat. Stickiness compounds
   because the whole team is invested in one agent.
2. **It learns the company over time.** As it follows along in its channels it **builds context
   about the work**, so users **stop re-explaining things from scratch**. It can learn from other
   channels and connected data sources (with permission); it **does not access private channels**.
   → The accumulated context is the lock-in. The longer it runs, the more it knows, the more
   painful it is to leave.
3. **Ambient / proactive behavior.** When enabled, it **proactively** flags relevant info across
   channels and connected tools, and **follows up on threads/tasks that have gone quiet** without
   being asked. This turns it from a tool you summon into an always-on presence.
4. **Viral surface = Slack itself.** Every @-mention is visible to the whole channel; teammates
   see it work and adopt it. Distribution is built into the collaboration tool — no separate app to
   open. Salesforce/Slack partnership deepens the native integration.

### Governance / privacy model (admin-facing)

- Admins create **separate, scoped Claude identities** — e.g. a sales-focused instance won't share
  memories with the engineering instance (strict cross-department data segregation).
- All memories/activities stay confined to **admin-defined channels**.
- Admins control **tool access**, set **token-spend limits**, and get **audit logs** of all Claude
  activity and requests.
- Caveat (TechCrunch framing): it is "**learning your company, one Slack message at a time**" — the
  accumulated org context lives in Anthropic's product. That is exactly the dependency glamfire
  argues against (see file 05).

---

## Slack / Discord bot patterns (how to build the surface)

- **Event-driven**: subscribe to Slack Events API (or Discord gateway) for mentions, messages,
  thread replies; respond in-thread to keep context scoped to a conversation.
- **Slash commands + @-mention** as invocation; thread = the unit of task context.
- **Permission-aware retrieval**: respect channel membership and private-channel boundaries when
  the bot pulls context (Onyx and Claude Tag both emphasize permission-aware search).
- **Async/long-running tasks**: ack immediately, post staged progress updates back to the thread
  (mirrors Claude Tag's "break into stages, deliver result" loop).
- Common self-hosted stack seen in the wild: **Slack event handler + local LLM (Ollama) +
  vector DB (pgvector / ChromaDB) for RAG + Docker Compose** — "all inference happening on your
  infrastructure so no sensitive data leaves your network."
- Reference projects: `self-learning-rag-it-support-slackbot` (knowledge base + search/browse
  tools), Ollama+pgvector+RAG Slack bot tutorials, and **Onyx** (connectors, permission-aware
  search, citations, agents, **Slack or Teams access**, deep research over internal docs) as an
  integrated OSS platform.

---

## How an open, self-hosted alternative wins on team context ownership

The whole value of Claude Tag is the **team context it accretes** — and today that context lives
inside Anthropic's product. A self-hosted glamfire team harness can offer the *same multiplayer +
learning + ambient* mechanics while the **team owns the resulting brain**:

- **Replicate the sticky mechanics**: one shared agent identity per channel, multiplayer handoff,
  learns-over-time context, optional ambient follow-ups. These are product behaviors, not moats —
  they're reproducible.
- **But store the learned context locally** in the owned context layer (file 05: sqlite-vec /
  LanceDB / pgvector + MCP memory server + GraphRAG). The "company brain" Slack messages build up
  stays in infrastructure the team controls, is exportable/deletable, and survives a switch of
  underlying model or even chat platform.
- **Model-agnostic underneath**: route cheap/center-of-distribution requests to local/small models
  and escalate only edge cases to a frontier model (file 04) — so a team harness running all day in
  Slack isn't burning frontier tokens on every "summarize this thread."
- **Cross-platform, not Slack-locked**: same harness behind Slack *and* Discord *and* CLI/MCP,
  because the context layer is the source of truth, not the chat vendor.

### Privacy implications (the pitch and the obligations)

- **Pitch:** with Claude Tag, your org's working knowledge is "learned one Slack message at a time"
  by a vendor; a self-hosted harness keeps that knowledge **on your own infrastructure**, never
  transiting a third-party API — directly addressing legal/healthcare/finance/IP-sensitive teams.
- **Obligations to match (and exceed) Claude Tag's enterprise controls:**
  - **Scoped identities / data segregation** (sales context ≠ engineering context).
  - **Respect private-channel boundaries** and channel-membership permissions on retrieval.
  - **Audit logs** of every agent action and request.
  - **Spend limits** per identity/channel.
  - Plus what only OSS/self-host can credibly offer: **full data export, hard delete, on-prem
    residency, and no silent vendor behavior changes.**
- **New risk to manage:** an always-on ambient agent reading channels is a broad data-collection
  surface. Owning it locally is the mitigation, but the harness must make retention, scope, and
  who-can-see-what **explicit and team-configurable** — privacy by default, not by trust.

---

## Key takeaways for glamfire

- **Claude Tag validates the team-harness category and reveals the moat: accumulated team
  context.** Glamfire should copy the sticky mechanics (one shared multiplayer agent per channel,
  learns over time, ambient follow-ups, staged task execution) but relocate the moat to the
  **team's own** owned context store.
- **"Don't let a frontier lab learn your company one Slack message at a time."** That is the
  sharp, concrete marketing line — Claude Tag's own press framing handed it over.
- **Slack is the viral distribution surface; make it the first integration**, with Discord and
  MCP/CLI as parallel surfaces over the same owned context layer so the harness is platform-
  agnostic, not Slack-locked.
- **Match enterprise governance from day one** (scoped identities, permission-aware retrieval,
  audit logs, spend caps) and then exceed it with the things only self-hosting can promise:
  export, delete, residency, no silent model/behavior changes.
- **Tie it to files 04 + 05:** the team harness is the *surface*, the owned context layer is the
  *brain*, and cost-aware routing is what keeps an always-on Slack agent economical. Together they
  are the "keep your own context instead of renting it" product.

---

## Sources

- Introducing Claude Tag (Anthropic) — https://www.anthropic.com/news/introducing-claude-tag
- Anthropic launches Claude Tag... persistent AI teammate (VentureBeat) — https://venturebeat.com/technology/anthropic-launches-claude-tag-replacing-its-slack-app-with-a-persistent-ai-teammate-that-learns-monitors-and-works-autonomously
- Claude Tag is learning your company, one Slack message at a time (TechCrunch) — https://techcrunch.com/2026/06/23/anthropics-claude-tag-is-learning-your-company-one-slack-message-at-a-time/
- Anthropic launches Claude Tag, works like a virtual employee in Slack (Fortune) — https://fortune.com/2026/06/23/anthropic-claude-tag-virtual-employee-tool-slack/
- Claude Tag in Slack: Multiplayer AI Teamwork in 2026 (Digital Applied) — https://www.digitalapplied.com/blog/anthropic-claude-tag-slack-team-collaboration-2026
- Get started with Claude in Slack (Claude Help Center) — https://support.claude.com/en/articles/11506255-get-started-with-claude-in-slack
- Anthropic + Salesforce Claude-to-Slack integration (Salesforce Ben) — https://www.salesforceben.com/anthropic-and-salesforce-announce-new-claude-to-slack-integration/
- self-learning-rag-it-support-slackbot (GitHub) — https://github.com/gabrielkoo/self-learning-rag-it-support-slackbot
- Build a Slack AI Bot with Ollama, pgvector & RAG (self-hosted) — https://medium.com/@nagachetan.km/build-a-slack-ai-bot-with-ollama-pgvector-rag-full-stack-self-hosted-38b3db99cf48
- Onyx — self-hosted, permission-aware Slack/Teams RAG — https://onyx.app/insights/self-hosted-llm-teams
