# Gotchas

Non-obvious technical traps. Add to this as you hit them so no future session re-learns
them the hard way.

- **GLM 5.2 tool-call arguments stream as fragments** and must be reassembled by the
  engine; reasoning is interleaved between tool calls. The adapter/engine must handle
  both (research/01). This is core to `@glamfire/engine` + `fireworks-glm` adapter.
- **GLM 5.2 thinking is on by default** via `reasoning_effort` (high/max; max is the
  template default). Surface this as adapter config.
- **Fireworks is OpenAI- and Anthropic-compatible** with `service_tier`
  (standard/priority/fast/background), ~90% cached-input discount, 50% batch pricing,
  on-demand GPUs (~$7/hr H100/H200). The router's cost model must account for caching
  and tiers (research/02).
- **License landmines in competitors** (research/07): LangGraph server = Elastic License
  2.0; Dify = source-available (no-SaaS); Arize Phoenix = Elastic License 2.0. Do not
  copy code from these into an Apache-2.0 repo.
- **MCP 2026-07-28 RC** deprecates Roots/Sampling/Logging (stateless core). Track the
  spec revision when building MCP support (research/08).
- **GLM weights license**: repo states Apache-2.0 while some launch press said MIT —
  verify against the actual repo LICENSE before asserting (research/01).
- **Confidence signal**: probe/perplexity-based confidence beats verbalized
  ("how sure are you?") confidence for routing/escalation (research/04).
