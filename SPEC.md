# glamfire — Specification

> The open harness for the last mile of AI.
> Own your context. Route your intelligence. Never rent your brain back.

This document specifies **what glamfire is**. It is a specification, not a plan: it
describes the product, its architecture, its contracts, and the behavior it
guarantees — not a sequence of milestones, phases, or a minimum viable cut. Every
section below describes the whole product at full fidelity. The orchestrator that
builds glamfire keeps the entire surface in lock‑step; no subsystem is "later."

---

## 1. Thesis

Intelligence got ~98% cheaper. Open models such as **GLM 5.2** are now, for the
broad middle of everyday knowledge work, *as good as or better than* the frontier —
faster, cheaper, and free to self‑host. And yet companies cannot switch.

The reason is not the model. A model is a brain in a jar. What companies actually
run is a **work system** wrapped around the model — the *harness* and its *last
mile*:

- the **context** the model is fed (memory, retrieval, team knowledge),
- the **routing** that decides which model handles which task,
- the **tool calls** the model is allowed to make and how they are shaped,
- the **system prompts** tuned to one model family's conventions,
- the **surfaces** (CLI, chat, IDE) where work actually happens.

Switching models means rebuilding that whole system, because each model family has
its own tool‑call grammar, its own memory ergonomics, its own prompt sensitivities.
The talent that can build a harness is scarce and expensive, so most companies sign
a frontier contract that "fits right into their existing workflows" instead.

Worse: frontier labs are racing to **own the last mile** themselves. When a frontier
assistant lives inside your team chat, it quietly absorbs the messy, uncodified
context that *is* your company's edge — and then you are renting your own brain back
from a lab, forever, at frontier prices, with no way to rip it out.

**glamfire is the open, self‑owned harness that closes the last mile.** It keeps your
context in your hands, routes each task to the cheapest model that can do it well,
and adapts a single work system across any model family — so cheap intelligence
becomes *usable* intelligence without surrendering your context to anyone.

The first‑class target is **GLM 5.2 served via Fireworks AI** (the cheap, excellent
workhorse for center‑of‑distribution work), with seamless escalation to frontier
models for the edge cases that genuinely need them.

---

## 2. The model of work: center vs. edge of distribution

glamfire treats every unit of work as sitting somewhere on a **distribution**:

- **Center‑of‑distribution tasks** — common shapes the world has done millions of
  times: a brochure site, a standard deck outline, first‑pass copy, routine
  synthesis, familiar coding patterns. Outputs a human can inspect quickly. Open
  models like GLM 5.2 are *excellent* here — often the best in the world,
  particularly where front‑end taste matters — at a fraction of frontier cost.
- **Edge‑of‑distribution tasks** — rare, novel, high‑stakes, weakly‑exampled work
  where frontier reasoning still earns its premium.

Most knowledge work, by definition, is center‑of‑distribution. The economic prize
is routing the center to cheap intelligence while reserving the frontier for the
edge — *without the team having to manually classify anything*.

glamfire makes the distribution **measurable** (every task is scored and logged) and
**actionable** (the router acts on the score). Teams stop guessing whether their
workload is center‑ or edge‑weighted; glamfire tells them, and bills them
accordingly.

---

## 3. Principles

1. **You own your context.** The context layer is local‑first, portable, and
   exportable. glamfire never makes your team's knowledge un‑rip‑out‑able. If you
   leave glamfire, you walk out with your brain.
2. **Model‑agnostic, agent‑agnostic.** Any model (GLM, Claude, GPT/Codex, Llama,
   local vLLM) behind one harness. Any surface (CLI, chat, IDE, SDK) over one
   engine. Swapping a model is a config change, not a rewrite.
3. **Cheapest capable intelligence wins.** The router defaults to the cheapest model
   that clears the quality bar for the task, and escalates only when confidence is
   low. Cost is a first‑class signal, never an afterthought.
4. **The harness is the product.** Models are commodities that get cheaper monthly.
   The durable value is context + routing + adapters + surfaces. glamfire invests
   there.
