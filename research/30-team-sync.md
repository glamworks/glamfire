# 30 — Team Sync: shared brain, one-unit Cloudflare deploy, team usage & audit

Research + recommended architecture for glamfire's **teams layer**: gated shared
knowledge (personal vs team split enforced structurally), git-version-controlled team
memory, a shared API server a team deploys **on their own Cloudflare account** as one
unit, team-wide usage/cost stats spanning subscription (Claude Code) and
pay-as-you-go API (GLM 5.2 on Fireworks), and team audit logs. Everything **optional**
— local-first single-user is the zero-config default; team sync is an upgrade a team
opts into at any time.

Builds on: [05-context-ownership.md](05-context-ownership.md) (brain = sqlite-vec
local-first, four-tier memory, export invariant), [06-team-harness.md](06-team-harness.md)
(Claude Tag mechanics; owned team context is the moat; audit logs + spend caps are
table stakes), [21-security-privacy.md](21-security-privacy.md) (secrets never in the
brain store; deny-wins permissions), and SPEC §5.2 (records scoped
private/project/team) and §5.6 (`@glamfire/team`). This brief does not repeat those —
it answers *how the team half is stored, synced, deployed, authed, and metered*.

---

## 1. Cloudflare as the one-unit team backend

### Platform pricing facts (July 2026)

- **Workers Paid: $5/month** base; includes **10M requests + 30M CPU-ms/month**;
  overage $0.30/M requests, $0.02/M CPU-ms. Free plan: 100k requests/day.
- **D1** (serverless SQLite): free plan 5M rows read/day, 100k rows written/day,
  5 GB. On Workers Paid: **first 25B rows read/mo and 50M rows written/mo included**,
  5 GB storage included, then $0.001/M reads, $1.00/M writes, $0.75/GB-mo.
  Scale-to-zero: no hourly/capacity billing, **no egress charges**.
- **Durable Objects**: available **on the free plan** with the SQLite storage
  backend. Workers Paid includes **1M requests + 400k GB-s duration/month**; overage
  $0.15/M requests, $12.50/M GB-s; SQLite-backed DO storage $0.20/GB-mo (storage
  billing enabled Jan 2026).
- **R2** (object storage): $0.015/GB-mo, **zero egress fees**; Class A (writes/lists)
  ~$4.50/M after the free 1M/mo allotment.
- Real-world full-stack Workers+KV+D1+R2 apps typically land **$15–50/month** — and
  that's for consumer-scale traffic, far above a 5–50 person team's sync workload.

**Realistic cost for a glamfire team server (5–50 people):** the workload is tiny —
memory-record sync, usage-event ingestion (thousands of events/day, not millions),
audit-log appends, and dashboard reads. A 50-person team doing 200 agent runs/day
each generates ~10k events/day ≈ 300k requests/month — **3% of the paid plan's
included requests, ~0.6% of D1's included writes**. Verdict:

- **Tiny teams (≤5): $0/month** — Workers free plan + free-plan D1 + SQLite-backed
  DO + Access free tier covers it.
- **5–50 people: $5/month flat** (Workers Paid), with storage the only conceivable
  overage (brain snapshots in R2 at $0.015/GB-mo — pennies).

This makes "very cheap" literal: the team backend costs less than one coffee, on
infrastructure the team owns.

### "Deploy to my Cloudflare" UX prior art

- **Deploy to Cloudflare buttons** (`https://deploy.workers.cloudflare.com/?url=<repo>`):
  Cloudflare clones the Git repo into the *user's* GitHub/GitLab account, **reads the
  repo's Wrangler config to determine resource requirements, provisions D1/R2/DO/KV
  automatically, and rewrites the wrangler config with the newly created resource
  IDs** — a one-page setup where the user picks names. Requirement: the template repo
  ships default values for every binding (names, placeholder IDs). Only github.com /
  gitlab.com sources supported.
- **`wrangler deploy`** is the CLI equivalent: one command deploys the Worker plus
  all bindings declared in `wrangler.jsonc`; `wrangler d1 migrations apply` handles
  schema. `cloudflare/wrangler-action` covers CI-driven deploys.
