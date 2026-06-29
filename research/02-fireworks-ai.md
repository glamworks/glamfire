# Fireworks AI — Inference Platform

Research date: 2026-06-29. Focus: how glamfire should serve GLM-5.2 via Fireworks.

## Platform overview

- Fireworks AI is a generative-AI inference platform: **serverless pay-per-token**, **on-demand dedicated GPU deployments**, and **fine-tuning**, behind one unified API.
- API is **OpenAI-compatible AND Anthropic-compatible** — drop-in for clients/harnesses built for either.
- Positioned on speed ("Fastest Inference for Generative AI") and price vs first-party APIs.

## Serverless 2.0 — three serving paths, one API

Selected per-request via `service_tier` (works on both OpenAI- and Anthropic-compatible endpoints):

1. **Standard** — default elastic shared infra; "Standard sheds first" under load. Base pay-per-token price.
2. **Priority** — `service_tier: "priority"`; "Priority sheds last" — stronger admission during congestion. ≈ **1.5× Standard** price. (Semantics = reliability/admission, not pure latency like OpenAI's priority.)
3. **Fast** — high-throughput path targeting **100+ generated tokens/sec** on the same weights; addressed via dedicated model IDs (e.g. `kimi-k2p6-turbo`, `GLM 5.1 Fast`). ≈ **2× Standard** price.
- **Background** tier (preview): async/batch-style jobs at **~¼ of Standard**.

Error semantics worth handling in a harness:
- `429 Too Many Requests` — your account rate/limit exceeded.
- `503 Service Overloaded` — fleet temporarily saturated (retry/backoff).
- `503 Service Unavailable` — genuine outage (covered by **99.9% SLA**).

## GLM-family support

- **GLM-5.2 is live on Fireworks serverless** — marketed as "Opus-level intelligence at open-source rates," pay-per-token.
- **GLM 5.1** and **GLM 5.1 Fast** also available. Other open MoE models (Kimi K2.6 / Turbo, DeepSeek V4, Qwen 3.7 Plus, etc.) hosted alongside.

## Pricing (per 1M tokens, input / cached-input / output)

- **GLM-5.2 Standard**: **$1.40 / $0.14 / $4.40**
- **GLM-5.2 Priority**: **$1.75 / $0.18 / $5.50**
- **GLM-5.2 Fast**: ≈ 2× Standard
- GLM-5.1 Standard: $1.40 / $0.26 / $4.40 (Priority $2.10 / $0.39 / $6.60)
- **Cached input** is billed at a steep discount (~90% off input; e.g. GLM-5.2 $0.14 vs $1.40).
- **Batch inference**: **50% of serverless** price (input and output).
- Three billing dimensions on every text/vision request: input tokens, cached-input tokens (prompt cache), output tokens.
- **Free tier**: ~$1 starter credit for new accounts (~1M tokens on a 70B-class model).

## On-demand (dedicated) deployments

- Billed **by the GPU-hour**, model runs on reserved GPUs (predictable latency, no shedding):
  - **H100 80GB ≈ $7.00/hr**, **H200 141GB ≈ $7.00/hr**, **B200 180GB ≈ $10.00/hr**, **B300 288GB ≈ $12.00/hr**.
- Use when sustained volume makes per-token serverless more expensive than reserving GPUs, or when you need guaranteed throughput/latency for GLM-5.2's 1M-context workloads.

## API shape, function calling, structured output, streaming

- **OpenAI Chat Completions–compatible** (`/v1/chat/completions`) and Anthropic-compatible Messages endpoints.
- **Function/tool calling**: standard OpenAI `tools` / `tool_choice` schema → maps directly onto GLM-5.2's OpenAI-style tool format. (Remember GLM streams tool-call args in fragments — accumulate deltas.)
- **Structured output**: `response_format` with JSON Schema / JSON mode (grammar-constrained decoding on Fireworks).
- **Streaming**: SSE token streaming standard; the Fast tier is the lever for high tokens/sec.
- `reasoning_effort` passes through to GLM-5.2 (`high`/`max`); reasoning/thinking tokens surface in the response.

## Fine-tuning & deployment

- Fireworks supports **fine-tuning / LoRA** and serving custom adapters; exact GLM-5.2 fine-tune pricing not confirmed in this pass — verify in current docs.
- Deployment progression for a harness: **serverless Standard (dev) → Priority/Fast (prod latency/reliability) → on-demand GPUs (scale) / Background (batch eval)**.

## Rate limits

- Tier-based account rate limits; over-limit surfaces as `429`. Exact RPM/TPM not confirmed in this pass — read current limits page and implement backoff on both `429` and `503`.

## How a harness should integrate

- Use the **OpenAI-compatible base URL + API key**; set model to the Fireworks GLM-5.2 id. Keep model id, base URL, and `service_tier` as **config**, not hardcoded.
- Treat **(model, provider, inference stack, prompts) as one system** — Fireworks' own stack/quantization can make the "same" model behave differently from Z.ai-hosted or self-hosted GLM-5.2. Pin and eval per provider.
- Implement: tool-call delta accumulation, SSE streaming, `response_format` JSON schema, `reasoning_effort` pass-through, retry/backoff for 429/503, and prompt-cache-friendly prompt layout (stable prefix) to capture the ~90% cached-input discount.

## Key takeaways for glamfire

- **Fireworks is a first-class GLM-5.2 serving target**: OpenAI- (and Anthropic-) compatible, GLM-5.2 live, ~$1.40/$4.40 per-M with a deep cached-input discount and 50% batch pricing.
- **Expose `service_tier`** (standard/priority/fast/background) as a knob — cheap-and-shed for dev/batch, priority/fast for interactive agent loops.
- **Design prompts for prompt caching** (stable system/tool prefix) to slash input cost ~90% on long agentic sessions.
- **Abstract the provider**: model id + base URL + tier in config so glamfire can move the same GLM-5.2 between Fireworks serverless, Fireworks on-demand, Z.ai, Baseten, Together, etc. — and re-run evals per provider since the stack changes behavior.
- **Handle GLM-5.2 quirks at the Fireworks layer**: fragmented tool-call streaming, interleaved reasoning tokens, 1M-context cost (consider on-demand GPUs or Background tier for heavy long-context/eval runs).

## Sources

- https://fireworks.ai/pricing
- https://docs.fireworks.ai/serverless/pricing
- https://fireworks.ai/blog/serverless-2
- https://fireworks.ai/
- https://fireworks.ai/inference
- https://fireworks.ai/blog/best-llm-api-providers
- https://fireworks.ai/blog/qwen-3p7-plus
- https://pricepertoken.com/endpoints/fireworks/free
- https://www.spheron.network/blog/fireworks-ai-alternatives/
- https://www.morphllm.com/fireworks-alternative
- https://www.baseten.co/blog/how-to-run-glm-52-in-any-harness/