5. **No brain in a jar.** Every supported model ships with a tested adapter so it
   is a *working agent* out of the box, not raw token completion.
6. **Full‑stack mini‑features, never shims.** Every capability is real end‑to‑end —
   no mocks, no stubs, no "best‑effort" placeholders standing in for the real thing.
   Breadth stays in lock‑step; a narrow feature never races ahead of the framework.
7. **Verified by a human's standard.** A feature is DONE only when a real human
   end‑user can use it and it has been verified the way a human would verify it.
8. **Self‑hosting and dogfooding.** glamfire is built using glamfire. The transition
   from external coding agents to glamfire developing itself is a measured,
   verified, first‑class path — not an afterthought.
9. **Open and honest.** The docs state current reality plainly. We do not market
   vaporware. We advertise what is live.

---

## 4. System architecture

glamfire is a **TypeScript monorepo** of composable packages. Each package is a real
library with its own tests; the `glam` binary and the team harness are thin surfaces
over them. The three load‑bearing subsystems map to the founder's vocabulary:

- **open engine** → the agent execution loop (`@glamfire/engine`)
- **open brain** → owned context and memory (`@glamfire/brain`)
- **open skills** → portable capability packs (`@glamfire/skills`)

…joined by the router, the adapters, the team harness, and the surfaces.

```
                         ┌─────────────────────────────────────────────┐
   surfaces              │  glam CLI   │  team harness  │  SDK  │  IDE   │
                         └───────┬─────────────┬────────────┬──────┬────┘
                                 │             │            │      │
                         ┌───────▼─────────────▼────────────▼──────▼────┐
   open engine           │            @glamfire/engine                  │
   (agent loop)          │  plan→act→observe loop · tool dispatch ·     │
                         │  permissions · sandboxing · streaming        │
                         └───┬───────────┬───────────┬───────────┬──────┘
                             │           │           │           │
                  ┌──────────▼──┐  ┌─────▼──────┐ ┌──▼────────┐ ┌▼──────────┐
   subsystems     │ @gf/router  │  │ @gf/brain  │ │ @gf/skills│ │ @gf/      │
                  │ center/edge │  │ owned      │ │ portable  │ │ adapters  │
                  │ cost‑aware  │  │ context +  │ │ capability│ │ per‑model │
                  │ escalation  │  │ memory     │ │ packs     │ │ harnesses │
                  └─────────────┘  └────────────┘ └───────────┘ └─────┬─────┘
                                                                      │
                         ┌────────────────────────────────────────────▼─────┐
   intelligence          │ Fireworks (GLM 5.2 ·default)│ Anthropic │ OpenAI  │
                         │ local vLLM/SGLang │ OpenAI‑compatible endpoints    │
                         └──────────────────────────────────────────────────┘
```

Data flows are local‑first by default. Nothing about your context leaves your
machine or your infrastructure unless you configure a remote provider for *inference*
— and even then, only the prompt for that call crosses the wire, never the store.

---

## 5. Subsystem specifications

### 5.1 `@glamfire/engine` — the open engine (agent loop)

The execution core. Runs a deterministic, observable **plan → act → observe** loop
over a task, dispatching tool calls and streaming results.

- **Loop contract.** Given a `Task` (goal, inputs, constraints, budget), the engine
  produces a `Run` — an ordered, persisted sequence of `Step`s. Each step is one of:
  `model_turn`, `tool_call`, `tool_result`, `route_decision`, `escalation`,
  `verification`, `final`. Runs are fully replayable from their step log.
- **Tool dispatch.** Tools are declared once in a model‑neutral schema (JSON Schema
  for arguments + a handler). The active **adapter** translates the neutral schema
  into the target model's native tool‑call grammar and parses the model's tool calls
  back into neutral form. A tool defined once works on every model.
- **Permissions & sandbox.** Every tool call passes a permission gate
  (allow / ask / deny) and runs under a sandbox policy (filesystem scope, network
  scope, command allowlist). Defaults are least‑privilege. The gate is enforced by
  the engine, never by the model.
- **Budgets.** A run carries a token/cost budget. The engine enforces it as a hard
  ceiling and surfaces spend live.
