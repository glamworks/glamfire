# 32 — The road to #1: ruthless gap analysis & ranked backlog

*Last updated: 2026-07-03. Owner directive: "Make this the number one open source
project in its class. Actively identify improvements. Research. No stone left
unturned. Competition is fierce." This brief is the no-stone-unturned answer: where
glamfire actually stands, what the class looks like in mid-2026, every table-stakes
gap, the differentiators worth betting on, a ranked top-20 backlog, and an honest
read on what #1 would actually take.*

---

## 1. Where glamfire actually stands (the unflattering baseline)

- **v0.4.1**, Apache-2.0, TypeScript monorepo (engine, brain, router, adapters,
  skills, config, cli, sdk, team packages).
- **Works and live-verified:** `glam run` (agent loop, sandboxed tools, hard
  `--max-usd` stop), `glam route` (offline per-task center/edge routing with
  calibrated confidence + escalation cascade + distribution report), `glam models`
  (dated, sourced price catalog + `--refresh`), `glam usage` (local JSONL spend
  ledger + monthly budget alerts), `glam doctor`/`config`, brain (SQLite +
  sqlite-vec + FTS5, tested JSONL export/import round-trip — **not yet wired into
  the run loop**), skills loader, three adapters / seven model configs behind one
  conformance suite (Fireworks live-verified; Anthropic/Together fixture-verified,
  live pending keys), npm/Homebrew/Scoop/winget packaging + signed releases.
