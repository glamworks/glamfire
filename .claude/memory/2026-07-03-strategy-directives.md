# Strategy directives — 2026-07-03 (from Brian, verbatim intent)

Standing product direction. Every item below is a durable directive, not a one-off.

## Messaging

- **Kill "free to self-host" from top-line copy.** Technically true, misleading in
  practice. We are opinionated: 99% of users run open weights on serverless
  (Fireworks-class), not their laptop. Self-host stays as a supported tier, never the
  pitch. Complements existing stance: "local-first describes your data, not your GPUs."
- **README / site lead: Claude Code + teams.** First and foremost:
  1. You do NOT need to leave Claude Code or your Anthropic subscription. Use Claude
     Code as normal — with Claude, or GLM 5.2 on Fireworks, or other — and you get
     glamfire memory, knowledge, usage, billing.
  2. Walk away from Claude Code any time; memories are already up to date in glamfire.
  3. Team: shared memories (safe, no personal data, secure online repo), team usage +
     billing stats across ALL providers (subscription AND pay-as-you-go API), audit
     logs across team: what model/provider used for every task, what code changes,
     commits, projects.
- **Positioning: glamfire targets long-horizon tasks and teams.**

## Teams (all optional — effortless local single-user, switch to team sync anytime)

- Shared knowledge/memory across team. Gated + smart: everything architected bottom-up
  as team-shareable vs strictly personal.
- Git version controlled.
- Shared API server deployable for a team, very cheap, on THEIR Cloudflare (secure,
  team-only). Deployable as one unit with shared team knowledge.
- Shared usage stats, monitoring, costs.

## Claude Code deep wrap

- Claude Code is the best harness — wrap it more deeply. Claude Code works as usual;
  glamfire incorporates the Claude Code brain/memory into glamfire memory in real
  time. Knowledge picked up in Claude Code is available to any model in glamfire.
  Walk away from Claude Code and keep everything.

## Subscriptions coexistence (hard requirement)

- Anthropic subscription can't be used outside their harness. So ALL glamfire features
  must work for a user (and team) that fluidly mixes: (a) Claude Code w/ Anthropic
  subscription, (b) glamfire w/ GLM 5.2 on Fireworks, (c) GLM 5.2 on Fireworks INSIDE
  Claude Code. Memory, usage, billing, audit must span all three.

## Models

- First-class full-featured support: **Ornith** (research/26) and **dwarfstar**
  (research pending) — plus absorb all lessons learned from each into glamfire itself.
- GLM 5.2 stays workhorse.

## Capability-grounded routing

- Bake in Artificial Analysis + other benchmarks, auto-updated, alongside pricing.
- Task-specific: task arrives → match to relevant benchmark (e.g. biology → natural
  sciences bench) → weighted capability×price score → recommend model AND estimate
  the cost of THIS task (not per-token price — estimated total for the actual task).
  User command for recommendation, or system auto-picks.

## Meta-model transparency

- glamfire relies on a meta-model for routing decisions. Must be explicit how this
  works; user must be able to choose which model/provider powers the meta-model.

## Flat-file knowledge base ("grep is all you need")

- Karpathy et al.: ripgrep + markdown (summaries/indexes + drill-down to source) is
  all you need. First-class distinction: source-of-truth documents vs LLM summaries.
- SQLite/D1/R2 keep their role, but add sync to a local flat-file markdown knowledge
  base — git version controlled, team shared. Kills the adoption objection: "it uses
  an opaque database, not flat markdown files."

## Meta

- Drive hard. Competition fierce. Goal: #1 open-source project in class. Actively
  identify improvements, research, no stone left unturned.