- **Streaming & observability.** Every step emits structured events
  (OpenTelemetry‑compatible) for tracing, cost accounting, and the surfaces' live UI.
- **Determinism aids.** Given identical inputs, model outputs, and a fixed seed where
  the provider supports it, a run is reproducible from its step log for debugging and
  regression tests.

### 5.2 `@glamfire/brain` — the open brain (owned context)

Your context, in your hands. A **local‑first, portable** context and memory layer.

- **Storage.** Embedded by default: SQLite with vector search (`sqlite-vec`), so the
  store is a single portable file with zero external services on Mac, Windows, and
  Linux. A server profile may back the same interface with `pgvector`/LanceDB for
  teams, behind the identical API.
- **Memory model.** Four record types, each a first‑class, queryable entity:
  - `Fact` — a durable piece of knowledge (one fact per record), with provenance.
  - `Document` — ingested source material, chunked and embedded.
  - `Episode` — a logged interaction/run usable as few‑shot context.
  - `Pointer` — a reference to an external resource (URL, ticket, dashboard).
- **Retrieval.** Hybrid (vector + keyword + recency + provenance weighting). Returns
  ranked, attributed context with token‑budget‑aware packing.
- **Ownership guarantees.** The entire store is **exportable** to a documented,
  human‑readable, model‑neutral format and **importable** back. There is no
  proprietary lock‑in, no opaque embedding that can't be regenerated, no remote
  dependency required to read your own context. *Portability is a tested invariant,
  not a feature flag.*
- **Provenance & privacy.** Every retrieved item carries its source. Records can be
  scoped (private / project / team) and redacted. Nothing is sent to a provider for
  training; the store is never uploaded.

### 5.3 `@glamfire/router` — center/edge, cost‑aware routing

Decides which model handles each task, and when to escalate.

- **Classification.** For each task the router computes a **distribution score**
  (center ↔ edge) and a **confidence**, using fast signals: task type, prompt
  features, retrieval hit quality, historical outcomes for similar tasks, and an
  optional lightweight classifier model. The score is logged on every run.
- **Policy.** A declarative routing policy maps `(distribution, confidence, budget,
  capability requirements)` → an ordered list of candidate models. Default policy:
  send center‑of‑distribution work to **GLM 5.2 on Fireworks**; reserve frontier
  models for edge/low‑confidence work.
- **Escalation / cascade.** The router supports cascades: try the cheap model, run a
  **verifier** (rubric or self‑critique or test execution), and escalate to a
  stronger model on failure. Escalation is a logged `Step`, with the trigger
  recorded.
- **Cost accounting.** Every decision records projected and actual token cost.
  glamfire produces a per‑team **distribution report**: how much work was center vs
  edge, and how much was saved by routing — turning the founder's "get out pencil and
  paper" exercise into an automatic dashboard.
- **Capability constraints.** Tasks can require capabilities (vision, long context,
  function calling, JSON mode); the router filters candidates by adapter‑declared
  capabilities before applying cost preference.

### 5.4 `@glamfire/adapters` — per‑model harnesses

The layer that turns a model into a working agent. **Each model family gets a tested
adapter** so it behaves correctly inside the engine — this is the scarce, valuable
work the harness exists to do.

An adapter implements a single contract:

- **`capabilities`** — declared support: context window, tool calling, parallel tool
  calls, JSON/structured output, vision, streaming, seed/determinism, pricing.
- **`encodeRequest`** — neutral `Run` state → provider request: system‑prompt
  shaping for that family, tool schema in native grammar, memory/context packing in
  the family's preferred ergonomics.
- **`decodeResponse`** — provider response → neutral steps: parse tool calls,
  structured output, and stop reasons into engine‑native form.
- **`pricing`** — token cost function for the router.

First‑class adapters:

- **`fireworks-glm`** — GLM 5.2 (and GLM family) via Fireworks AI; OpenAI‑compatible
  surface, native function calling, structured output, streaming. The default
  workhorse and the reference adapter.
