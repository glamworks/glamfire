<div align="center">

<img src="glamworks-logo.png" alt="glamfire" width="160" />

# glamfire

### The open harness for the last mile of AI.

**Own your context. Route your intelligence. Never rent your brain back.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-foundation-orange.svg)](#current-reality)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-informational.svg)](#install)
[![Default model](https://img.shields.io/badge/default-GLM%205.2%20on%20Fireworks-ff5a1f.svg)](#why-glm-52--fireworks)

[Spec](SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Mission](docs/MISSION.md) · [Why we win](docs/WHY-WE-WIN.md) · [Current reality](#current-reality) · [Contribute](CONTRIBUTING.md) · [Site](https://glamworks.github.io)

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

```bash
# Today (foundation): run the CLI from source
git clone https://github.com/glamworks/glamfire.git
cd glamfire
node packages/cli/src/index.mjs --version
node packages/cli/src/index.mjs doctor
```

Planned install paths (per [SPEC §7](SPEC.md#7-cross-platform--distribution)):
single‑file `glam` binaries for **macOS, Windows, Linux**, an npm package, a Homebrew
tap, Scoop/winget, and a Docker image for the team/server profiles.

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
- A passing **smoke test** that drives the real CLI the way a human would.
- A complete **[SPEC.md](SPEC.md)** and **22‑dimension research base** in [`research/`](research/).

**Built, one step from DONE** (all gates green; the only unverified step is the live call)
- **`glam run`** + **`@glamfire/engine`** (plan→act→observe loop, real tool dispatch,
  least‑privilege permission gate, hard token/cost budget) + **`fireworks-glm` adapter**
  (OpenAI‑compatible Fireworks transport, streaming tool‑call fragment reassembly,
  pricing). The whole vertical is built and tested against **real captured GLM wire
  fixtures** and driven through the actual binary over a loopback transport. The **live
  GLM 5.2 round‑trip is pending a `FIREWORKS_API_KEY`** for human‑standard verification —
  we do not mark it DONE until a real Fireworks call is observed. No part of the path is
  faked.

**Specified, in active build** (lock‑step, no shims — see [SPEC](SPEC.md))
- router (center/edge) · skills · team harness · layered config · packaging.

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