- **GitHub reality: 0 stars, 1 fork, 26 open issues** ([repo](https://github.com/glamworks/glamfire)).
  Nobody outside the project knows it exists. Every "competition" number below is
  five to six orders of magnitude ahead on distribution. That is the real problem
  statement: the product gap is closable; the distribution gap is the mountain.

---

## 2. The class in mid-2026 — who we are actually up against

The class = **open-source, model-agnostic agent harnesses** (coding-first CLIs plus
the personal-agent adjacents that share the harness architecture). The landscape
reshuffled violently in the last 12 months.

| Project | Stars (mid-2026) | Trajectory | Killer features | Memory story | Routing story | Teams/audit story | What users complain about |
|---|---|---|---|---|---|---|---|
| **opencode** (Anomaly, ex-SST) | ~165–178k, 7.5–8M monthly devs, 900+ contributors | Dominant; 18k stars in 2 weeks of Jan 2026 alone | TUI + desktop + IDE ext + web; 75+ providers; LSP diagnostics; plan/build modes; sub-agents & **mixed-model agent teams**; MCP + ACP; plugins; `/undo`/`/redo`; session share links; GitHub/GitLab bots; enterprise SSO/central config | AGENTS.md rules + project init; no owned portable memory store | **Zen** — hosted curated model gateway (monetization layer); DigitalOcean "inference routers" surfaced in the model picker; no local in-harness cost router | Enterprise tier: SSO, central config, "code never leaves your infra"; per-seat pricing | Config sprawl; Zen is a hosted middleman (the thing OSS users fled to avoid); no spend ceilings |
| **OpenClaw** | ~375k (largest OSS agent repo ever) | 100k stars by Feb 2026; viral | Personal agent across 25+ channels + voice; SOUL.md personality; ClawHub skills marketplace; embeds pi SDK | Plain-file MEMORY.md/SOUL.md — genuinely owned but unstructured | None (single configured model, BYOK) | None — and that's the disaster | **Security crisis**: CVE-2026-25253 (CVSS 8.8), 30–42k exposed instances, ClawHavoc supply-chain campaign (800+ malicious skills, ~20% of registry), 36% of skills with prompt injection (Snyk) |
| **Hermes Agent** | ~171k | Fastest-growing (+89k stars in one month, May 2026); topped OpenRouter daily tokens (224B/day) | OpenClaw-class personal harness with its own runtime | File-based | None | None | Same exposure class as OpenClaw |
| **pi** (Earendil, ex badlogic/pi-mono) | ~54–57k | Breakout newcomer | **Minimal harness**: <1,000-token system prompt, 4 core tools, "lazy skills" (1 line of context each until invoked), ships as SDK; powers OpenClaw | Session files; deliberately minimal | None (manual) | None | Deliberately spartan; you build the rest |
| **OpenHands** | ~75–79k | Steady | Autonomous long-horizon dev agent; sandboxed Docker/VM; CI/CD + GitHub/Slack/Linear automations; context condensers | Condensers (compression, not portable memory) | LLM profiles = manual mid-task switching | Cloud + self-host; some org features | Heavy infra; token-costly on long tasks |
| **Cline** | ~62–64k | Steady | IDE + CLI + SDK; plan/act; huge provider list | **Memory Bank** (markdown docs pattern) | Manual picker (plan vs act models) | Cline Teams (hosted) | Session resets; token burn |
| **Kilo Code** | ~mid-20s k but fastest-growing IDE fork | Rising | VS Code + JetBrains + CLI; **shared Memory Bank across surfaces**; **checkpoints/snapshots with `/checkpoint restore`**; YOLO mode; 500+ models via zero-markup gateway; weekly shipping blog | Memory Bank markdown, auto-loaded | Kilo Gateway (hosted, zero-markup) | Team dashboards on gateway | Gateway is still a middleman |
| **Goose** (Block → **AAIF/Linux Foundation**) | ~50k | Steady; foundation governance | Desktop + CLI + API; 70+ MCP extensions; **lead/worker two-tier model routing**; ACP subscription access | Local, unstructured | **Coarse lead/worker auto-switch** — still the only in-harness auto-routing besides glamfire's design | Foundation governance is the enterprise story | Coarse routing; general-purpose blur |
| **Aider** | ~39–42k, 4.1M installs, 15B tokens/week | Plateaued/mature; maintainer-continuity scares (issue #4613) | Git-native pair programming; repo map; **model leaderboard as marketing** | Repo map (ephemeral) | Manual + weak/editor model split | None | Not agentic enough vs 2026 class; single-maintainer risk |
| **Codex CLI** (OpenAI) | ~85–94k | Big but vendor-first | Rust, best-in-class sandboxing | None portable | None | Enterprise via ChatGPT plans | Responses-API lock broke third-party providers |
| **Dead/retired in 2026** | — | — | **Gemini CLI retired at 104k stars** (closed-source successor); **Roo Code self-archived at 24k**; original Go opencode → Crush archived path | — | — | — | Proof the class churns hard and fast |

**Adjacent threat — the router layer commoditizing separately:** LiteLLM (~51k
stars, default reliability layer at Stripe/Netflix), RouteLLM (Berkeley),
claude-code-router, NadirClaw ("routes simple prompts cheap, complex premium,
saves 40–70%"), LLMRouter, plus hosted routing (opencode Zen, Kilo Gateway,
OpenRouter auto-router, DigitalOcean inference routers). **The 07-competitors
claim that "routing is white space" has eroded**: routing exists everywhere *as a
proxy or a hosted gateway*. What still does not exist anywhere: **in-harness,
local, per-task cost/capability routing with calibrated confidence, verified
escalation, and a receipts ledger — open source, no middleman.** That is now the
precise white space, and it is narrower than it was a year ago.

**Standards became table stakes:** MCP (now AAIF-governed), **AGENTS.md**
(AAIF-endorsed repo instruction standard), and **ACP** (Zed/JetBrains editor↔agent
protocol; registry launched Jan 2026). A harness that speaks none of them reads
as non-serious in 2026.

---

## 3. What actually moved the needle for the winners (distribution lessons)

1. **Lock-in outrage is the #1 growth event in this class.** opencode's biggest
   surge came when Anthropic blocked consumer-subscription routing on Jan 9, 2026 —
   DHH called it "customer hostile," HN erupted, and opencode absorbed the exodus.
   Developers adopted it *as a hedge against vendor lock-in*, not because it
   benchmarked better. glamfire's entire thesis is this event, productized.
   **Lesson: be visibly ready before the next outage/crackdown and ride it.**
2. **Founder credibility content beats marketing.** pi went 0→54k on Armin
   Ronacher's and Mario Zechner's blogs, a Pragmatic Engineer feature, and a Syntax
   podcast — the artifact was a strongly-argued *engineering opinion* (minimal
   harness) that people could test in ten minutes.
3. **Virality attaches to memory + personality + channels** (OpenClaw), and then
   **security failures attach to virality** (CVE, 42k exposed instances, poisoned
   skills registry). The class's open wound is security; the first harness with a
   *provable* security story wins the enterprise cohort the crisis scared.
4. **Benchmarks are marketing.** Aider's leaderboard carried it for two years;
   Terminal-Bench 2.1 now scores **agent+model pairs** (harness included) and gets
   quoted in every "best agent" roundup. A router harness has a unique benchmark
   claim available: *equal Terminal-Bench score at X% of the cost*.
5. **Weekly, visible shipping cadence compounds** (Kilo's "This Week in Kilo
   Code" blog; opencode's relentless releases). Star growth correlates with
   perceived momentum more than with feature count.
6. **Install friction is near-zero everywhere** — one-line install, then a TUI you
   can talk to. glamfire has the install story; it lacks the "then you live in it"
   surface (interactive session).
7. **Monetized gateways fund the leaders** (Zen, Kilo Gateway) — and simultaneously
   re-create the middleman OSS users fled. glamfire's "direct-to-provider, no
   markup, ledger on your disk" is the honest counter-position — but only lands if
   stated loudly in comparisons.

---

## 4. Feature-gap table — table stakes glamfire is missing

"Table stakes" = shipped by ≥3 of the class leaders and expected by reviewers.

| Capability | Class norm (who has it) | glamfire today | Severity |
|---|---|---|---|
| **Interactive session (TUI/REPL/chat)** | opencode TUI+desktop, Goose desktop+CLI, Cline, Kilo, pi | One-shot `glam run` only | **Blocker for daily-driver use** |
| **Session persistence / resume / continue** | opencode, Cline, Kilo, OpenHands | Runs are logged but not resumable | Blocker |
| **MCP client support** | opencode, Goose (70+ extensions), Cline, Kilo, Codex | None — tools are built-in only | **Blocker** (MCP is AAIF-standard) |
| **AGENTS.md / repo rules ingestion** | opencode `/init`, Kilo, Codex, Goose | None | High, cheap to fix |
| **Checkpoints / undo / rewind** | opencode `/undo`/`/redo`, Kilo git-based snapshots + `/checkpoint restore` | None | High (trust feature) |
| **Sub-agents / parallel agent teams (mixed-model)** | Claude Code Feb 2026, opencode agent teams, Goose | None | High — and glamfire's router makes it *better* than the class (per-subagent routing) |
| **Local model adapter (Ollama/vLLM/OpenAI-compatible)** | Everyone | Specified, not built | High — OSS crowd litmus test |
| **Image/vision input** | opencode (drag-drop images), Cline, Codex | None (vision is a routing capability token only) | Medium |
| **IDE presence (extension or ACP)** | opencode IDE ext, Cline/Kilo/Roo VS Code+JetBrains, ACP in Zed/JetBrains | None | Medium-high; **ACP is the cheap path** — one protocol, two editors free |
| **Plugins / extensibility API** | opencode plugins, pi skills/SDK, Goose extensions | Skills exist but no third-party ecosystem hooks | Medium |
| **Web/GitHub surface (bot, `@agent` on issues/PRs)** | opencode GitHub/GitLab, OpenHands automations | Dogfood script only | Medium |
| **Conversation/context compaction** | OpenHands condensers, opencode, Claude Code | None (budget stop instead) | Medium |
| **Shell command streaming + rich diffs in-terminal** | opencode, Kilo, pi | Basic | Medium |
| **OS-level exec sandbox** | Codex (containerized default) | Allowlist no-shell (good) but no OS isolation | Medium; publishable security win if done right |
| **Docker image / server mode** | OpenHands, Goose API, opencode server | Specified, not built | Medium |
| **Hosted/optional "just works" model access for key-less onboarding** | Zen, Kilo Gateway, opencode Go | BYO Fireworks key only | Strategic choice — arguably *don't* copy; but onboarding needs a free-tier path |

**Not missing (at or above class):** hard per-run budget stop (nobody has it),
local spend ledger + monthly budget (nobody has it local-first), offline routing
dry-run with explainable signals (unique), adapter conformance gating (unique),
dated/sourced price catalog (unique; models.dev is the nearest analog), tested
memory export/import invariant (unique — but the brain isn't in the loop yet),
signed releases + SBOM (rare), honest "current reality" docs (rare).

---

## 5. Differentiators nobody in the class has (the flag to plant)

1. **In-harness, local, per-task cost/capability router with receipts.** Goose is
   coarse two-tier; everyone else routes via hosted gateways or proxy hacks. Only
   glamfire treats the route decision as a logged, explainable, verifiable step
   with a savings report. Extend it, benchmark it, make it the headline.
2. **Hard budget enforcement.** `--max-usd` that genuinely stops mid-run + honest
   partial cost is shipped by *no one* — not opencode, not Codex, not Goose. In a
   class whose #1 user complaint is token burn, this is criminally under-marketed.
3. **Audit-grade spend + decision ledger for teams.** Every run: model, provider,
   tokens, USD, escalation split, route rationale — in a file the team owns. The
   class's "team story" is SSO and dashboards on someone's gateway. glamfire can be
   the **agent spend-control and audit layer**: per-seat budgets, distribution
   reports ("your last 100 tasks: 84 center → $X saved"), receipts per run.
4. **Memory portability as a tested invariant.** OpenClaw proved users *love*
   owned file memory and proved the security cost of doing it carelessly. Kilo's
   Memory Bank is markdown convention. Nobody ships a structured, provenance-
   bearing, export/import-round-trip-*tested* store. Wire it into the loop and
   ship `glam brain export` as the "walk out with your brain" demo.
5. **Conformance-tested model swapping.** "A model is supported when the suite is
   green" is a governance idea no competitor has; it converts the Lindy-style
   harness-rewrite pain into a config change. Publish the suite results per
   adapter as a public compatibility matrix.
6. **Continuity/fire-drill as product.** After the 18-day frontier outage, provider
   failover is a live enterprise fear. No harness sells tested failover. glamfire
   already documents the drill; automate and verify it (`glam drill`).
7. **A provable security posture.** Least-privilege defaults, no-shell exec,
   deny-by-default, secrets-as-references — vs. OpenClaw's 42k exposed instances
   and poisoned skills registry. Publish a threat-model doc and a signed-skills
   policy *before* growing a skills ecosystem.

---

## 6. Ranked top-20 improvement backlog (impact × effort)

1. **[product] Interactive `glam` session (TUI/REPL with streaming, approvals, resume)** — the single blocker between "demo" and "daily driver."
2. **[product] MCP client support** (stdio + HTTP servers as engine tools through the permission gate) — unlocks the entire MCP ecosystem in one feature.
3. **[product] Wire `@glamfire/brain` into the `glam run` loop** (retrieval → context packing → episode capture) — the headline claim must be live, and retrieval-hit quality already feeds the router's signals.
4. **[product] Router-as-proxy mode** — an OpenAI/Anthropic-compatible local endpoint so Claude Code/opencode/Codex/Cursor users put glamfire's router+budget+ledger *under their existing agent*; the Trojan-horse wedge that rides the leaders' installed base (claude-code-router proves demand; glamfire does it conformance-tested).
5. **[distribution] Publish the receipts benchmark**: same real task set run always-frontier vs glamfire-routed (and vs opencode default) — equal-quality-at-X%-cost table, reproducible script, then submit a Terminal-Bench 2.1 entry.
6. **[distribution] Show HN launch** timed with #5, positioned as "the agent with a hard budget stop and a local router — receipts inside," not "another coding agent."
7. **[product] AGENTS.md ingestion + `glam init`** — cheap, expected, signals class citizenship.
8. **[product] Checkpoints/undo** (git-snapshot based, `/undo`, restore-by-hash à la Kilo) — the trust feature reviewers now check for.
9. **[product] Local/OpenAI-compatible adapter (Ollama, vLLM, LM Studio)** through the same conformance suite — the OSS crowd's litmus test and the "fully private" story.
10. **[product] Session persistence + `--continue`/`--resume`** on the run log (already replayable by design).
11. **[product] Sub-agents with per-subagent routing** — match the class's agent-teams moment and beat it: the router assigns each teammate the cheapest capable model automatically.
12. **[product] Live-verify Anthropic + Together adapters** (obtain keys) — kills the biggest honesty caveat and makes the cheap→frontier cascade demonstrably real.
13. **[community] Seed 20+ genuinely-scoped good-first-issues, open Discussions/Discord, and answer within 24h** — 26 issues and 0 stars means the funnel is unlit.
14. **[distribution] Weekly release-notes blog + 60-second asciinema in the README** (budget-stop demo is the money shot) — momentum is the metric star-watchers read.
15. **[product] ACP support** — Zed + JetBrains presence for the cost of one protocol server; register in the ACP registry.
16. **[docs] Comparison + integration pages engineered for LLM search (GEO)**: "glamfire vs opencode/Goose/LiteLLM," "hard budget for Claude Code," "route Claude Code to GLM" — the class gets discovered via "best X" queries answered by chatbots.
17. **[product] `glam drill` — automated provider-failover fire drill** with a pass/fail report; sell continuity as a tested feature.
18. **[product] Image input** (vision-capable candidates already declared; router filters by capability) — drag-drop/`--image` on run.
19. **[product] Published security model + signed skills policy** (threat doc contrasting the OpenClaw crisis; OS-level exec sandbox on the roadmap) — the enterprise cohort is actively shopping on this.
20. **[community] Get listed everywhere the class is compared**: awesome-cli-coding-agents, models.dev, ACP registry, tool directories, Terminal-Bench leaderboard, OpenRouter apps page — zero-cost surface area.

Deliberately **not** on the list: a hosted gateway (Zen-clone) — it would contradict
the no-middleman thesis that is glamfire's sharpest contrast; a full custom IDE
extension (ACP is 80% of the value at 20% of the cost); a skills marketplace before
the signing/verification story exists (OpenClaw shows the failure mode).

---

## 7. Honest assessment — what #1 actually takes

**#1 in stars in the broad class is not a realistic 12-month goal.** opencode has
~178k stars, 8M monthly devs, 900+ contributors and a funded company behind it;
OpenClaw has 375k. glamfire has 0 stars today. No project in this class closed that
gap by feature parity — the leaders' growth came from *moments* (Anthropic
crackdown, OpenClaw virality) multiplied by *readiness* (polished install, obvious
wedge, credible authorship).

**#1 in a defensible class is achievable: "the open agent cost-control harness" —
local per-task routing, hard budgets, audit ledger, portable memory.** No project
owns it; the router-proxy adjacents (claude-code-router, NadirClaw, LiteLLM) prove
demand but are proxies without a harness, budgets without receipts, or gateways
without ownership. Concretely, being #1 there means:

- **Daily-driver floor first** (items 1–3, 7–10): without an interactive session,
  MCP, and live memory, glamfire cannot be anyone's primary tool, and star growth
  from real usage never starts.
- **The wedge is parasitic before it is primary** (item 4): the fastest route to
  installs is *under* the agents people already use — "keep Claude Code, put a
  meter, a router, and a ledger under it." Every proxy user is a future full-harness
  user, and the ledger's savings report is self-propagating marketing.
- **Receipts are the growth engine** (items 5–6, 14, 16): this class trusts
  reproducible numbers (Aider's leaderboard, Terminal-Bench). "Same Terminal-Bench
  score at 22% of the cost, here's the script" is a front-page claim; adjectives
  are not.
- **Be ready for the next outrage.** The single biggest star events in class
  history were lock-in and outage news. glamfire's continuity/fire-drill/ownership
  story must be launched, documented, and one `npm i -g` away *before* the next
  frontier crackdown — then spend that day in the thread.
- **Community is currently zero and compounding starts late.** Stars follow
  contributors follow answered issues. The 24-hour-response, good-first-issue,
  weekly-changelog discipline (items 13–14, 20) is boring and non-optional.

**Realistic trajectory if the backlog lands:** thousands of stars within months of
a well-timed launch (pi did 50k in ~5 months on credibility + a sharp thesis;
glamfire's thesis is at least as sharp), with the durable position being *the*
routing/budget/audit layer the rest of the class eventually needs — either adopted
directly or so clearly ahead that being copied (Goose #4036-style consolidation,
a future opencode local router) still leaves glamfire the reference implementation.
The stone that must not be left unturned is not a feature — it is **existence in
public**: benchmark receipts, launch, cadence, and answers.

---

## Key takeaways for glamfire

- **The class exploded and reshuffled**: opencode (~178k★, 8M devs) is the
  dominant daily driver; OpenClaw (375k★) and Hermes (171k★) own the personal-agent
  wave; pi (54k★) proved minimal-harness credibility-marketing; Gemini CLI (104k★)
  and Roo Code died — churn is survivable and exploitable.
- **Routing is no longer virgin white space** — hosted gateways and router proxies
  are everywhere; the *remaining* white space is exactly glamfire's build:
  in-harness, local, explainable, conformance-tested routing with budgets and
  receipts, no middleman.
- **Table-stakes debt is real**: interactive session, MCP, AGENTS.md, checkpoints,
  sessions, local models, sub-agents, image input. Without roughly items 1–10 of
  the backlog, glamfire cannot convert a single reader into a daily user.
- **glamfire's unfair advantages are budget-stop, ledger, route receipts, tested
  memory portability, conformance gating, and honesty docs — all unmarketed.**
  The benchmark receipts table + Show HN + router-proxy mode is the shortest path
  from 0 stars to relevance.
- **Security is the class's open wound** (OpenClaw crisis: CVE 8.8, 42k exposed
  instances, 20% poisoned skills registry). glamfire's least-privilege posture is
  a differentiator only if published as a threat model and kept ahead of any
  skills-ecosystem growth.
- **#1 is a category claim, not a star count**: own "the open agent cost-control
  harness," ride the incumbents via proxy mode, and be launch-ready for the next
  lock-in/outage news cycle — those events, not features, minted every leader in
  this class.

---

## Sources

- glamfire repo (stars/issues/release) — <https://github.com/glamworks/glamfire>
- OpenCode developer guide (160k★, features) — <https://www.developersdigest.tech/blog/opencode-developer-guide-2026>
- OpenCode repo — <https://github.com/anomalyco/opencode/>
- OpenCode docs (TUI, Zen, agents, MCP, ACP, undo, enterprise) — <https://opencode.ai/docs/>
- OpenCode Zen — <https://opencode.ai/docs/zen/>
- OpenCode enterprise — <https://opencode.ai/docs/enterprise/>
- OpenCode growth: January surge / Anthropic crackdown — <https://medium.com/@milesk_33/opencodes-january-surge-what-sparked-18-000-new-github-stars-in-two-weeks-7d904cd26844>
- OpenCode has more developers than Claude Code — <https://medium.com/ai-analytics-diaries/opencode-has-more-developers-than-claude-code-now-nobody-saw-it-coming-86c4598e04db>
- OpenCode 8M users, one year — <https://awesomeagents.ai/news/opencode-8m-users-one-year/>
- OpenCode zero-to-titan in eight months — <https://ai.sulat.com/how-opencode-went-from-zero-to-titan-in-eight-months-dcdcd8ff5572>
- Agent teams ported to OpenCode — <https://dev.to/uenyioha/porting-claude-codes-agent-teams-to-opencode-4hol>
- Best open source CLI coding agents 2026 (Pinggy: stars, Gemini CLI retirement, Roo archive) — <https://pinggy.io/blog/best_open_source_cli_coding_agents/>
- Every AI coding CLI in 2026 (30+ tools) — <https://dev.to/soulentheo/every-ai-coding-cli-in-2026-the-complete-map-30-tools-compared-4gob>
- awesome-cli-coding-agents directory — <https://github.com/bradAGI/awesome-cli-coding-agents>
- Pi minimal harness (byteiota) — <https://byteiota.com/pi-coding-agent-minimal-harness/>
- Armin Ronacher on Pi — <https://lucumr.pocoo.org/2026/1/31/pi/>
- Pragmatic Engineer: Building Pi — <https://newsletter.pragmaticengineer.com/p/building-pi-and-what-makes-self-modifying>
- Syntax #976: Pi harness — <https://syntax.fm/show/976/pi-the-ai-harness-that-powers-openclaw-w-armin-ronacher-and-mario-zechner/transcript>
- OpenClaw vs Hermes stars/usage — <https://dev.to/rosgluk/openclaw-vs-hermes-agent-stars-downloads-usage-2026-b07>
- OpenClaw viral anatomy — <https://allthingsopen.org/articles/openclaw-viral-open-source-ai-agent-architecture>
- OpenClaw security crisis (Conscia) — <https://conscia.com/blog/the-openclaw-security-crisis/>
- OpenClaw exposed instances (Bitsight) — <https://www.bitsight.com/blog/openclaw-ai-security-risks-exposed-instances>
- OpenClaw vulnerabilities (Infosecurity) — <https://www.infosecurity-magazine.com/news/researchers-six-new-openclaw/>
- OpenClaw malicious skills (CyberDesserts/Snyk ToxicSkills) — <https://blog.cyberdesserts.com/openclaw-malicious-skills-security/>
- Goose → AAIF — <https://goose-docs.ai/blog/2026/04/07/goose-moves-to-aaif/>
- AAIF formation (Linux Foundation: MCP, goose, AGENTS.md) — <https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation>
- Goose repo — <https://github.com/aaif-goose/goose>
- Aider status/stars — <https://grokipedia.com/page/Aider>; maintainer-continuity issue — <https://github.com/Aider-AI/aider/issues/4613>
- Kilo Code weekly shipping blog (CLI, YOLO mode) — <https://blog.kilo.ai/p/this-week-in-kilo-code-cli-upgrades>
- Kilo checkpoints — <https://kilo.ai/docs/code-with-ai/features/checkpoints>
- Kilo vs Cline (shared Memory Bank) — <https://kilo.ai/cline>
- Cline Memory Bank — <https://docs.cline.bot/features/memory-bank>
- RouteLLM — <https://github.com/lm-sys/RouteLLM>
- claude-code-router guide — <https://www.morphllm.com/claude-code-router>
- NadirClaw (open router, 40–70% savings) — <https://github.com/NadirRouter/NadirClaw>
- LiteLLM router (51k★) — <https://www.gingerlabs.ai/blog/litellm-router-setup-guide>
- Terminal-Bench 2.1 leaderboard — <https://codingfleet.com/blog/terminal-bench-leaderboard-2026/>; <https://llm-stats.com/benchmarks/terminal-bench>
- ACP explained — <https://blog.marcnuri.com/agent-client-protocol-acp-introduction>
- Agent interoperability protocols 2026 (MCP/A2A/ACP, ACP registry) — <https://zylos.ai/research/2026-03-26-agent-interoperability-protocols-mcp-a2a-acp-convergence/>
- OpenRouter × OpenCode integration — <https://openrouter.ai/docs/cookbook/coding-agents/opencode-integration>