- **`anthropic`** — Claude family, for edge escalation and migration parity.
- **`openai`** — GPT/Codex family and any OpenAI‑compatible endpoint.
- **`local`** — self‑hosted GLM (or other open weights) via vLLM/SGLang or any
  OpenAI‑compatible local server, for fully free, fully private operation.

Adapters are independently versioned and conformance‑tested against a shared
**adapter test suite** (the same battery of tool‑call, structured‑output, memory, and
prompt‑shaping cases runs against every adapter). A model is only "supported" when it
passes the suite.

### 5.5 `@glamfire/skills` — open skills (portable capability packs)

Reusable, model‑agnostic units of capability. A **skill** bundles: a name and
description, the tools it needs, a model‑neutral instruction/prompt template, example
episodes, and an optional verifier. Skills are installed into the engine and become
available to any model through its adapter. Skills are the portable "how to do X"
that travels across models unchanged — the opposite of a system prompt hand‑tuned to
one lab. Skills are declared in a documented manifest format and are shareable
between teams.

### 5.6 `@glamfire/team` — the team harness

The open, self‑hosted alternative to renting team context to a frontier lab. A
**team‑level surface** where ordinary knowledge workers get work done by mentioning
the assistant — without anyone needing to know the words "team harness."

- **Surfaces.** Slack and Discord bots and an HTTP/webhook surface, all over the same
  engine. Mention the bot; it works.
- **Owned team context.** Conversations and decisions are captured into *your*
  `@glamfire/brain` store, scoped to the team — the messy, uncodified context that is
  your edge stays in your infrastructure, never uploaded to a lab.
- **Routing applies.** Team requests flow through the router, so the cheap path
  (GLM 5.2) handles the center of distribution by default.
- **Self‑hosted & rip‑out‑able.** Runs on your servers (Docker/Compose). Because the
  context is owned and exportable, the team can always leave — the explicit antidote
  to lock‑in.

### 5.7 Surfaces

- **`glam` CLI** — the primary surface and the dogfooding vehicle: an agentic coding
  and knowledge‑work assistant in the terminal, cross‑platform (Mac/Windows/Linux).
  Reports its version in `--version` and in run headers (see §9).
- **SDK (`@glamfire/sdk`)** — a typed programmatic API exposing the engine, brain,
  router, and skills for embedding glamfire in other products.
- **Server/daemon mode** — long‑running process exposing the engine over a local API
  for the team harness and IDE integrations.

---

## 6. Configuration

A single, typed, layered configuration (validated with zod), discoverable and
documented:

- **Layers (lowest→highest precedence):** built‑in defaults → user config
  (`~/.glam/config.toml`) → project config (`./glam.toml`) → environment variables →
  CLI flags.
- **Providers & keys.** Provider credentials (Fireworks, Anthropic, OpenAI, local
  endpoints) are configured here and resolved from the OS keychain or env, never
  committed. Secrets never enter the context store or logs.
- **Routing policy.** The default and overrides are declared as config so a team's
  cost posture is explicit and reviewable.
- **Permissions & sandbox.** Tool permissions and sandbox scopes are config, enforced
  by the engine.

The configuration schema is itself part of the spec surface: it is documented,
versioned, and validated, and `glam` fails loudly with actionable messages on invalid
config — never silently falling back.

---

## 7. Cross‑platform & distribution

glamfire targets **macOS, Windows, and Linux** as equals. No platform is a
second‑class citizen; CI verifies all three.

- **Install paths.** Standalone single‑file binaries (`glam`) per‑platform, plus an
  npm package for Node users, plus a Homebrew tap, Scoop/winget manifests, and a
  Docker image for the server/team profiles.
- **Zero‑service default.** The default profile (embedded SQLite brain, remote or
  local inference) requires no databases or background services to run on a laptop.
- **Reproducible builds & signed releases.** Releases are reproducible, checksummed,
  and signed, with an SBOM published per release.

---

## 8. Security & privacy

- **Least privilege by default.** Tools run sandboxed; filesystem/network/command
  scopes are explicit and enforced by the engine.
