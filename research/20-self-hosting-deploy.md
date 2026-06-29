# 20 — Self-Hosting & Deployment

How an OSS AI agent harness ("glamfire") should ship so users can run it locally, in a container, or as a small server — and connect it to either a hosted inference provider (Fireworks AI) or a self-run open-weights model server (vLLM / SGLang) — while keeping inference costs under control.

## Deployment topologies

glamfire should support three escalating modes from the same codebase:

- **Local CLI / single process** — the default. The harness runs on the developer's machine, reads project files directly, and calls a remote (or local) OpenAI-compatible endpoint. No daemon, no DB; state lives on disk. This mirrors how Claude Code, Codex CLI, Aider, and Goose all run.
- **Containerized (Docker / Compose)** — package the harness in an image so it runs identically across machines and CI. Compose is the natural unit for "harness + optional local model server + optional cache/proxy."
- **Optional server mode** — a long-lived HTTP service exposing the agent loop (e.g. for a team gateway, a web UI, or background/async runs). This is where auth, multi-tenant secrets, and audit logging matter most (see `21-security-privacy.md`).

### Docker & Compose guidance

- Ship a slim multi-stage `Dockerfile` (Node/TS build stage → runtime stage on a minimal base) and publish to a registry (GHCR). Keep the runtime image non-root.
- Provide a `docker-compose.yml` that wires the harness to its dependencies via service names and an internal network, so the agent reaches a model server at `http://model:8000/v1` rather than a hardcoded host. This is the standard pattern for self-hosting an OpenAI-compatible stack ([Spheron](https://www.spheron.network/blog/openai-compatible-api-self-hosted/)).
- For GPU model containers, pass `--gpus all` (Compose `deploy.resources.reservations.devices`) and prefer the vendor's published image to avoid host CUDA/PyTorch mismatches — Docker is explicitly recommended for newer CUDA to sidestep host-side mismatches ([SGLang via digitalapplied](https://www.digitalapplied.com/blog/glm-4-6-api-deployment-guide)).
- Mount the working project read/write and the config/secrets read-only. Keep model weights on a named volume or host bind mount so they survive container rebuilds.

## Configuration & secrets management

- **Single config surface, layered.** Resolve config in precedence order: built-in defaults → config file (e.g. `glamfire.toml`/JSON in the project, plus a user-global file) → environment variables → CLI flags. This is the same layering Claude Code uses for its `settings.json` scopes ([Claude Code settings](https://code.claude.com/docs/en/settings)).
- **Never bake secrets into images or config that gets committed.** API keys belong in environment variables or a secrets file that is `.gitignore`d, injected at runtime (Compose `env_file` / `--env-file`, or a secrets manager). For server mode, integrate with the host's secret store rather than reading plaintext from disk.
- **Provider abstraction via `BASE_URL` + `API_KEY`.** Because the targets below are all OpenAI-compatible, the harness only needs `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and a model name to retarget between Fireworks and a local server — no code change ([vLLM OpenAI-compatible server](https://docs.vllm.ai/en/stable/serving/openai_compatible_server/)).

## Connecting to Fireworks AI (hosted)

- Fireworks exposes an **OpenAI-compatible** `/v1/chat/completions` (and an Anthropic-compatible) API; switching from OpenAI to Fireworks is just changing base URL + key + model id ([Fireworks docs](https://docs.fireworks.ai/serverless/pricing), [Fireworks](https://fireworks.ai/)).
- Base URL is `https://api.fireworks.ai/inference/v1`; model ids look like `accounts/fireworks/models/<model>`. Pricing is **pay-per-token, postpaid**, with high rate limits and `$1` of free credits to start ([Fireworks pricing](https://fireworks.ai/pricing)).
- Cost levers Fireworks gives you for free: **cached input tokens are priced at 50%** of normal input by default for text/vision LLMs, and **batch inference is 50%** of serverless for both input and output ([Fireworks serverless pricing](https://docs.fireworks.ai/serverless/pricing)).
- Recommend Fireworks as glamfire's "zero-ops" default tier: no GPUs to manage, good for individuals and small teams; the harness should treat the GLM family on Fireworks and a self-hosted GLM identically behind the same client.

## Connecting to a self-run GLM server (vLLM / SGLang)

Self-hosting GLM (e.g. `zai-org/GLM-4.6`) gives data residency and flat-rate GPU economics. Both servers present an OpenAI-compatible `/v1`.

### vLLM

- Serve with tool-calling + reasoning parsers wired up for the GLM family:
  ```
  vllm serve zai-org/GLM-4.6 \
    --tensor-parallel-size <gpu-count> \
    --tool-call-parser glm45 --reasoning-parser glm45 \
    --enable-auto-tool-choice \
    --served-model-name glm-4.6
  ```
  `--served-model-name` is the id clients pass; existing OpenAI SDK code hits it unchanged ([vLLM serve](https://docs.vllm.ai/en/stable/cli/serve/), [GLM deploy guide](https://www.digitalapplied.com/blog/glm-4-6-api-deployment-guide)).
- For tight VRAM: FP8 weights, `--kv-cache-dtype fp8`, `--gpu-memory-utilization 0.95`, and a bounded `--max-model-len` (65536 is a practical starting point) ([GLM deploy guide](https://www.digitalapplied.com/blog/glm-4-6-api-deployment-guide)).

### SGLang

- `sglang serve` (or `python -m sglang.launch_server`) exposes the same OpenAI-compatible `/v1`; point clients at `http://<host>:<port>/v1`. SGLang adds **RadixAttention** KV-cache sharing and a zero-overhead scheduler, which helps agent workloads that reuse long system prompts ([SGLang quickstart](https://www.glukhov.org/llm-hosting/sglang/), [SGLang repo](https://github.com/sgl-project/sglang)).
- Run the vendor image (`lmsysorg/sglang:latest`) with GPU support to avoid CUDA drift ([SGLang/digitalapplied](https://www.digitalapplied.com/blog/glm-4-6-api-deployment-guide)).

> glamfire should ship a `compose.local-model.yml` overlay that brings up a vLLM **or** SGLang service named `model`, and a `.env.example` switching `OPENAI_BASE_URL` between Fireworks and `http://model:8000/v1`.

## Cost control & caching

- **Prompt caching is the single biggest lever.** A cache read costs ~10% of standard input on Claude models, and Fireworks discounts cached input 50% — caching the large, stable prefix (system prompt, tool schemas, repo context) pays for itself after one or two reuses ([Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [Fireworks pricing](https://docs.fireworks.ai/serverless/pricing)). Real-world reports: **59–70% LLM cost reduction** from caching alone ([ProjectDiscovery](https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching)).
  - Design the harness so the *stable* context sits at the front of the prompt and only the volatile turn-by-turn content changes, maximizing cache hits. SGLang's RadixAttention gives the same benefit for self-hosted models automatically.
- **Batch / async tier** for non-interactive work (bulk refactors, doc generation): Fireworks batch is 50% off ([Fireworks](https://docs.fireworks.ai/serverless/pricing)).
- **Right-size the model per task** — route cheap, well-scoped subtasks (renames, test scaffolding) to a smaller/cheaper model and reserve the frontier model for planning. This is how Codex/Claude Code teams keep spend down (see `22-dogfooding.md`).
- **Token budgeting & telemetry** — surface per-run token + dollar counts so users see cost in real time; cap context window growth (truncate/summarize history) to avoid runaway prompts.
- **Self-hosted economics** — vLLM/SGLang convert per-token cost into flat GPU rental; cost-effective only above sustained utilization, so glamfire docs should give a break-even rule of thumb (hosted for spiky/low volume, self-host for steady high volume).

## Key takeaways for glamfire

- One codebase, three modes: local CLI (default) → Docker/Compose → optional HTTP server. Don't require a daemon for the common case.
- Treat every backend as an OpenAI-compatible endpoint; retargeting Fireworks ↔ vLLM ↔ SGLang must be pure config (`OPENAI_BASE_URL`/`OPENAI_API_KEY`/model id), never code.
- Ship `Dockerfile` (non-root, multi-stage) + base `compose.yml` + a `compose.local-model.yml` overlay for vLLM/SGLang, plus `.env.example`.
- Layer config (defaults → file → env → flags); keep secrets out of images and out of git, injected at runtime.
- Make prompt caching a first-class design constraint (stable prefix up front) — it's a 50–70% cost win on both Fireworks and self-hosted SGLang.
- Add per-run token/cost telemetry, a batch/async cheap tier, and model-routing so users can tune the cost/quality tradeoff.

## Sources

- Fireworks — Pricing: https://fireworks.ai/pricing
- Fireworks — Serverless Pricing (caching/batch discounts): https://docs.fireworks.ai/serverless/pricing
- Fireworks AI homepage (OpenAI/Anthropic compatibility): https://fireworks.ai/
- vLLM — OpenAI-Compatible Server: https://docs.vllm.ai/en/stable/serving/openai_compatible_server/
- vLLM — `vllm serve` CLI: https://docs.vllm.ai/en/stable/cli/serve/
- GLM 4.6 API Deployment Guide (vLLM/SGLang/Docker): https://www.digitalapplied.com/blog/glm-4-6-api-deployment-guide
- SGLang QuickStart (OpenAI API): https://www.glukhov.org/llm-hosting/sglang/
- SGLang repo: https://github.com/sgl-project/sglang
- Spheron — Self-hosted OpenAI-compatible API with vLLM: https://www.spheron.network/blog/openai-compatible-api-self-hosted/
- Anthropic — Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- ProjectDiscovery — Cutting LLM costs 59% with prompt caching: https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching
- Claude Code — Settings (config scopes): https://code.claude.com/docs/en/settings
