<div align="center">

<img src="glamworks-logo.png" alt="glamfire" width="160" />

# glamfire

### The open harness for the last mile of AI.

**Own your context. Route your intelligence. Never rent your brain back.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-foundation-orange.svg)](#current-reality)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-informational.svg)](#install)
[![Default model](https://img.shields.io/badge/default-GLM%205.2%20on%20Fireworks-ff5a1f.svg)](#why-glm-52--fireworks)

[Spec](SPEC.md) · [Quickstart](docs/QUICKSTART.md) · [Architecture](docs/ARCHITECTURE.md) · [Mission](docs/MISSION.md) · [Why we win](docs/WHY-WE-WIN.md) · [Current reality](#current-reality) · [Contribute](CONTRIBUTING.md) · [Site](https://glamworks.github.io)

</div>

---

## The 98% problem

Intelligence just got about **98% cheaper**. Open models like **GLM 5.2** now match or
beat the frontier on the *broad middle of everyday work* — the brochure site, the
standard deck, the first‑pass copy, the routine synthesis, the familiar coding task.
Faster. Cheaper. Free to self‑host.

So why is almost nobody switching?

Because a model is a **brain in a jar**. What your company actually runs is the *work
system* around it — the **harness** and its **last mile**:

- the **context** the model sees (memory, retrieval, your team's hard‑won knowledge),
- the **routing** that picks the right model for each task,
- the **tool calls**, shaped to each model family's own grammar,
- the **system prompts**, tuned to one lab's quirks,
- the **surfaces** — CLI, chat, IDE — where work happens.

Switching models means rebuilding all of it. The talent that can do that is scarce and
expensive, so companies sign a frontier contract instead. And the frontier labs are
racing to put their assistant *inside your team chat* — quietly absorbing the messy
context that **is** your edge, until you're renting your own brain back from them
forever, with no way to rip it out.

**glamfire is the open, self‑owned harness that closes the last mile.** Keep your
context in your hands. Route every task to the cheapest model that can actually do it.
Run one work system across any model family. Make cheap intelligence *usable* without
handing your context to anyone.

> If you can build a harness, this is the opening of the decade. glamfire is that
> harness, in the open, for everyone.

---

## What glamfire is

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
- **adapters** — a **tested harness per model family** (GLM 5.2/Fireworks, Anthropic,
  OpenAI, local vLLM). Each turns a raw model into a *working agent* — no brain in a jar.
- **team** — a self‑hosted team surface (Slack/Discord/HTTP). The open answer to renting
  your team's context to a lab: the knowledge stays in **your** store.
- **surfaces** — the `glam` CLI, an SDK, and a server/daemon mode.

See **[SPEC.md](SPEC.md)** for the full specification.

---

## Why GLM 5.2 + Fireworks

GLM 5.2 is a ~744B‑total / 40B‑active MoE with a 1M‑token context, native
OpenAI‑compatible tool calling, and top‑tier results on design and real‑world coding —
at roughly a fifth of frontier cost. It is, for the **center of distribution**, one of
the best models in the world. **Fireworks AI** serves it on an OpenAI‑compatible API
with prompt caching, batch tiers, and on‑demand GPUs.

That combination — excellent, cheap, open, easy to serve — is the default workhorse
glamfire routes to. Everything else escalates only when it has to.

---

## Install

> **Heads‑up:** glamfire is at the **foundation** stage. The pieces below describe the
> shipping surface; see **[Current reality](#current-reality)** for exactly what runs
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
> [`glamfire`](https://www.npmjs.com/package/glamfire) npm package (latest: `0.2.4`) is
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
- **Cross‑platform installability without cloning** (SPEC §7), **built and verified
  end‑to‑end**: the `glam` CLI bundles to a self‑contained **`glamfire` npm package**
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
- **Four tested adapters** behind one conformance suite: **`fireworks-glm`** (GLM 5.2/FP8,
  the default), **`anthropic`** (Claude Messages API — edge/escalation candidate), and
  **`together`** serving **GLM 5.2** *and* **Qwen3‑Coder‑Next** — all built on a shared
  OpenAI‑compatible core (system shaping, native tool calling, SSE tool‑call fragment
  reassembly, per‑model pricing/capabilities). The same **conformance battery** runs against
  every adapter/model (a model is "supported" only when it's green). Honesty caveat: Together
  serves GLM‑5.2 at **FP4** (a real downgrade vs Fireworks **FP8**) and Qwen3‑Coder‑Next via a
  *dedicated* endpoint — see [`research/23`](research/23-second-model-and-provider.md). **`fireworks-glm`
  is live‑verified** (see *Works today* above); the other two are verified against real captured
  wire fixtures with their **live calls pending each provider's key** (`ANTHROPIC_API_KEY` /
  `TOGETHER_API_KEY`). The router's cross‑provider escalation (cheap GLM/Qwen → frontier Claude)
  is real, wired, and cost‑compared today.
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