- **Secrets hygiene.** Credentials live in the OS keychain or env; they are never
  written to the brain store, run logs, or telemetry.
- **Data sovereignty.** The brain store stays local/in‑your‑infra. Only the inference
  prompt for a given call crosses the wire, to the provider you chose; the store is
  never uploaded and never used for training.
- **Prompt‑injection defenses.** Retrieved/external content is treated as untrusted;
  tool‑use from injected content is gated by the permission model.
- **Auditability.** Every run, route decision, tool call, and escalation is logged
  with provenance for audit.
- **Supply chain.** Signed releases, pinned dependencies, SBOM, and a published
  security policy.

---

## 9. Versioning & "version in the product"

- **Semantic versioning**, including the patch (third) number, governs every release.
- **Version is in the product's output.** `glam --version` prints the full semver;
  every run header and the team‑harness banner report the running version and the
  active adapter/model. Telemetry and bug reports carry the version automatically.
- **Release discipline.** Each release bumps the version (patch included), is
  committed, pushed, and **tagged**. Adapters are versioned independently so a model's
  harness can iterate without forcing a core release.
- **Conventional commits** drive an automated changelog.

---

## 10. Quality, verification & dogfooding

- **No shims, no mocks.** Capabilities are full‑stack mini‑features, real from surface
  to provider. A stub is never marked done.
- **Human‑standard verification.** "DONE" means a real human end‑user can use it, and
  it has been verified the way a human would — through the real CLI / real chat
  surface against a real provider, observing real behavior. Verification is creative
  and end‑to‑end, not a green unit test in isolation.
- **Smoke + regression tests.** A smoke suite exercises the real surfaces on every
  change; a growing regression suite locks in fixed behavior. The **adapter
  conformance suite** (§5.4) gates model support.
- **Breadth in lock‑step.** The framework's broad capabilities advance together; a
  single narrow feature is not allowed to outrun the whole. Coverage is never silently
  capped — if something is partial, the docs and `current reality` say so.
- **Dogfooding path.** glamfire is developed with glamfire. The transition from
  external agents to glamfire driving its own development is explicit, staged, and
  verified at each step, so the dogfood loop demonstrably works end‑to‑end before it
  is relied upon.

---

## 11. Governance, licensing & community

- **License.** Apache‑2.0 (patent grant; SaaS‑wrap‑resistant enough for a harness,
  permissive enough for broad adoption). Final license rationale lives in
  `research/15-oss-governance.md` and `LICENSE`.
- **Open governance.** Transparent contribution process (DCO sign‑off), a documented
  governance model, a code of conduct, and a security policy. The repo is a
  top‑notch OSS home: clear mission, honest current reality, why we beat the
  competition, and a real path to contribute.
- **Contributors welcome.** Good‑first‑issues, an RFC process for larger changes, and
  public roadmap issues. The harness‑talent shortage is the opportunity; the project
  is an open invitation to the builders who see it.

---

## 12. Relationship to the meme coins

`glamworks` (the org/brand) and `glamfire` (the product) each have an associated
community meme coin: **$GLAM** and **$GLAMFIRE**. The coins are a community/marketing
layer, **strictly separate from the software**: glamfire's function never depends on,
gates behind, or requires any token. Tokenomics, launch mechanics, and risk
discipline are specified under `marketing/` and `research/13-meme-coin.md` /
`research/14-crypto-legal-risk.md`. **The coins are advertised only after they are
created and live** — never before.

---

## 13. Non‑negotiables (summary)

- Own your context — local‑first, portable, exportable, rip‑out‑able.
- Route cheapest‑capable‑first; escalate on low confidence; GLM 5.2/Fireworks is the
  default workhorse.
- One harness across every model family via tested adapters; no brain in a jar.
- Full‑stack mini‑features only; no shims, no mocks; breadth in lock‑step.
- Human‑standard verification; DONE means a human can really use it.
- macOS, Windows, Linux as equals.
- Version (with patch) in every release and in the product's output; tag every
  release.
- Built with glamfire, dogfooded end‑to‑end.
- Software never depends on the coins; advertise coins only once live.
