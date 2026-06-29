# Locked decisions

Durable, non-obvious decisions. Change only with a clear reason recorded here.

- **What glamfire is**: the open, model-agnostic harness for the *last mile* of AI —
  own your context, route to the cheapest capable model, one work system across model
  families. The harness is the product; models are swappable commodities.
- **The wedge** (research/07): *automatic cost/capability routing is genuine white
  space* — no competitor ships it. Model-agnosticism is table stakes; Block's **Goose**
  (Apache-2.0, model-agnostic, owns context, coarse routing) is the closest threat.
  glamfire wins on the **router + owned portable context + tested per-model adapters**.
- **Default model**: GLM 5.2 served via **Fireworks AI** (OpenAI-compatible). Escalate
  to frontier (Anthropic/OpenAI) only on low confidence / edge tasks. Self-hosted GLM
  via vLLM/SGLang is the fully-free/private path.
- **Tech stack** (research/10): TypeScript monorepo, **pnpm workspaces (+ Turborepo)**,
  **Node ≥22** (engines), **Bun** for dev/test/compile, **tsdown** build, **Vitest**,
  **Biome**, **Zod** config, **Changesets**. Cross-platform binaries via
  `bun build --compile`. Vector store: **sqlite-vec** embedded (zero-service default).
- **License**: **Apache-2.0** (patent grant; broad adoption). Final rationale in
  research/15.
- **Platforms**: macOS, Windows, Linux as equals; CI matrix verifies all three.
- **Meme coins**: $GLAM / $GLAMFIRE are a community layer **strictly separate** from
  the software. Software never depends on them. **Advertise only after live.** Solana
  SPL; mint needs a funded wallet (can't fully script). See research/13, research/14.
- **MCP**: adopt Model Context Protocol for portable tools; per-model adapters
  normalize the genuinely-different tool-call wire formats (research/08).
