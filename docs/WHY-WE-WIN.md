# Why glamfire beats the competition

Honest competitive truth, drawn from [`research/07-competitors.md`](../research/07-competitors.md).
We name where rivals are strong and where the white space is.

## The landscape

- **Agent/orchestration frameworks** — LangChain/LangGraph, LlamaIndex, Mastra, Vercel
  AI SDK, CrewAI, AutoGen (maintenance mode), Dify/Flowise (low‑code). Great for wiring
  agents; **none ship automatic cost/capability routing or an owned, portable context
  layer as a first‑class product.** Several carry license landmines (LangGraph server =
  Elastic 2.0; Dify = source‑available).
- **Coding agents / CLIs** — Aider, Continue, Cline/Roo, OpenHands, Codex CLI, Claude
  Code, **Goose (Block)**. Goose is the closest threat: Apache‑2.0, model‑agnostic, owns
  context, and does *coarse* lead/worker routing. But it is a coding agent, not a
  general harness, and its routing is not the center/edge cost engine.

## Where we win

1. **Automatic center/edge cost‑routing is genuine white space.** Model‑agnosticism is
   table stakes in 2026; *deciding which model per task, by cost and confidence, with
   escalation* is not shipped by anyone as a product. This is glamfire's wedge.
2. **Owned, portable context as a guarantee — not a feature.** The brain store is
   local‑first, exportable, and rip‑out‑able by design and by test. Rivals either keep
   context in their cloud or treat portability as incidental. We make "never rent your
   brain back" a tested invariant.
3. **Tested per‑model adapters (no brain in a jar).** A shared conformance suite gates
   model support, so switching models is config, not a rewrite. The scarce harness work
   — tool‑call normalization, memory ergonomics, prompt shaping — is *the* product.
4. **A self‑hosted team harness that the team owns.** The open answer to renting team
   context to a lab: the accreted, messy team context stays in your infrastructure.
5. **Honest "current reality" and full‑stack mini‑features.** No vaporware, no shims.
   What we say works, works — verified the way a human would.
6. **Apache‑2.0, clean of license landmines.** Build a business on it.

## The bet

Models get cheaper and more interchangeable every month. The durable value moves to the
**harness**: routing, owned context, adapters, surfaces. glamfire builds exactly there,
in the open, and invites the builders the whole market is short of.
