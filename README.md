<div align="center">

<img src="glamworks-logo.png" alt="glamfire" width="160" />

# glamfire

### The open harness for the context wars.

**Own your context. Route your intelligence. Never rent your brain back.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-shipping-brightgreen.svg)](#current-reality)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-informational.svg)](#install)
[![Default model](https://img.shields.io/badge/default-GLM%205.2%20on%20Fireworks-ff5a1f.svg)](#the-workhorse-glm-52--fireworks)

[Spec](SPEC.md) · [Quickstart](docs/QUICKSTART.md) · [Architecture](docs/ARCHITECTURE.md) · [Mission](docs/MISSION.md) · [Why we win](docs/WHY-WE-WIN.md) · [Current reality](#current-reality) · [Contribute](CONTRIBUTING.md) · [Site](https://glamworks.github.io)

</div>

---

## The intelligence wars are over. The context wars have begun.

Intelligence got roughly **98% cheaper**. Open models like **GLM 5.2** don't just keep
up on the broad middle of everyday work — the routine coding task, the standard deck,
the first‑pass copy, the familiar synthesis — they lead it, rented by the token on
Fireworks‑class serverless GPUs at a fraction of frontier cost. The next useful AI
product is not the one that wins a benchmark. It's the one that knows where your work
is, what it's allowed to see, and what it's allowed to do.

So why is almost nobody switching? Because a model is a **brain in a jar**. What your
company actually runs is the *work system* around it — the **harness**:

- the **context** the model sees (memory, retrieval, your team's hard‑won knowledge),
- the **routing** that picks the right model for each task,
- the **tool calls**, shaped to each model family's own grammar,
- the **system prompts**, tuned to one lab's quirks,
- the **surfaces** — CLI, chat, IDE — where work happens.

Switching models means rebuilding all of it. The talent that can do that is the
scarcest resource in AI — so companies sign a frontier contract instead.

And the labs know it. The new fight isn't over model quality — it's over **who sits
closest to your context**. Frontier assistants are moving *inside your team chat*,
quietly absorbing the messy, uncodified knowledge that is your actual edge. Once a
vendor's model is that close to your context, it doesn't matter how cheap open models
get — you can't rip it out. Companies spent decades learning that data is their alpha,
and are now handing it to a model vendor as context. That's the failure mode:
**renting your company's brain back from a frontier lab, forever.**

There is also a newer, harder lesson: **continuity**. 2026 has already shown that the
model you build on can be forced offline for weeks, restricted to approved partners,
or repriced overnight. The teams that shrugged were the ones that never tied their
work to a single model — they owned their harness, routed elsewhere, and kept moving.

**glamfire is the open, self‑owned harness for exactly this moment.** Keep your
context in your hands — local‑first, exportable, tested. Route every task to the
cheapest model that can actually do it; make the frontier *earn* its escalations. Run
one work system across any model family, so no outage, ban, or price hike can stall
your work — and **model choice never becomes work**.

> The last mile of AI is a trillion-dollar problem, and the talent to build it is the
> scarcest resource in AI. glamfire is that harness — in the open, for everyone.

---

## What is this, concretely?

glamfire is a **command-line agent you point at real work**:

```bash
glam run "read this repo and write a CHANGELOG.md from the git history" --max-usd 0.05
```

Same shape of tool as Claude Code or opencode: it plans, calls real tools (read/write/edit
files, search code, read git, run allowed commands), observes the results, iterates, and
stops when the work is done — or when its budget is hit. glamfire authored its own
`CHANGELOG.md` this way — the PR merged with human review as the gate — and a faithful
re-run of that task costs about two cents.

The difference is everything wrapped around that loop:

1. **It picks the model per task, not per subscription.** The router scores each task
   center‑vs‑edge and sends it to the **cheapest model that can actually do it** — open
   weights for the routine 80%; frontier escalation is one routing rule away (bring an
   Anthropic key, the cascade is wired and tested). `glam route "<task>"` shows you the
   decision, offline, before any money moves.
2. **It bills like a meter, not a faith commitment.** `--max-usd` is a hard ceiling that
   genuinely stops a run mid‑task (checked every turn, honest partial cost on interrupt).
   Every run lands in a local ledger — `glam usage` shows spend by day, model, provider,
   with monthly budget warnings.
3. **What it knows about you lives in files you own.** Your config, your usage ledger,
   and your model cache are plain files on your disk. The context store (open brain —
   SQLite + vectors, exportable to human‑readable JSONL and back, bit‑exact, tested) is
   built and gated the same way; wiring it into `glam run`'s loop is in build, and it
   will never live anywhere but your disk. (The **context** is local. The
   **intelligence** is deliberately not — see the next section.)
4. **Models are swappable parts.** Each model family gets a conformance‑tested adapter —
   the per‑model tuning that normally makes migration a rewrite is done once, in the open,
   gated by tests. Adding DeepSeek V4 to your routing is one candidate line in a routing
   rule, not a migration.
5. **It watches the market so you don't.** `glam models` is a catalog of top open‑weight
   models across respected US hosts — real prices, every one dated and sourced;
   `--refresh` pulls whatever providers actually publish machine‑readably (Together
   prices with a key; Fireworks availability — it publishes no machine prices, and the
   command says so instead of faking freshness) and calls out every drop it can prove.

### First and foremost: Claude Code users and teams

**You do not need to leave Claude Code — or your Anthropic subscription.** Use Claude
Code exactly as you do now — with Claude, with GLM 5.2 on Fireworks AI, or with another
model — and glamfire's job is to put **memory, knowledge, and usage‑and‑billing
visibility around it**, in files you own. And the door swings both ways: walk away
from Claude Code any time in the future, and your memories and knowledge are already
up to date in glamfire — no export ceremony, no lock‑in cliff.

That is the destination. Here is where each piece stands today — nothing below claims
to work before it does:

- **The owned memory/knowledge store — shipping now.** `@glamfire/brain` works
  end‑to‑end: local SQLite + vectors on your disk, hybrid retrieval, and a tested
  export→import round‑trip (human‑readable JSONL, bit‑exact). See
  [Current reality](#current-reality).
- **Usage & billing visibility — shipping now for `glam run`.** Every run lands in a
  local ledger you own (`~/.glam/usage.jsonl`); `glam usage` breaks spend down by
  day/model/provider, with monthly budget warnings — offline, no key.
- **Wrapping Claude Code itself — the direction, not shipped.** Feeding that store and
  ledger live from your Claude Code sessions is where this goes; today nothing hooks
  into Claude Code automatically.
- **Teams — specified, in active build.** Shared team memories (scoped by design so
  personal data never enters the shared store), team usage + billing across all
  providers — subscriptions *and* pay‑as‑you‑go API — and audit logs: which
  model/provider handled every task, what code changed, what commits, which projects.

glamfire targets **long‑horizon tasks and teams** — work that outlasts one session,
one subscription, and one model.

### Why now — the two advancements underneath

glamfire defaults to **GLM 5.2 on Fireworks AI**, but neither is the point. They are
stand‑ins for two shifts that just changed what "adopting AI" means:

- **Open weights hit frontier class.** GLM 5.2, DeepSeek V4, Kimi K2.7, Qwen3‑Coder —
  MIT/Apache‑licensed, benchmark‑proven at the center of real work. The winner changes
  monthly; the *fact* of frontier‑class open weights doesn't.
- **Respected on‑demand inference got cheap.** Fireworks, Together, and peers rent those
  models by the token — FP8, US‑hosted, no contract, prices decaying in weeks.

Put together: **intelligence is now a commodity market.** What nobody hands you is the
buyer's side of that market — the work system that exploits interchangeable suppliers
instead of marrying one. That's glamfire: routing, metering, owned context, and tested
switching, as one open Apache‑2.0 harness.

glamfire is **opinionated about the split**: your *context* lives on your disk; your
*inference* is rented on demand from trusted clouds — the fire in the name is
**Fireworks‑class serverless GPUs**, not your laptop. Most teams don't own AI inference
hardware and shouldn't need to: a frontier‑class open model is a 400B–1.6T‑parameter
MoE, and renting it FP8 by the token costs cents. Self‑hosting via vLLM is a supported
escape hatch for the teams that genuinely need it — not the default, and never a
prerequisite. **Local‑first describes your data, not your GPUs.**

### Where it fits (tools you may already use)

| You use | It is | glamfire, next to it |
|---|---|---|
| **Claude Code** | the best frontier coding agent | Keep it for the hard edge. glamfire routes the routine center of your workload to open models at a third to a fiftieth of frontier list price (GLM 5.2 vs Sonnet ≈ ⅓; DeepSeek V4 Flash vs Opus ≈ 1/50), with frontier as an **earned escalation** — plus a **hard per‑run budget stop no frontier‑lab agent ships**, and a spend ledger that lives in a file you own. |
| **opencode & other OSS agents** | configurable agent CLIs | There you (or your agent config) assign models to agents and switch by hand. glamfire decides **per task, automatically** — price × capability × calibrated confidence, with escalation the cheap model must fail to trigger — and family switching is conformance‑tested, not vibes. |
| **Ollama / vLLM** | run open weights yourself | A model server is not a work system. glamfire is the loop + routing + ledger **on top of your server, today**: the `local` adapter drives any OpenAI‑compatible endpoint (Ollama, vLLM, SGLang, LM Studio, DwarfStar/DS4) at **$0/token**, live‑verified against a real Ollama daemon — with hosted models one routing rule away when the task outgrows your hardware. |
| **OpenRouter** | one key, 400+ models, auto‑router | A hosted middleman: even its auto‑router picks a model **per prompt**, and every request — plus your spend metadata — transits their gateway. glamfire goes **direct to providers you choose**, routes whole tasks, and keeps the loop, context store, budgets, and ledger on your disk. |
| **A single open model (Hermes, GLM, DeepSeek…)** | a frontier‑class brain, free | A brain in a jar. glamfire is the jar‑opener: the harness that turns raw weights into a working, budgeted, tool‑using agent — and lets you swap the brain later. |
| **Goose** | model‑agnostic OSS agent (AAIF‑stewarded) | Closest cousin, honestly — it ships config‑driven multi‑model (lead/worker, planner/executor). glamfire's wedge: routing **each task** automatically by price × capability × confidence with earned escalation, an owned portable context layer **guaranteed by test**, and per‑model conformance gates. |

### Five things to do with it this week

1. **Halve your coding‑agent bill without firing Claude.** Send the routine work —
   changelogs, dep bumps, repo explanations, first‑pass docs — through `glam run` at open‑model
   prices; keep your frontier subscription for the tasks that deserve it. The ledger shows
   what you actually saved.
2. **Put a real ceiling on an agent.** `glam run "…" --max-usd 0.10` stops mid‑run when
   the meter hits the cap — not a warning, a stop. Ctrl‑C aborts the in‑flight request and
   prints the honest partial cost.
3. **Meter a team.** Every run is a line in `~/.glam/usage.jsonl`. `glam usage` breaks
   spend down by day/model/provider; set `[usage] monthlyBudgetUsd` and get warned at 80%.
4. **Read the market in one command.** `glam models --sort price` — the current open‑weight
   landscape with real prices and dates; `--refresh` diffs live provider prices and flags drops.
5. **Fire‑drill your continuity.** Add a routing rule that prefers DeepSeek V4 (wired and
   live‑verified today; Kimi is in the catalog with its adapter pending), and prove to
   yourself the same task completes when your primary provider is down. 2026 already
   showed frontier access can vanish for weeks — the teams that shrugged owned their routing.

---

## What glamfire is (the architecture)

A **model‑agnostic, agent‑agnostic harness**, built as a TypeScript monorepo. Three
load‑bearing subsystems:

| Subsystem | a.k.a. | What it does |
|---|---|---|
| **engine** | *open engine* | The agent loop: plan → act → observe, tool dispatch, permissions, sandboxing, streaming. |
| **brain** | *open brain* | Your context, **local‑first and portable** — owned, exportable, never uploaded, never rented back. |
| **skills** | *open skills* | Portable capability packs that travel across models unchanged. |

…wired together by:

- **router** — scores each task **center ↔ edge** of distribution and sends it to the
  cheapest capable model, escalating to the frontier only when confidence is low.
- **adapters** — a **tested harness per model family** (GLM 5.2/Fireworks, Together,
  Anthropic, and any local OpenAI‑compatible server: Ollama, vLLM, LM Studio,
  DwarfStar/DS4). Each turns a raw model into a *working agent* — no brain in a jar.
- **team** — a self‑hosted team surface (Slack/Discord/HTTP). The open answer to renting
  your team's context to a lab: the knowledge stays in **your** store.
- **surfaces** — the `glam` CLI, an SDK, and a server/daemon mode.

One promise threads through all of it: **model choice must never become work.**
glamfire decides, shows you the decision (`glam route`, `glam models`), and lets you
overrule.

See **[SPEC.md](SPEC.md)** for the full specification.

---

## The workhorse: GLM 5.2 + Fireworks

GLM 5.2 (MIT license, ~753B MoE, 1M‑token context, native OpenAI‑compatible tool
calling) is the **#1‑ranked open‑weight model** on the Artificial Analysis Intelligence
Index and beats frontier flagships on real‑work benchmarks like SWE‑bench Pro — at
roughly a fifth to a sixth of frontier cost. That is not "good enough for the price."
It is **the best model in the world at the center of the distribution — which, by
definition, is most of your work.** **Fireworks AI** serves it FP8 on an
OpenAI‑compatible API with prompt caching, batch pricing, and on‑demand GPUs.

That combination — excellent, cheap, open, easy to serve — is glamfire's default
workhorse. Frontier models remain in the loop as **escalation candidates** for the
messy, novel edge of the distribution: they get a task only when the router's
confidence says the cheap model can't hold it. The frontier must *earn* its tokens.

The winners at each price tier change monthly — run **`glam models`** for the live
landscape ([research/25](research/25-provider-landscape-2026-07.md) has the July 2026
snapshot with cited prices). That churn is the point: the durable layer is the routing
and the owned context, not any one model — and that layer is what glamfire is.

---

## Install

> **Heads‑up:** see **[Current reality](#current-reality)** for exactly what runs
> today versus what is specified and in progress. We do not market vaporware.

The install paths below are **built and tested** — the `glam` CLI bundles to a
self‑contained npm package (no `workspace:*` deps, no native modules) and to single‑file
binaries for all five OS/arch targets via `bun build --compile`. The **publish** to the
registries is **wired in CI but gated on maintainer secrets** (see the note after the
commands), so the package‑manager one‑liners go live the moment those secrets are added.

```bash
# npm (any Node >= 22 user) — provides the `glam` command
npm install -g glamfire

# macOS / Linux — Homebrew tap
brew install glamworks/tap/glamfire

# Windows — Scoop
scoop bucket add glamworks https://github.com/glamworks/scoop-bucket
scoop install glamfire

# Windows — winget
winget install Glamworks.Glamfire

# Any OS — download the single-file binary for your platform from the GitHub Release
#   glam-darwin-arm64 · glam-darwin-x64 · glam-linux-x64 · glam-linux-arm64 · glam-windows-x64.exe
# then:  chmod +x glam-* && ./glam-<your-target> --version
```

```bash
# Or run the CLI straight from source (no packaging needed)
git clone https://github.com/glamworks/glamfire.git
cd glamfire && pnpm install && pnpm -r build
node packages/cli/src/index.mjs --version
```

> **What's live.** **All four package managers are wired and shipping.** The
> [`glamfire`](https://www.npmjs.com/package/glamfire) npm package (latest: `0.4.1`) is
> published — verified by installing from the public registry and running the installed
> `glam`; the [Homebrew tap](https://github.com/glamworks/homebrew-tap)
> (`Formula/glamfire.rb`) and [Scoop bucket](https://github.com/glamworks/scoop-bucket)
> (`bucket/glamfire.json`) are pushed on every `v*` tag; and **winget** is submitted to
> [microsoft/winget‑pkgs](https://github.com/microsoft/winget-pkgs) by `wingetcreate` on
> each release (the `winget install` line goes live once Microsoft's community review merges
> the PR — that step is theirs, not ours). Each tag also builds the checksums, the SBOM,
> sigstore signing, and a GitHub Release with all five single‑file binaries + the tarball
> attached ([releases](https://github.com/glamworks/glamfire/releases)). A Docker image for
> the team/server profiles is still specified, not yet built.

---

## Current reality

We state plainly what is real. (This section is the honesty contract; it updates with
every release.)

**Works today**
- `glam version` / `glam --version` — version in the product's output.
- `glam doctor` — checks the local environment (Node, provider key, install).
- `glam help` — usage.
- **`@glamfire/brain`** — the owned context store, **fully working end‑to‑end**:
  embedded SQLite + `sqlite-vec` + FTS5, four provenance‑bearing record types
  (Fact/Document/Episode/Pointer), hybrid retrieval (vector + keyword + recency +
  provenance) with token‑budget packing, and a **tested export→import ownership
  invariant** (your store round‑trips to human‑readable JSONL and back, bit‑exact).
  Default embedder is offline/zero‑key; an on‑device transformer backend is opt‑in.
- **`@glamfire/config`** — layered, typed, validated configuration (SPEC §6):
  defaults → `~/.glam/config.toml` → `./glam.toml` → env → flags, with per‑value
  provenance. **Secrets are references** (env/OS‑keychain), never inline, and **redacted**
  in all output. `glam config` shows the resolved config; invalid config **fails loudly**
  with an actionable message. Wired into `glam run`/`glam doctor` and the fireworks adapter.
- **`@glamfire/skills`** — portable, model‑agnostic capability packs (SPEC §5.5): a
  self‑contained skill directory (manifest + handlers + neutral instruction + example
  episodes + optional verifier) loads, validates, and **installs into the engine** as
  `{ system, tools }` for any model. Ships a working `code-explainer` example skill.
- **`@glamfire/router`** + **`glam route`** — center/edge, cost‑aware routing (SPEC §5.3),
  **fully working offline end‑to‑end**: a pure, feature‑based classifier scores each task
  **center ↔ edge** with a calibrated, *non‑verbalized* confidence (length, code‑ness,
  novelty, retrieval‑hit quality, historical outcomes); a declarative **policy engine**
  evaluates `routing.rules` top‑down (first match wins), filters candidates by
  adapter‑declared **capabilities** and projected **`maxUsd`**, and picks the **cheapest
  survivor**; an **escalation cascade** runs the cheap model, **verifies** (rubric /
  heuristic / pluggable), and **escalates** to the next‑stronger candidate on failure
  (real `escalation` step, budget‑bounded) — proven end‑to‑end through the **real engine
  loop**. `glam route "<prompt>"` prints the decision + a **distribution report** ($ saved
  vs always‑frontier) with **no API key and no provider call**; `glam run --explain` shows
  the live decision. Wired into the engine via a neutral `RouterHook`.
- **`glam models`** — the **evergreen model/provider landscape** (SPEC §5.3/§5.4):
  a built‑in, dated catalog of top open‑weight models across respected US‑hosted
  providers (Fireworks, Together, DeepInfra, Mistral) plus the Claude escalation tier
  and the **$0 self‑host venues** (Ollama/vLLM/LM Studio generic rows, DwarfStar‑DS4
  with its beta/Q2/hardware‑floor caveats, Ornith‑1.0 9B/35B),
  with **USD/1M prices, served quantization (FP8 vs FP4 caveats recorded per
  provider×model), context windows, capability tokens, license, `asOf` verification
  date, and source URL on every entry**. Filter with `--capable`, sort cheapest‑first
  with `--sort price`, get JSON with `--json` — all offline, no key. `glam models
  --refresh` pulls **current** data from provider model APIs (Together prices are
  machine‑readable; Fireworks exposes availability/context but **no machine‑readable
  prices — the command says so instead of faking freshness**), reports every price
  movement explicitly (`↓ was $X now $Y since <asOf>`), and caches the refreshed view
  under `~/.glam/cache/models.json` (used automatically when newer). **Single source
  of truth:** the adapters' pricing rows derive from this same catalog, so the
  router's cost decisions and the landscape view can never drift apart.
- **Packaging & install — built and verified end‑to‑end**: the `glam` CLI bundles to a self‑contained **`glamfire` npm package**
  (one file, no `workspace:*` deps, no native modules — `npm i -g` then run the
  installed binary, proven by packing the tarball, global‑installing it, and running
  `glam --version` + `glam route`), and to **single‑file binaries** for darwin‑arm64,
  darwin‑x64, linux‑x64, linux‑arm64, and windows‑x64 via `bun build --compile` (the
  host binary is compiled and actually run in the build + in CI). Ships **Homebrew /
  Scoop / winget** manifest templates (filled with version + SHA‑256 by
  `scripts/render-manifests.mjs`), a **CycloneDX SBOM**, and a `v*`‑tag **release
  workflow** that checksums, sigstore‑signs, and publishes — with every registry
  publish **gated on a maintainer secret** (no‑op until added). CI runs the full gates
  (build/typecheck/lint/test/smoke) on **macOS, Windows, Linux** and builds+runs the
  artifacts on macOS+Linux.
- **`glam run`** + **`@glamfire/engine`** — the agent loop **DONE and live‑verified
  against real GLM 5.2 on Fireworks**: plan→act→observe, real tool dispatch,
  least‑privilege permission gate, and a **hard token/cost budget that genuinely stops
  mid‑task** (each turn's output is capped by the remaining budget and any turn that
  crosses the ceiling reports `budget_exhausted`, not `done`). Sandboxed tools:
  `read_file`, **`list_files` (glob)** and **`search_files` (grep)** for code navigation,
  **read‑only git (`git_status`/`git_diff`/`git_log`/`git_show`)** for repo inspection
  (all cwd‑scoped, `read`‑permission, no shell, credential‑env stripped, injection‑guarded —
  write‑git stays out of the sandbox),
  `write_file`/`edit_file` (cwd‑scoped, symlink‑escape‑defended,
  `write`=ask→deny), and `run_command` (no‑shell, allowlisted, `exec`=**deny by default**,
  opt‑in via `--allow-exec`) — enough to close the dogfood read→edit→run loop; full
  network‑egress isolation needs an OS sandbox and is noted as a known limit. Paired with
  the **`fireworks-glm` adapter** (OpenAI‑compatible Fireworks transport, streaming
  tool‑call fragment reassembly, pricing). **Observed live**, real key, real call:
  `glam run "…compute (2 + 3) * 4…"` streams GLM‑5.2, dispatches the `calculator` tool,
  and answers `20` (`status: done`); a `--max-usd 0.001` ceiling truncates output and
  reports `budget_exhausted`. No part of the path is faked. **Live‑verified again** for
  code navigation: `glam run` drove `search_files` + `list_files` on this repo (both
  `[allow]`, no approval prompt) to locate a function's definition by `file:line`.
- **Dogfooding M0+M1 — PROVEN live** (glamfire building glamfire): `glam run` read the
  repo and proposed real gaps (M0), then **authored a doc closing a real good‑first‑issue**
  end‑to‑end (M1, [#11](https://github.com/glamworks/glamfire/issues/11)) — driven by GLM 5.2
  via `scripts/dogfood.mjs`, with a human review catching one defect and glamfire iterating
  to green. A **self‑hosting CI gate** runs glamfire‑on‑glamfire on every push (gated on the
  `FIREWORKS_API_KEY` repo secret; skips with a clear notice, never a fake pass). Commits
  authored by glamfire are tagged with the model id. See [`docs/DOGFOODING.md`](docs/DOGFOODING.md).
- **Monitoring, usage & billing** — **`glam usage`** + a local, owned **usage ledger**,
  live‑verified end‑to‑end: every real `glam run` appends one record (timestamp, model,
  provider, tokens incl. cached, USD cost, duration, status, goal hash, and — on an
  escalated run — **per‑model cost split** read off the step log) to
  `~/.glam/usage.jsonl` (append‑only JSONL: portable, greppable, its own export format,
  zero native deps). `glam usage` shows totals and **by‑day / by‑model / by‑provider**
  breakdowns with `--since` and `--json`, entirely **offline, no API key**. Opt‑in
  **budget alerting** via config `[usage] monthlyBudgetUsd` / `warnAtPct` (zod‑strict,
  fails loud): `glam run` warns when month‑to‑date spend crosses the threshold, and
  `glam usage` renders a budget bar. Alerting only — per‑run **hard** ceilings remain
  `[run.budget]`, enforced by the engine.
- A passing **smoke test** that drives the real CLI the way a human would.
- A complete **[SPEC.md](SPEC.md)** and **22‑dimension research base** in [`research/`](research/).

**Built, one step from DONE** (all gates green; the only unverified step is the live call)
- **Four tested adapters, eight model configs** behind one conformance suite:
  **`fireworks-glm`** serving **GLM 5.2** (FP8, the default workhorse), **DeepSeek‑V4‑Pro**
  (FP8, 1M ctx, $1.74/$3.48 — the open escalation tier), and **DeepSeek‑V4‑Flash** (FP8,
  1M ctx, $0.14/$0.28 — the cheapest capable long‑context model anywhere); **`anthropic`**
  (Claude Messages API — frontier escalation); and **`together`** serving **GLM 5.2**,
  **Qwen3‑Coder‑Next**, *and* **DeepSeek‑V4‑Pro**; and **`local`** — ANY
  OpenAI‑compatible self‑host server (Ollama, vLLM, SGLang, LM Studio, antirez's
  DwarfStar/DS4) at **$0/token**, with user‑declared capabilities/context (the router's
  capability floor), a `--local`/`localOnly` privacy mode that **fails loud** instead of
  silently falling back to a hosted provider, and **live verification against a real
  Ollama daemon** (qwen3:0.6b tool round‑trip through the real `glam run`; conformance
  fixtures captured from the live wire). The OpenAI‑compatible adapters share one
  core (system shaping, native tool calling, SSE tool‑call fragment reassembly, per‑model
  pricing/capabilities). The same **conformance battery** runs against every adapter/model
  (a model is "supported" only when it's green). Honesty caveats: Together serves GLM‑5.2 at
  **FP4** (a real downgrade vs Fireworks **FP8**), Qwen3‑Coder‑Next via a *dedicated*
  endpoint, and DeepSeek‑V4‑Pro at 512K ctx / higher price than Fireworks — see
  [`research/23`](research/23-second-model-and-provider.md) and
  [`research/25`](research/25-provider-landscape-2026-07.md). **`fireworks-glm` is
  live‑verified for all three of its models** (GLM 5.2 and both DeepSeeks: real streamed
  tool‑calling round‑trips + live‑captured conformance fixtures); the other two adapters are
  verified against real captured wire fixtures with their **live calls pending each
  provider's key** (`ANTHROPIC_API_KEY` / `TOGETHER_API_KEY`). The router's cross‑provider
  escalation (cheap GLM/DeepSeek/Qwen → frontier Claude) is real, wired, and cost‑compared
  today. (DeepSeek's first‑party API is cheaper still but China‑hosted — glamfire never
  routes there by default; point `providers.local`‑style config at it explicitly if your
  data policy allows.)
- **Cross‑platform install without cloning** (SPEC §7): a self‑contained **`glamfire`** npm
  package (`npm i -g glamfire` → `glam`), single‑file **binaries** for macOS/Windows/Linux
  (arm64+x64, checksummed, sigstore‑signed), and **Homebrew / Scoop / winget** manifests, all
  produced by a tag‑driven **release workflow** + an SBOM. Built and exercised (the packed npm
  install and the compiled binary both run real commands); **actual publishing is gated on
  maintainer secrets** (`NPM_TOKEN`, tap/bucket deploy keys) — see *Install* below.

**Specified, in active build** (lock‑step, no shims — see [SPEC](SPEC.md))
- Docker image for the team/server profiles · team harness · SDK. The *live* cheap→frontier
  cascade across providers awaits provider keys only.

If a capability is partial, the docs and this section say so. A feature is **DONE** only
when a real human end‑user can use it.

---

## Principles

- **You own your context** — local‑first, portable, exportable, rip‑out‑able.
- **Cheapest capable intelligence wins** — route the center cheap, escalate the edge.
- **One harness, every model** — tested adapters, no brain in a jar.
- **Full‑stack mini‑features, never shims** — breadth stays in lock‑step.
- **Verified by a human's standard** — DONE means really usable.
- **macOS, Windows, Linux as equals.**
- **Built with glamfire** — we dogfood our own harness.

---

## Contributing

The harness‑talent shortage is the whole opportunity — and an open invitation. If you
can reason about routing, context, tool‑calls, or model adapters, **we want you.**

- Read **[CONTRIBUTING.md](CONTRIBUTING.md)** and the **[Code of Conduct](CODE_OF_CONDUCT.md)**.
- Pick up a **[good first issue](https://github.com/glamworks/glamfire/labels/good%20first%20issue)**.
- Larger changes go through a lightweight **RFC** (see CONTRIBUTING).
- Governance is open and documented in **[GOVERNANCE.md](GOVERNANCE.md)**.

---

## License

[Apache‑2.0](LICENSE). Use it, fork it, build a business on it. Own your last mile.

<div align="center">
<sub>glamfire is a <a href="https://github.com/glamworks">glamworks</a> project · the open harness for the last mile of AI</sub>
</div>