- This is exactly the "deployable as one unit" shape: **one repo = Worker code +
  wrangler config declaring D1/R2/DO + D1 migrations + Access setup script**, one
  button or one CLI command to stand it all up in the team's own account.

### Team-only auth options

- **Cloudflare Access (Zero Trust) free plan: up to 50 users, permanently free** —
  precisely spanning the 5–50 target. Full ZTNA policies, IdP login (Google/GitHub/
  Okta/etc.) or one-time PIN email (no IdP needed).
- **Service tokens**: Access-generated Client ID + Client Secret pairs for
  non-interactive clients (the `glam` CLI daemon, CI) — sent as headers, evaluated by
  "Service Auth" policies without an IdP login. **mTLS** client certificates are also
  supported for machine auth.
- **Worker-side verification**: Access injects a `Cf-Access-Jwt-Assertion` JWT header
  on every proxied request; the Worker validates it with `jose` against the team's
  JWKS at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, checking the
  per-application **AUD tag**. Validate the header, not the cookie. This gives
  defense-in-depth: even if someone hits the Worker URL directly, no valid JWT → 403.

---

## 2. Sync model: what to copy from prior art

| System | Model | Lesson for glamfire |
|---|---|---|
| **atuin** (shell-history sync) | Client-side **E2E-encrypted, append-only record log** pushed to a dumb server (self-hostable, Postgres); each machine appends records, server stores ciphertext it can't read; clients pull + merge by record index | **The analog for usage-stats and audit sync.** Append-only events never conflict; server can be untrusted for personal data; idempotent push/pull is trivially robust |
| **Obsidian LiveSync** | CouchDB/PouchDB replication, chunk-level diff-match-patch merging, `_changes` feed for 1–2 s live sync; falls back to newest-file or manual-resolution UI | Live replication is achievable but conflict UX is the hard part; timestamp fallback ("resolve by newer file") is what real systems ship |
| **Git-based note sync** | Repo as transport; works on desktops, **breaks down on merge conflicts for non-technical/mobile flows** | Fine for glamfire: users are developers, records are one-fact-per-file, and the orchestrating tool (glam) can auto-merge; PR review of knowledge changes is a *feature* |
| **Anytype / any-sync** | CRDT + P2P + E2E encryption; local-first spaces, backup nodes hold only ciphertext | The full-CRDT path: maximal correctness, heavy machinery (custom protocol, tree of CRDT changes, key management) |
| **Automerge** | JSON CRDT; per-key concurrent writes resolve by deterministic **last-write-wins** (Lamport timestamp + actor ID); only text/lists get true CRDT merging | Key insight: **for key-value/record data, mature CRDTs are LWW anyway.** CRDTs only pay off for concurrent rich-text editing — which glamfire's brain records are not |

### Choice: git for knowledge, append-only log over the API for telemetry

- **Team knowledge = a git repo.** Records are append-mostly, one-fact-per-record
  (SPEC §5.2), human-readable files. Git gives, for free: the owner's hard
  requirement ("git version controlled"), full history/blame/revert of the team
  brain, PR review before knowledge lands, offline-first operation, and the
  ownership guarantee (clone = export). Conflicts are rare (distinct records =
  distinct files) and record-level **LWW by timestamp** — the same resolution
  Automerge would apply — handles the residual case, with `glam` doing the merge so
  humans never touch conflict markers. A CRDT engine would add a custom protocol and
  binary state for zero practical gain here.
- **Usage stats + audit events = atuin-style append-only records** pushed to the team
  Worker API (not git — high-frequency, machine-generated, never edited). Append-only
  ⇒ no conflicts by construction; each client tracks `(host_id, last_idx)` cursors;
  pushes are idempotent upserts keyed on `(host_id, idx)`.
