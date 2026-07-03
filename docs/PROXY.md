# `glam serve` — keep Claude Code, put a meter, router, and ledger under it

The router-as-proxy gateway ([`research/32-number-one.md`](../research/32-number-one.md)
backlog item 4; the gateway leg of the tri-mode architecture in
[`research/28-claude-code-wrap.md`](../research/28-claude-code-wrap.md)). You keep the
agent you already run — **Claude Code, opencode, Cursor, any Anthropic- or
OpenAI-SDK client** — and point its base URL at a local glamfire endpoint. Every
request is translated to **GLM 5.2 on Fireworks** (or the cost-aware router's
per-request choice), served for real, and metered **exactly** — the proxy sees the
provider's own token counts first-party, no OTEL estimates, no transcript parsing.

## Claude Code in two env vars

```bash
export FIREWORKS_API_KEY="<your key>"   # the real upstream
glam serve                              # prints the endpoint + a session token
```

Then, in the terminal where you run Claude Code (or via `"env"` in
`~/.claude/settings.json`):

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:4114"
export ANTHROPIC_AUTH_TOKEN="<the token glam serve printed>"
claude          # the full Claude Code UX, now running on GLM 5.2, metered
```

This is the exact `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` override that Z.ai's
official GLM Coding Plan docs use — a documented Claude Code surface. With the
credential variable set, your Anthropic subscription is **not** used and no
Anthropic credential ever touches glamfire (the ToS-safe boundary in research/28 §4).

Verified live (2026-07-03, Claude Code v2.1.200, glamfire 0.4.1): headless
`claude -p` completed real multi-turn tasks with real `Read`/`Write` tool calls
through the proxy on GLM 5.2, and `glam usage` showed the exact spend —
$0.042 actual for a session Claude Code itself estimated at $0.30 in
Claude-model pricing. That difference is the product.

## OpenAI-dialect clients

```bash
export OPENAI_BASE_URL="http://127.0.0.1:4114/v1"
export OPENAI_API_KEY="<the token glam serve printed>"
```

`POST /v1/chat/completions` is a metered passthrough: the model id is pinned (or
routed), streaming usage reporting is forced on so the meter stays exact, and the
rest of the request reaches the provider untouched.

## What the proxy gives you

- **Exact metering** — every request appends one record to `~/.glam/usage.jsonl`
  with model, provider, tokens (incl. cache hits), true USD cost, dialect, and a
  client label. `glam usage` gains a **by client** table (claude-code / opencode /
  curl / …). Non-streaming responses carry an `x-glamfire-cost-usd` receipt header.
- **Hard budget stops** — `[serve.budgets]` in `glam.toml` is enforcement, not
  alerting: an over-budget request is rejected with a clean provider-shaped error
  (Anthropic-shaped 400 / OpenAI-shaped 429 `insufficient_quota`) **before any
  provider is called**. Claude Code surfaces the message and stops — no hang.

  ```toml
  [serve.budgets]
  monthlyUsd = 25.0            # all proxy traffic
  [serve.budgets.clients.claude-code]
  monthlyUsd = 10.0            # just Claude Code (x-glam-client / user-agent label)
  ```

- **Routing** — `glam serve --route` lets the cost-aware router pick the model per
  request from your routing policy instead of pinning one (`--model <id>` pins).
- **Fidelity** — tool-call IDs round-trip verbatim, streamed tool-call argument
  fragments are re-framed fragment-for-fragment, system prompts (top-level string,
  block arrays, and Claude Code's in-array `role:"system"` messages) all map;
  images pass through where the target declares vision and fail with a clean 400
  where it does not. Anthropic **server** tools (web search etc.) cannot run on a
  third-party upstream and are skipped with a logged warning.
  `POST /v1/messages/count_tokens` returns a documented ~4-chars/token estimate
  (the target tokenizer is not Anthropic's; an exact count does not exist here).

## Security posture

- Binds `127.0.0.1` and **always** requires a bearer token. No token configured →
  a per-session token is generated and printed once.
- A non-loopback `--bind` **refuses to start** unless the token is explicit
  (`GLAM_SERVE_TOKEN` or `--token`). Exposing an LLM gateway to a network is a
  deliberate, configured act.
- The proxy never reads, stores, or forwards Anthropic subscription OAuth tokens.
  Its only upstream credentials are your own provider API keys.

## Endpoints

| Endpoint | What |
|---|---|
| `POST /v1/messages` | Anthropic Messages dialect (streaming + non-streaming) |
| `POST /v1/messages/count_tokens` | Token-count estimate |
| `POST /v1/chat/completions` | OpenAI chat-completions dialect (streaming + non-streaming) |
| `GET /v1/models` | Registered models (OpenAI list shape) |
| `GET /healthz` | Liveness + glamfire version (no auth) |

Config lives in `[serve]` (`port`, `bind`, `target = "pin" | "route"`, `model`,
`budgets`) — see [`glam.example.toml`](../glam.example.toml). Flags:
`--port`, `--bind`, `--token`, `--model`, `--route`.

## Current reality / limits

- The upstream must be an **OpenAI-compatible** provider (Fireworks, Together,
  local). Pinning an Anthropic-served model is refused with a clear error —
  routing an Anthropic-dialect client to Anthropic through a local hop adds
  nothing (use Claude Code natively for that; glamfire absorbs that usage via the
  research/28 telemetry surfaces instead).
- Prior assistant `thinking` blocks are not replayed upstream (the OpenAI request
  wire has no slot for them); new reasoning streams back as `thinking` deltas.
- A request interrupted mid-stream is recorded with `status: "interrupted"` and
  whatever usage the upstream reported before the cut (usually none — the
  provider may still bill a few tokens for the cancelled turn).
