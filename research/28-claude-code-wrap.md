# 28 — Deep-wrapping Claude Code: memory absorption, usage capture, model swap

The mission: Claude Code keeps working exactly as usual, while glamfire absorbs its brain in real time — everything Claude Code learns (CLAUDE.md, auto memory, session transcripts) lands in glamfire's owned context store, available to any model glamfire runs; and team usage/billing stats capture Claude Code subscription usage alongside pay-as-you-go API usage. The good news: as of mid-2026 Claude Code exposes every surface we need **officially** — plain-markdown memory on disk, 30+ lifecycle hooks, a full OpenTelemetry exporter that works on Pro/Max subscriptions, MCP, statusline JSON, and documented env-var overrides for pointing it at other providers. The one hard line is Anthropic's ToS: **subscription OAuth tokens may only be used inside Anthropic's own clients** — glamfire must never touch them.

## 1. Claude Code's on-disk knowledge surfaces

All paths below are plain text/markdown/JSONL — safe to read, watch, and (for memory files) write. Official docs explicitly describe auto-memory files as "plain markdown you can edit or delete at any time."

### CLAUDE.md hierarchy (load order: broadest → most specific)

| Scope | Location |
|---|---|
| Managed policy (org) | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`; Linux/WSL `/etc/claude-code/CLAUDE.md`; Windows `C:\Program Files\ClaudeCode\CLAUDE.md` |
| User (all projects) | `~/.claude/CLAUDE.md` |
| Project (team, in VCS) | `./CLAUDE.md` or `./.claude/CLAUDE.md` |
| Local (personal, gitignored) | `./CLAUDE.local.md` |

- Files in ancestor directories load in full at launch; files in subdirectories load lazily when Claude reads files there. All discovered files are **concatenated**, root-down, `CLAUDE.local.md` after `CLAUDE.md` at each level.
- `@path/to/file` **imports** (max depth 4 hops; relative to the containing file; skipped inside code spans). `@AGENTS.md` import or a symlink is the documented interop pattern with other agents — the same pattern glamfire can use to share one context file both ways.
- `.claude/rules/*.md` (project) and `~/.claude/rules/*.md` (user): modular rule files, recursively discovered, optionally path-scoped via YAML frontmatter `paths:` globs; unscoped rules load at launch. Symlinks supported — a documented way to link a shared (glamfire-managed) rules dir into many projects.
- `claudeMdExcludes` (any settings layer) skips files by glob; managed-policy CLAUDE.md can't be excluded.

### Auto memory (the file Claude writes itself)

- Location: `~/.claude/projects/<project>/memory/` — `<project>` slug derived from the **git repo** (all worktrees/subdirs of one repo share one memory dir); outside git, the project root path is used. On by default since v2.1.59; disable via `autoMemoryEnabled: false` or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
- Layout: `MEMORY.md` (index; **first 200 lines or 25 KB loaded into every session**) plus arbitrary topic files (`debugging.md`, `api-conventions.md`, …) read on demand mid-session.
- **`autoMemoryDirectory` setting** (user/project/local/policy scope, absolute or `~/` path) relocates the whole auto-memory dir. This is the single highest-leverage integration point: point it at a glamfire-managed directory and Claude Code reads/writes glamfire's store natively — bidirectional sync by construction, zero copying. (Project-scope values are honored only after the workspace-trust dialog.)
- Subagents can keep their own auto memory too.

### Session transcripts

- `~/.claude/projects/<slug>/<session-uuid>.jsonl`, where `<slug>` is the cwd path with non-alphanumerics replaced by `-` (e.g. `-Users-bedwards-vibe-glamfire`). One JSON object per line: user/assistant messages, tool calls with exact inputs/outputs, thinking blocks, per-turn `usage` blocks (model, input/output/cache tokens), cwd, git state.
- **Retention trap:** `cleanupPeriodDays` defaults to **30 days** (min 1; community reports of `0` disabling persistence entirely and of overzealous cleanup). glamfire must ingest transcripts continuously — it cannot treat `~/.claude/projects/` as an archive.
- **Data-quality trap:** the JSONL `usage.input_tokens` is written during streaming and can be a placeholder that's never updated — undercounts of 100x+ documented. Transcripts are the source of truth for *content*, not for *token accounting*. Use OTEL for numbers.

### Settings and other dirs

- `~/.claude/settings.json` (user), `.claude/settings.json` (project, shared), `.claude/settings.local.json` (personal), plus managed policy settings — hold `env`, `hooks`, `statusLine`, `autoMemoryDirectory`, `cleanupPeriodDays`, `apiKeyHelper`, permissions.
- Skills/commands/agents: `~/.claude/skills/`, `.claude/skills/`, `.claude/commands/`, `.claude/agents/` — markdown with frontmatter; readable and portable.
- MCP config: `.mcp.json` at project root (project scope) or user/local scope via `claude mcp add`.

## 2. Extension points

### Hooks (the real-time event bus)

32 lifecycle events, configured under `"hooks"` in any settings layer. The ones glamfire cares about:

- **`SessionStart`** (matcher: `startup|resume|clear|compact`; payload includes `source`, `model`) — inject glamfire context at session open.
- **`UserPromptSubmit`** — see every prompt; can add `additionalContext`.
- **`PostToolUse`** / **`PostToolUseFailure`** (payload: `tool_name`, `tool_input`, `tool_response`) — stream every action into glamfire.
- **`Stop`** / **`SessionEnd`** — end-of-turn / end-of-session ingestion checkpoints.
- **`PreCompact`** / **`PostCompact`** — snapshot context before Claude Code compresses it away.
- **`FileChanged`**, `ConfigChange`, `InstructionsLoaded`, `SubagentStart/Stop`, `PermissionRequest`, `Notification`.
- **Every hook payload includes `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`** (+ `prompt_id` UUID from v2.1.196, which also correlates with OTEL events). So a hook doesn't need to carry content — it hands glamfire the pointer to the JSONL, and glamfire tails from its last offset.
- Handler types: `command` (JSON on stdin), **`http` (JSON POST to a URL — i.e. straight into a glamfire daemon endpoint, no shell needed)**, `mcp_tool`, `prompt`, `agent`. Hooks can return JSON (`additionalContext`, `permissionDecision`, `updatedInput`, `continue:false`) — glamfire can *feed knowledge back in* per event, not just listen.

### OpenTelemetry export (the usage firehose — works on subscriptions)

- Enable: `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_METRICS_EXPORTER=otlp`, `OTEL_LOGS_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317` (gRPC or http/protobuf). Distributable to a whole team via `"env"` in managed/project `settings.json`.
- Metrics: `claude_code.token.usage` (by type: input/output/cache_read/cache_creation), `claude_code.cost.usage` (USD, **client-side estimate** — on a subscription it's imputed value, not a bill), `claude_code.session.count`, `claude_code.lines_of_code.count`, `claude_code.commit.count`, `claude_code.pull_request.count`, `claude_code.active_time.total`.
- Attributes: `model`, `query_source` (main/subagent/auxiliary), `agent.name`, `mcp_server.name`, plus resource attrs `session.id`, `user.email` (OAuth/Pro/Max), `user.account_uuid`, `organization.id`, `app.version`.
- Events (logs): `claude_code.api_request`, `user_prompt`, `tool_result`, `tool_decision`, `api_error`, `compaction`, … all correlated by `prompt.id`. Opt-in content capture: `OTEL_LOG_USER_PROMPTS=1`, `OTEL_LOG_TOOL_DETAILS=1`, even `OTEL_LOG_RAW_API_BODIES=1`.
- **Docs confirm OTEL works with Claude.ai Pro/Max OAuth auth** — this is the sanctioned channel for subscription usage stats.

### Statusline

- `"statusLine": {"type":"command","command":"..."}` in settings; script gets JSON on stdin after each assistant message: `model.display_name`, `workspace.current_dir`, `cost.total_cost_usd` (estimated, client-side), `cost.total_duration_ms`, `context_window.used_percentage`, `context_window.context_window_size` (200k or 1M), `exceeds_200k_tokens`, `session_id`, `transcript_path`. A glamfire statusline doubles as (a) a lightweight per-turn usage tick and (b) the visible "glamfire is absorbing this session" indicator.

### MCP

- glamfire runs as an MCP server inside Claude Code (project `.mcp.json` or `claude mcp add`; stdio/HTTP transports). Expose `glamfire_recall`, `glamfire_remember`, `glamfire_search_context` tools so Claude can *pull* from the shared brain mid-session, complementing the push-based file/hook sync. Hook matchers address MCP tools as `mcp__glamfire__.*`.

### Headless mode / Agent SDK

- `claude -p "prompt"` non-interactive; `--output-format json` returns `result`, `session_id`, **`total_cost_usd` and a per-model cost breakdown**; `stream-json` for NDJSON events; `--continue`/`--resume <id>`; `--bare` skips hooks/memory/CLAUDE.md discovery (and skips OAuth — requires `ANTHROPIC_API_KEY`). The Agent SDK (TS/Python) is the same engine programmatically — but see ToS below: **only with API keys, never subscription OAuth**.

## 3. Model swap inside Claude Code (GLM 5.2 via env override)

- Mechanism: set `ANTHROPIC_BASE_URL` (endpoint) + `ANTHROPIC_AUTH_TOKEN` (credential) — typically via `"env"` in `settings.json` — and Claude Code sends its Anthropic **Messages API** traffic to any endpoint speaking that format. Model names remap via `ANTHROPIC_DEFAULT_OPUS_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` / `ANTHROPIC_DEFAULT_HAIKU_MODEL` (or `ANTHROPIC_MODEL`). This is exactly how Z.ai's **official GLM Coding Plan docs** wire GLM into Claude Code: `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`, `ANTHROPIC_AUTH_TOKEN=<zai key>`, Sonnet/Opus → `glm-5.2`, Haiku → `glm-4.7`.
- Anthropic's own gateway docs bless the plumbing ("any gateway that exposes a supported API format works") while noting Anthropic "doesn't support routing Claude Code to non-Claude models" — unsupported, not prohibited, and no Anthropic credential is involved, so no consumer-ToS issue.
- Key doc nuance: **credential variable set → subscription not used** (billing goes to the token's owner); **only `ANTHROPIC_BASE_URL` set with a saved claude.ai login → the subscription is still the active credential** and the gateway must forward the OAuth capability in `anthropic-beta`. So the env split is also the billing split.
- For Fireworks: Fireworks serves OpenAI-compatible chat completions, so GLM-5.2-on-Fireworks inside Claude Code needs an **Anthropic-Messages→OpenAI translation layer**. That's precisely what community routers do — `musistudio/claude-code-router` (~33k stars, actively maintained through 2026) is a local gateway translating Claude Code's Anthropic-format requests to OpenAI-compatible/OpenRouter/DeepSeek/Z.ai/custom providers, with routing rules (default/background/think/longContext) and request rewrites. glamfire should own this layer itself (it *is* a router) rather than depend on CCR.
- What breaks in practice: features that lean on Anthropic-specific behavior degrade on third-party backends — interleaved thinking blocks, cache-control semantics, fine-grained tool-streaming, 1M-context negotiation, and any new beta header Claude Code starts sending (gateway must forward `anthropic-beta`). Tool-call fidelity is the usual failure mode; glamfire's adapter conformance suite is the answer.

## 4. Subscription constraints (the ToS bright line)

- **Feb 20, 2026:** Anthropic updated its legal terms: *"The use of OAuth tokens obtained via Claude Free, Pro, or Max accounts in any other product, tool, or service is not permitted"* — explicitly including the **Agent SDK**. Third parties may not offer claude.ai login or route requests through Free/Pro/Max credentials.
- **Jan 2026:** Anthropic stated it had blocked third parties "spoofing the Claude Code harness"; **Feb–Mar 2026:** server-side enforcement rolled out, breaking OpenClaw/OpenCode-style subscription piggybacking.
- Therefore: glamfire never reads, stores, forwards, or replays subscription OAuth tokens; glamfire's own agent loop always uses pay-as-you-go API keys (Fireworks, Anthropic API, etc.).
- What glamfire **can** do for subscription usage visibility, all sanctioned:
  - **OTEL export** (works on Pro/Max; emits tokens, estimated cost, model, user.email) — the primary team-stats feed.
  - **Statusline JSON** (`cost.total_cost_usd` per session) and **hooks** — local, official extension points of the official client.
  - **`/usage`** in-app shows 5-hour-window and weekly-limit consumption on subscriptions (display-only; no public per-user API for consumer plans).
  - **Admin Usage & Cost API** (`/v1/organizations/usage_report/messages`, `/v1/organizations/cost_report`, Admin key `sk-ant-admin01-…`) covers **API-org usage only**; the **Claude Code Analytics API** gives per-user estimated Claude Code costs for managed orgs (Console/Enterprise), not consumer Pro/Max.
- Report subscription usage as **"estimated value consumed"** (what those tokens would have cost at API rates) alongside real API spend — never conflate the two; the OTEL docs themselves flag `cost.usage` as an approximation that may differ from billing.

## 5. Prior art

- **ccusage** (npm CLI) — parses `~/.claude/projects/**/*.jsonl` usage blocks, prices via LiteLLM's pricing tables, daily/session/5-hour-block reports; the de-facto standard for subscription-side cost estimates. Inherits the JSONL input-token undercount problem.
- **claude-code-router (musistudio)** — local Anthropic-format gateway + router to any provider; validates the "Claude Code UX, commodity model" mode glamfire wants, and shows demand (33k+ stars).
- **claude-mem** (~84k stars, works with Claude Code/Codex/Copilot/OpenCode/more) — hook-driven capture of session activity, AI compression, context re-injection at SessionStart, MCP search; the closest existing "absorb the brain" tool and proof the hook+MCP capture pattern scales.
- **ClawMem / Mem0 / OpenMemory** — memory layers integrating via hooks + MCP into a shared store (SQLite vault or cloud) readable by multiple agent runtimes — exactly glamfire's cross-model memory shape, minus routing.
- **claude-usage-tracker, claude-code-usage-analyzer, tokemon** — more JSONL-parsing usage tools; Honeycomb/Datadog/Grafana ship Claude Code OTEL dashboards.
- Gap glamfire fills: nobody unifies **memory absorption + routing + team usage economics** in one owned harness; prior art does one slice each.

## 6. Recommended integration architecture

One local **glamfire daemon** per machine exposes three localhost surfaces; Claude Code is configured (via a `glamfire wrap claude` command that writes settings) to talk to all three. Claude Code's UX is untouched.

**A. Memory sync (bidirectional, real-time)**

1. **Shared auto-memory dir (primary):** set `autoMemoryDirectory` to glamfire's context store (e.g. `~/.glamfire/context/<project>/claude-memory/`). Claude Code natively reads/writes `MEMORY.md` + topic files there; glamfire indexes the same markdown and writes its own learnings into topic files + `MEMORY.md` index lines (respect the 200-line/25 KB index budget). No copying, no drift.
2. **Hook-driven ingestion:** `Stop`, `SessionEnd`, `PreCompact`, `PostToolUse` hooks of type `http` POST to the daemon; payload's `transcript_path` + `session_id` let glamfire tail the JSONL incrementally (offset per session) into the owned store — capturing full session history *before* the 30-day `cleanupPeriodDays` purge.
3. **CLAUDE.md interop:** glamfire reads the full hierarchy (managed/user/project/local + `.claude/rules/`) as instruction context for any model it runs; the shared instruction file lives once and is imported both ways (`@AGENTS.md`-style).
4. **Pull path:** glamfire MCP server (`.mcp.json`) exposes recall/search tools over the whole store — including knowledge learned in glamfire-native sessions on GLM — so Claude Code can query the shared brain mid-session; `SessionStart` hook injects a compact `additionalContext` digest at session open.

**B. Usage capture**

1. **OTLP receiver in the daemon** (localhost:4317); set `CLAUDE_CODE_ENABLE_TELEMETRY=1` + exporters via settings `env`. Ingest `claude_code.token.usage` / `cost.usage` with `model`, `session.id`, `user.email` attrs. Teams: developers' daemons forward rollups to the team glamfire server (or point OTLP straight at it).
2. Statusline script as a per-turn secondary tick + visible integration indicator; `claude -p --output-format json` `total_cost_usd` for headless runs.
3. Do **not** rely on transcript `usage` blocks for token counts (streaming-placeholder undercount); transcripts are for content.
4. One ledger, two labeled columns: **actual spend** (glamfire-routed API calls: Fireworks GLM, Anthropic API, gateways; reconciled against the Admin Usage/Cost API where an org exists) and **estimated subscription value** (OTEL from Pro/Max Claude Code). This is the "receipts" story: show what the subscription work *would have cost* and what routing saved.

**C. Tri-mode fluidity** (same brain under all three)

| Mode | Engine & billing | glamfire's role |
|---|---|---|
| 1. Claude Code + subscription | Anthropic models, Pro/Max OAuth inside the official client only | Passive absorber: hooks + OTEL + shared memory dir + MCP |
| 2. glamfire native | GLM 5.2 on Fireworks (API key), routed/escalated by glamfire | Full harness; reads/writes the same store and CLAUDE.md |
| 3. GLM inside Claude Code | Claude Code UI → `ANTHROPIC_BASE_URL` = glamfire local gateway (Anthropic-Messages endpoint) → translate → Fireworks GLM 5.2 (or Z.ai's Anthropic-format endpoint directly) | Gateway = first-party usage metering (exact tokens, no OTEL needed); adapter conformance suite gates fidelity |

Mode switching is a profile swap in settings `env` (`glamfire mode claude|glm|native`); memory surfaces are identical in all three, so a user can walk away from Claude Code — or from Anthropic models — with everything intact.

**ToS-safe boundaries (hard rules):** never touch subscription OAuth tokens or offer claude.ai login (mode 3 uses the user's *own* Fireworks/Z.ai key; the subscription is simply not used when `ANTHROPIC_AUTH_TOKEN` is set — matching Anthropic's own gateway docs); never run the Agent SDK or glamfire's loop on subscription credentials; never spoof the Claude Code harness; subscription stats come only from official telemetry surfaces (OTEL/hooks/statusline) and are labeled estimates.

## Key takeaways for glamfire

- **`autoMemoryDirectory` is the crown jewel:** one settings key makes Claude Code read/write its auto memory directly inside glamfire's store — bidirectional memory sync with zero sync code. Everything else (hooks, transcript tailing, MCP recall) layers on top.
- **Hooks carry pointers, not payloads:** every event includes `session_id` + `transcript_path`; `http`-type hooks POST straight to the glamfire daemon, which tails the JSONL incrementally. Ingest continuously — `cleanupPeriodDays` deletes transcripts after 30 days by default.
- **OTEL is the sanctioned subscription-usage channel:** works on Pro/Max, emits per-model tokens + estimated USD + user identity to any local OTLP endpoint; transcript token counts are known-bad (streaming placeholder, up to 100x undercount) — use them for content, never accounting.
- **The ToS line is precise and enforced (Feb–Mar 2026):** subscription OAuth tokens in any non-Anthropic client — including the Agent SDK — are banned and server-side blocked. glamfire's loop runs on API keys only; mode 3 (GLM inside Claude Code) is clean because it swaps in the user's own provider credential via documented env vars, exactly as Z.ai's official docs do.
- **The gateway mode doubles as the metering mode:** when glamfire is the `ANTHROPIC_BASE_URL` endpoint, it sees exact request/response tokens first-party — the most accurate usage data of all three modes, and the natural home for glamfire's router.
- **Prior art validates every slice** (claude-mem for hook-based memory, CCR for routing, ccusage for stats) but nobody combines them with an owned, model-agnostic store — that combination is the wrap.

## Sources

- Claude Code memory & auto memory docs: https://code.claude.com/docs/en/memory
- Claude Code hooks reference: https://code.claude.com/docs/en/hooks
- Claude Code monitoring / OpenTelemetry: https://code.claude.com/docs/en/monitoring-usage
- Claude Code statusline: https://code.claude.com/docs/en/statusline
- Claude Code headless / Agent SDK CLI: https://code.claude.com/docs/en/headless
- LLM gateways (subscriptions vs gateway credentials, `ANTHROPIC_BASE_URL`): https://code.claude.com/docs/en/llm-gateway
- Claude Code sessions / transcript retention: https://code.claude.com/docs/en/sessions
- Usage & Cost Admin API: https://platform.claude.com/docs/en/api/usage-cost-api
- Z.ai GLM Coding Plan × Claude Code (official): https://docs.z.ai/devpack/tool/claude
- Anthropic clarifies third-party OAuth ban (The Register, Feb 2026): https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/
- Anthropic cracks down on third-party harnesses (VentureBeat): https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses
- OpenClaw ban explainer (MindStudio): https://www.mindstudio.ai/blog/anthropic-openclaw-ban-oauth-authentication
- claude-code-router: https://github.com/musistudio/claude-code-router
- JSONL token undercount analysis: https://gille.ai/en/blog/claude-code-jsonl-logs-undercount-tokens/
- ccusage-based analyzer (JSONL locations): https://github.com/aarora79/claude-code-usage-analyzer
- claude-mem: https://github.com/thedotmack/claude-mem
- ClawMem (hooks + MCP shared vault): https://github.com/yoloshii/ClawMem
- Mem0 × Claude Code: https://docs.mem0.ai/integrations/claude-code
- Claude Code usage-limit visibility (/usage): https://ccforeveryone.com/guides/claude-code-limits-and-pricing