- **Embeddings/indexes are derived, never synced.** Each client regenerates vectors
  from the canonical text (SPEC's "no opaque embedding that can't be regenerated"),
  so the git repo stays small, diffable, and model-neutral.

---

## 3. Personal-vs-team gating: prior art and the write-time rule

- **Mem0** scopes memory along `user_id` / `agent_id` / `run_id` / `app_id` and
  distinguishes **user memory** (personal preferences, account state) from
  **organizational memory** (shared policies/FAQs). Its documented production
  pattern is **hybrid: private tiers + shared tiers with selective sync**; its
  documented failure mode is exactly the one glamfire must prevent: "over-broad
  scoping … **contaminates the org layer with individual user data**."
- **Glean** enforces permission-aware retrieval by mirroring source-system ACLs into
  its knowledge graph and filtering at query time per signed-in user — the
  *read-side* model. **Claude Tag** (file 06) confines memories to admin-defined
  channels and never reads private channels — the *ingest-side* model.
- **Write-time scrubbing**: **Microsoft Presidio** (MIT, Analyzer + Anonymizer,
  active 2026 releases) is the OSS standard for detecting/redacting PII **before
  data hits logs or stores**; documented agent pattern is "wire it before context
  assembly and after tool calls," storing only redacted traces.

**glamfire's stance — structural, not filtered:** read-side filtering (Glean-style)
requires trusting every query path forever. Instead:

1. **Two physically separate stores.** Personal brain: `~/.glam/brain.db` (never
   synced, never uploaded — existing invariant). Team brain: a distinct git repo
   (e.g. `.glam-team/` or `git@…:org/team-brain`). A record is in the team store only
   because a **promotion** wrote it there. There is no query that can reach personal
   data through the team path, because the team path has no personal data.
2. **Every record type declares team-shareability in its schema, bottom-up.** Each
   brain record type gets a `sharing` classification in its Zod schema:
   `shareable` (Fact/Document/Pointer/Skill content), `shareable-after-redaction`
   (Episodes: tool outputs and prompts may embed paths, tokens, personal notes), or
   `strictly-personal` (API keys — already banned from the brain per file 21 —
   personal preferences, `user_id`-scoped working memory, raw shell/env captures).
   `strictly-personal` types have **no promotion code path at all**.
3. **Promotion pipeline (the only door):** explicit `glam share <record>` (or a
   policy like "auto-propose Facts tagged `project:X`") → Presidio-style
   detector pass (PII entities + secret patterns from the file-21 scanner) →
   provenance rewrite (strip machine paths, usernames) → **git commit on a branch /
   PR**, so a human (or a review rule) sees exactly what is about to become team
   knowledge. Default deny: nothing is shared that wasn't promoted.
4. **Telemetry gets the same split**: usage events sent to the team server carry
   counts, model/provider, cost, task metadata — **never prompt or completion text**
   (mirrors Claude Code's own OTel telemetry, which lets orgs aggregate usage without
   content).

---

## 4. Team usage/cost aggregation: prior art

- **Claude Code OpenTelemetry**: `CLAUDE_CODE_ENABLE_TELEMETRY=1` + OTLP exporters
  emit metrics (tokens, cost, lines accepted, model) and events; the community
  pattern is exactly glamfire's target — **aggregate multiple developers'
  environments to one OTel collector for centralized per-user, per-model cost**
  (SigNoz/Grafana/CloudWatch guides; per-session cost via Bindplane). This is how
  glamfire captures **subscription-side** usage when Claude Code is the escalation
  path: consume the same OTel stream locally and forward normalized events.
- **ccusage**: reads Claude Code's **local JSONL session logs** to compute
  usage/cost offline — proof that subscription usage is recoverable from disk with
  zero vendor cooperation; a good fallback when OTel isn't enabled.
- **LiteLLM proxy**: the reference for **PAYG-side** team spend: virtual keys with
  per-key/per-user/per-team spend tracking in Postgres, **team budgets with request
  rejection when exceeded**, spend reports by key/team/model/day. glamfire's router
  already records projected+actual cost per step (SPEC §5.3) — the team layer only
  needs to *aggregate* what the router logs, not proxy traffic.
- **Helicone / Langfuse (self-hosted)**: proxy-based vs trace-based observability;
  both prove teams will self-host cost dashboards; Langfuse self-host runs ~$50–80/mo
  on a VPS — glamfire's D1-rollup approach is an order of magnitude cheaper because
  it stores rollups + events, not full traces (full traces stay local per file 09).

**Unifying subscription + PAYG:** normalize both streams into one event schema with a
`billing_mode` discriminator — `subscription` events carry tokens + *imputed* cost
(ccusage-style model pricing) and plan-quota consumption; `api` events carry tokens +
*actual* provider cost from the adapter's pricing function. The team dashboard then
answers the real questions: total spend, spend per person/model/provider,
center-vs-edge distribution (SPEC's distribution report, now team-wide), and "how
much of the Anthropic subscription are we burning vs Fireworks PAYG."

---

## 5. Recommended architecture

### 5.1 Data model — the personal/team split

```
~/.glam/brain.db            # personal store (sqlite-vec). NEVER synced.
<team-brain repo>/          # team store. Git = transport, history, review, export.
  facts/<ulid>.md           # one record per file, YAML frontmatter:
  documents/<ulid>/         #   id, type, scope, tags, provenance, promoted_by,
  pointers/<ulid>.md        #   promoted_at, redaction_report_hash
  skills/<name>/            # shareable skill packs (SPEC §5.5)
  episodes/<ulid>.md        # only redaction-passed episodes
  team.toml                 # team id, server URL, Access AUD, policy (review rules)
# derived, per-client, gitignored: embeddings/index rebuilt locally
```

Every record schema carries `sharing: shareable | shareable-after-redaction |
strictly-personal` (compile-time, per record type) and `scope: private | project |
team` (runtime, per record; default `private`). Promotion = the only write path into
the team repo, and it type-errors on `strictly-personal`.

### 5.2 Sync protocol

- **Knowledge**: git push/pull of the team-brain repo (any git host, or the team
  Worker can front a mirror). Conflicts: distinct files almost always; same-record
  edits resolve LWW-by-`updated_at` with the loser preserved in git history.
- **Telemetry/audit**: append-only records POSTed to the team Worker
  (`(host_id, idx)` idempotency keys, atuin-style); clients keep cursors, retry
  freely; a per-team **Durable Object** serializes ingestion and fans out live
  dashboard updates over WebSocket, with rollups written to D1.

### 5.3 One-unit Cloudflare deploy (`glamfire-team-server` template repo)

```jsonc
// wrangler.jsonc (default values so the Deploy button can provision everything)
{
  "name": "glamfire-team",
  "main": "src/index.ts",                       // Hono app
  "d1_databases": [{ "binding": "DB", "database_name": "glamfire-team" }],
  "r2_buckets":  [{ "binding": "SNAPSHOTS", "bucket_name": "glamfire-team-snapshots" }],
  "durable_objects": { "bindings": [{ "name": "TEAM", "class_name": "TeamCoordinator" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["TeamCoordinator"] }]
}
```

- D1: `usage_events`, `audit_log`, rollup tables, `members`. R2: brain snapshots /
  large document blobs / exports. DO `TeamCoordinator`: ingestion serialization +
  live dashboard fanout. Worker routes: `/v1/events`, `/v1/audit`, `/v1/stats`,
  `/v1/team` (membership), `/dash` (read-only HTML dashboard).
- **Two deploy paths, same repo**: README "Deploy to Cloudflare" button
  (provisions resources, rewrites config, clones into the team's GitHub), and
  `glam team create`, which runs `wrangler deploy` + `wrangler d1 migrations apply`
  + an Access-setup step via the Cloudflare API, then writes `team.toml`.

### 5.4 Auth design

- **Cloudflare Access app** in front of the Worker: humans authenticate via the
  team's IdP or one-time PIN email; **free for up to 50 users** — the whole target
  range. CLI/CI use **Access service tokens** (Client ID/Secret headers) minted per
  member machine by `glam team join`.
- Worker **also** validates `Cf-Access-Jwt-Assertion` (jose + team JWKS + app AUD)
  and maps identity → role (`member` | `admin`) from D1 — Access gates the edge,
  the Worker enforces authorization. No glamfire-run service anywhere; the team's
  Cloudflare account is the entire trust boundary.

### 5.5 Audit log schema (sketch)

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,            -- ulid
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,            -- Access identity email or service-token id
  host_id TEXT NOT NULL, idx INTEGER NOT NULL,   -- append-only cursor (atuin-style)
  task_id TEXT, project TEXT, repo TEXT,
  event TEXT NOT NULL,            -- run.start|route.decide|route.escalate|tool.call
                                  -- |commit|share.promote|team.join|config.change
  model TEXT, provider TEXT, adapter_version TEXT,
  distribution REAL, confidence REAL,            -- router score (SPEC §5.3)
  tokens_in INTEGER, tokens_out INTEGER,
  cost_usd REAL, billing_mode TEXT,              -- 'subscription' | 'api'
  commit_sha TEXT, files_changed INTEGER,        -- code-change linkage
  detail TEXT,                    -- JSON; content-free (no prompts/completions)
  prev_hash TEXT, hash TEXT,      -- hash chain → tamper-evident
  UNIQUE (host_id, idx)
);
```

This answers file 06's governance bar (who used which model/provider for every task,
what changed, spend caps enforceable from the same rows) and exceeds Claude Tag:
exportable, hash-chained, in the team's own account.

### 5.6 Local → team upgrade path

- **Single user (default)**: nothing above exists. No team repo, no server, no
  network calls. `glam` works fully offline-first — the current product, unchanged.
- **`glam team create`**: scaffolds the team-brain git repo + deploys the template to
  the team's Cloudflare account + configures Access + writes `team.toml` + prints an
  invite command. One command, ~2 minutes, $0–5/month.
- **`glam team join <repo-or-url>`**: clones team brain, completes Access login,
  stores the service token in the OS keychain (file 21), starts background sync.
- **`glam team leave` / team deletion**: remove `team.toml`; the team brain is a git
  repo the team already fully owns — leaving glamfire loses nothing (the SPEC's
  rip-out-ability, made literal).
- Promotion (`glam share …`) is the only moment personal-side data can move — always
  explicit, always through the redaction pipeline, always a reviewable git commit.

---

## Key takeaways for glamfire

- **$5/month (often $0) is the honest number** for a 5–50 person team backend on the
  team's own Cloudflare account: Workers Paid's included quotas exceed a team's sync
  workload by ~30×, D1/DO/R2 included tiers cover the rest, and **Cloudflare Access
  is free up to exactly 50 users**. "Cheaper than one coffee, on infra you own" is a
  marketable, verifiable claim.
- **One repo = one unit.** A `glamfire-team-server` template with default-valued
  wrangler bindings supports both the **Deploy to Cloudflare button** (auto-provisions
  D1/R2/DO into the user's account) and `glam team create` wrapping
  `wrangler deploy` + migrations + Access setup. Ship the button in the README.
- **Split the sync protocol by data shape**: git for team knowledge (review, history,
  the owner's git requirement, export-by-clone), atuin-style append-only encrypted-
  friendly records over the API for usage/audit (conflict-free by construction).
  **Reject CRDTs**: Automerge itself resolves record-level concurrent writes with
  LWW, so a CRDT engine buys nothing for one-fact-per-record data.
- **Make the personal/team boundary structural, not a filter**: two physically
  separate stores; per-record-type `sharing` classification in the schema
  (`strictly-personal` types have no promotion code path); explicit promotion through
  a Presidio-style PII + secret redaction pass landing as a reviewable git commit.
  Mem0's documented failure mode ("org layer contaminated with user data") is the
  thing this design makes impossible rather than unlikely.
- **Aggregate, don't proxy, for cost**: the router already logs per-step cost;
  normalize glamfire run events (PAYG) + Claude Code OTel/JSONL (subscription) into
  one `billing_mode`-tagged event stream, roll up in D1, and the team-wide
  distribution report (SPEC §5.3) falls out. Content never leaves the laptop — only
  counts, models, costs, and hashes.
- **All of it is opt-in and reversible**: zero-config single user, `glam team create`
  / `join` to upgrade, `leave` to walk away with the whole team brain (it's just a
  git repo). This is the team-scale expression of "own your context."

---

## Sources

- Cloudflare Workers pricing — https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 pricing — https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare Durable Objects pricing — https://developers.cloudflare.com/durable-objects/platform/pricing/
- Workers & Pages plans — https://www.cloudflare.com/plans/developer-platform/
- Cloudflare Workers pricing 2026 (hidden costs, $15–50 full-stack) — https://toolradar.com/tools/cloudflare-workers/pricing
- Deploy to Cloudflare buttons — https://developers.cloudflare.com/workers/platform/deploy-buttons/
- Deploy a Workers application in seconds (blog) — https://blog.cloudflare.com/deploy-workers-applications-in-seconds/
- Wrangler commands — https://developers.cloudflare.com/workers/wrangler/commands/
- wrangler-action (CI deploys) — https://github.com/cloudflare/wrangler-action
- Cloudflare Zero Trust plans (free ≤50 users) — https://www.cloudflare.com/plans/zero-trust-services/
- Cloudflare Access service tokens — https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- Validate Access JWTs (Cf-Access-Jwt-Assertion, AUD) — https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- Atuin (E2E-encrypted shell-history sync) — https://atuin.sh/ and https://docs.atuin.sh/cli/guide/sync/
- Atuin self-hosted sync server — https://neilzone.co.uk/2024/01/keeping-bash-history-in-sync-using-atuin-and-a-self-hosted-sync-server/
- Obsidian LiveSync synchronization system — https://deepwiki.com/vrtmrz/obsidian-livesync/3-synchronization-system
- Obsidian LiveSync conflict resolution — https://deepwiki.com/vrtmrz/obsidian-livesync/4.2-conflict-resolution
- Automerge (CRDT; LWW for concurrent key writes) — https://automerge.org/docs/reference/concepts/ and https://github.com/automerge/automerge
- Automerge CRDT concepts (Lamport/actor LWW) — https://posit-dev.github.io/automerge-r/articles/crdt-concepts.html
- any-sync protocol (Anytype; local-first E2E CRDT spaces) — https://github.com/anyproto/any-sync
- Mem0 memory types (user vs organizational) — https://docs.mem0.ai/core-concepts/memory-types
- Mem0 multi-agent memory (hybrid private+shared; contamination pitfall) — https://mem0.ai/blog/multi-agent-memory-systems
- Glean permissions-aware AI — https://www.glean.com/perspectives/security-permissions-aware-ai
- Glean Slack permission model — https://www.glean.com/connectors/slack
- Microsoft Presidio PII detection/anonymization guide — https://explainx.ai/blog/microsoft-presidio-pii-detection-anonymization-guide-2026
- Presidio for privacy-aware agents (redact before store) — https://laxmikumars.medium.com/llms-protecting-sensitive-data-with-microsoft-presidio-33265c887f95
- Claude Code monitoring (OTel telemetry) — https://code.claude.com/docs/en/monitoring-usage
- Claude Code + OTel team aggregation (SigNoz) — https://signoz.io/blog/claude-code-monitoring-with-opentelemetry/
- Centralized Claude Code usage across environments — https://yag.xyz/en/post/claude-code-otel/
- Per-session Claude Code cost via OTel (Bindplane) — https://bindplane.com/blog/claude-code-opentelemetry-per-session-cost-and-token-tracking
- ccusage & open-source Claude usage tools — https://apidog.com/blog/open-source-tools-to-monitor-claude-code-usages/
- LiteLLM spend tracking — https://docs.litellm.ai/docs/proxy/cost_tracking
- LiteLLM team budgets — https://docs.litellm.ai/docs/proxy/team_budgets
- Langfuse vs Helicone (self-hosted cost observability) — https://particula.tech/blog/helicone-vs-langfuse-vs-langsmith-llm-observability
