# Manual verification — adapters (live calls)

The full vertical slice (engine loop + fireworks-glm adapter + `glam run`) is
built and tested, and the **anthropic** adapter (Claude Messages API) is built,
conformance-green, and directly drivable. The **only** steps that need a real
provider key are the live end-to-end calls. This builder had no
`FIREWORKS_API_KEY` or `ANTHROPIC_API_KEY`, so both live calls are **pending a
key** — everything else is verified (build, typecheck, lint, the full
unit/regression suite including streaming fragment reassembly against captured
wire-format fixtures, the conformance suite against BOTH adapters, and smoke).

No part of either call path is faked. The unit/conformance tests parse real
OpenAI-compatible Fireworks SSE/JSON and real Anthropic Messages API SSE/JSON
wire format; the live runs below are the last mile.

## Prerequisites

```bash
export FIREWORKS_API_KEY=fw_...      # from https://fireworks.ai
pnpm install && pnpm -r build        # build dist (the CLI imports built JS)
```

Optional: confirm the environment is ready.

```bash
node packages/cli/src/index.mjs doctor
```

## 1. Real end-to-end run (the human-standard verification)

A prompt that forces a real tool call through the engine loop (model_turn ->
tool_call -> tool_result -> model_turn -> final), streamed live:

```bash
node packages/cli/src/index.mjs run \
  "Use the calculator tool to compute (2 + 3) * 4, then state the result in one sentence." \
  --effort high --max-usd 0.25
```

Expect to observe, for real:
- a run header: `glamfire <version> · run`, `provider: fireworks`,
  `model: glm-5.2 (accounts/fireworks/models/glm-5p2)`, the routing honesty note,
  and the effort/tier/budget line;
- streamed assistant text from GLM-5.2;
- a `→ calculator({"expression":"(2 + 3) * 4"}) [allow]` dispatch and a
  `← calculator ok` observation (the engine ran the real local tool);
- a final answer mentioning `20`;
- a token/cost summary line: `tokens: in N (cached M) · out K … cost: $… status: done`.

A pure-text run (no tool call), to confirm the streaming text path:

```bash
node packages/cli/src/index.mjs run "In one sentence, what is glamfire?" --max-usd 0.10
```

Read a real file into the task and have GLM summarize it:

```bash
node packages/cli/src/index.mjs run "Summarize this file in two bullets." --file README.md --max-usd 0.20
```

## 2. Refresh the wire-format fixtures from a live response

This records a real streamed Fireworks response and confirms the committed
parser (`parseSSE` + `reduceStream`) reproduces it identically:

```bash
node packages/adapters/scripts/capture-fixture.mjs
# -> wrote N bytes of raw SSE to .../fixtures/glm-stream-live.sse.txt
# -> parsed: 1 tool call(s), … finish=tool_calls, usage in=… out=…
#      -> calculator({"expression":"(2 + 3) * 4"})
```

## 3. Budget ceiling is real

A tiny ceiling stops the run even mid-task:

```bash
node packages/cli/src/index.mjs run "Write a 2000-word essay about routing." --max-usd 0.001
# -> status: budget_exhausted (hard ceiling enforced by the engine)
echo $?
# -> 3 (the documented budget-stop exit code — distinguishable from done in scripts)
```

---

# Manual verification — anthropic adapter (live Claude call)

The `anthropic` adapter speaks the native Anthropic Messages API. The router/CLI
model-selection wiring is a separate subsystem; to verify the adapter end-to-end
right now, drive it directly against the real API with a key.

## Prerequisites

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # from https://platform.claude.com
pnpm install && pnpm -r build         # build dist (the script imports built JS)
```

## 1. Real streamed tool call through the adapter (human-standard verification)

```bash
node --input-type=module -e '
import { createAnthropicAdapter, resolveAnthropicConfig } from "./packages/adapters/dist/index.js";
const cfg = resolveAnthropicConfig(process.env);
const adapter = createAnthropicAdapter(cfg);
const state = {
  system: "You are glamfire. Use the calculator tool for arithmetic.",
  task: { goal: "compute", budget: {} },
  messages: [{ role: "user", content: "What is (2 + 3) * 4? Use the calculator tool." }],
  tools: [{
    name: "calculator", description: "Evaluate an arithmetic expression.", permission: "read",
    parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    handler: async () => ({}),
  }],
  config: { model: cfg.model, maxTokens: 1024 },
};
const result = await adapter.stream(state, (ev) => { if (ev.kind === "text") process.stdout.write(ev.delta); });
console.log("\n--", JSON.stringify({ toolCalls: result.toolCalls, finishReason: result.finishReason, usage: result.usage }, null, 2));
console.log("cost USD:", adapter.pricing(result.usage));
'
```

Expect, for real: streamed Claude text, then a reassembled
`calculator({"expression":"(2 + 3) * 4"})` tool call (rebuilt from
`input_json_delta` fragments), `finishReason: "tool_calls"`, a real `usage`
object (input/cached/output), and a non-zero cost from the Claude price table.

## 2. Refresh the wire-format fixtures from a live response

Records a real streamed Anthropic response and confirms the committed parser
(`parseAnthropicSSE` + `reduceAnthropicStream`) reproduces it identically:

```bash
node packages/adapters/scripts/capture-anthropic-fixture.mjs
# -> wrote N bytes of raw SSE to .../fixtures/anthropic-stream-live.sse.txt
# -> parsed: 1 tool call(s), … finish=tool_calls, usage in=… cached=… out=…
#      -> calculator({"expression":"(2 + 3) * 4"})
```

## 3. Conformance gate (every adapter, hermetic)

```bash
npx vitest run packages/adapters/test/conformance.test.ts
# -> adapter conformance: fireworks-glm                             (9 cases green)
# -> adapter conformance: fireworks-glm (DeepSeek-V4-Pro · FP8)     (9 cases green)
# -> adapter conformance: fireworks-glm (DeepSeek-V4-Flash · FP8)   (9 cases green)
# -> adapter conformance: together (GLM-5.2 · FP4)                  (9 cases green)
# -> adapter conformance: together (Qwen3-Coder-Next · FP8)         (9 cases green)
# -> adapter conformance: together (DeepSeek-V4-Pro)                (9 cases green)
# -> adapter conformance: anthropic                                 (9 cases green)
```

---

# Manual verification — DeepSeek-V4 on Fireworks (LIVE-VERIFIED 2026-07-03)

The `fireworks-glm` adapter serves **three** verified serverless models behind
the same `FIREWORKS_API_KEY` (research/25):

| model id                                       | quant | thinking | in / cached / out (per 1M)  |
|------------------------------------------------|-------|----------|-----------------------------|
| `accounts/fireworks/models/glm-5p2`            | FP8   | yes      | $1.40 / $0.14 / $4.40       |
| `accounts/fireworks/models/deepseek-v4-flash`  | FP8   | yes      | $0.14 / $0.028 / $0.28      |
| `accounts/fireworks/models/deepseek-v4-pro`    | FP8   | yes      | $1.74 / $0.145 / $3.48      |

Both DeepSeek models were verified LIVE on 2026-07-03: real chat completions,
real `reasoning_content` traces, real parallel tool calls (`get_weather` for
Paris + London in one turn), `seed` accepted, 1,048,576-token context confirmed
via the Fireworks model API. Note: Fireworks lists **no Priority tier for
V4-Flash** — the adapter fails loud if you ask for one — and
`GET /inference/v1/models` returns only a curated subset (Flash is absent from
the list but serves fine).

## 1. Real end-to-end run with a tool call (human-standard verification)

```bash
node packages/cli/src/index.mjs run \
  "Use the calculator tool to compute (2 + 3) * 4, then state the result in one sentence." \
  --model accounts/fireworks/models/deepseek-v4-pro --max-usd 0.25
# and the budget tier:
node packages/cli/src/index.mjs run \
  "Use the calculator tool to compute (2 + 3) * 4, then state the result in one sentence." \
  --model accounts/fireworks/models/deepseek-v4-flash --max-usd 0.05
```

Expect, for real: the run header showing the DeepSeek model id, a
`→ calculator({"expression":"(2 + 3) * 4"}) [allow]` dispatch, a final answer
mentioning `20`, and a cost line priced from the DeepSeek table (Flash runs
cost ~10-30x less than the same run on GLM/Pro).

## 2. Refresh the LIVE-captured conformance fixtures

The committed `deepseek-*` fixtures are real Fireworks wire captures. Re-record
them any time (temperature 0, seed 42, via the adapter's own encodeRequest):

```bash
node packages/adapters/scripts/capture-deepseek-fixtures.mjs pro
node packages/adapters/scripts/capture-deepseek-fixtures.mjs flash
```

---

# Manual verification — DeepSeek-V4-Pro on Together (pending TOGETHER_API_KEY)

Together is the SECONDARY DeepSeek host (`deepseek-ai/DeepSeek-V4-Pro`, native
FP4+FP8 mixed precision, **512K** ctx as served vs Fireworks' 1M, and pricier:
$2.10 / $0.20 cached / $4.40 per 1M — research/25 §B). The adapter, per-model
table, conformance battery (exact Together wire format), and router wiring are
all built and green; **only the live call is pending a key**. With a key:

```bash
node packages/adapters/scripts/capture-together-fixture.mjs deepseek
# then re-run the streamed tool-call one-liner from the Together section above
# with TOGETHER_DEEPSEEK_MODEL, and reconcile pricing against the invoice.
```

---

# Manual verification — together adapter (live Together AI call)

The `together` adapter speaks Together AI's OpenAI-compatible Chat Completions
API (base `https://api.together.xyz/v1`, Bearer auth) and serves **two**
open-weight models behind the shared `openai-compatible` core (research/23):

| model id                  | quant | thinking | pricing in / cached / out (per 1M) |
|---------------------------|-------|----------|------------------------------------|
| `zai-org/GLM-5.2`         | FP4*  | yes      | $1.40 / $0.26 / $4.40              |
| `Qwen/Qwen3-Coder-Next`   | FP8   | no       | $0.11 / $0.011** / $0.80           |

> \* **Honesty caveat (research/23 §2):** Together serves GLM-5.2 at **FP4** — a
> real quantization downgrade vs the Fireworks/Baseten **FP8** baseline. Prefer
> Fireworks for GLM quality; use Together's GLM only as a cheaper/secondary host.
>
> \** **Honesty caveat (research/23 §1):** Together serves **Qwen3-Coder-Next via
> a DEDICATED endpoint** (not turnkey serverless). The per-token list above uses
> Qwen's reference serverless price; cache reads are modeled at ~0.1× input (the
> common prefix-cache convention). Verify against the live dedicated-endpoint
> invoice and, if the endpoint uses a deployment-specific model id, pass it
> verbatim to `--model` / the capture script.

This builder had **no `TOGETHER_API_KEY`**, so the two live calls below are
**pending a key** — everything else is verified (build, typecheck, lint, the full
unit/regression suite, the conformance battery against `together` for BOTH models
incl. Qwen tool-call streaming fragment reassembly, smoke, and the offline
`glam route` decision selecting Qwen-on-Together as the cheapest eligible
candidate). No part of the call path is faked.

## Prerequisites

```bash
export TOGETHER_API_KEY=...            # from https://api.together.xyz (enable ZDR in Settings)
pnpm install && pnpm -r build          # build dist (the scripts import built JS)
```

## 1. Real streamed tool call through the adapter (human-standard verification)

GLM-5.2 (thinking) and Qwen3-Coder-Next (non-thinking, coding agent), driven
directly against the live API:

```bash
# GLM-5.2 on Together (sends reasoning_effort; expect interleaved reasoning):
node --input-type=module -e '
import { TOGETHER_GLM_MODEL, createTogetherAdapter, resolveTogetherConfig } from "./packages/adapters/dist/index.js";
const cfg = resolveTogetherConfig(process.env, { model: TOGETHER_GLM_MODEL });
const adapter = createTogetherAdapter(cfg);
const state = {
  system: "You are glamfire. Use the calculator tool for arithmetic.",
  task: { goal: "compute", budget: {} },
  messages: [{ role: "user", content: "What is (2 + 3) * 4? Use the calculator tool." }],
  tools: [{ name: "calculator", description: "Evaluate an arithmetic expression.", permission: "read",
    parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    handler: async () => ({}) }],
  config: { model: cfg.model, maxTokens: 1024 },
};
const result = await adapter.stream(state, (ev) => { if (ev.kind === "text") process.stdout.write(ev.delta); });
console.log("\n-- quant:", adapter.quantization, JSON.stringify({ toolCalls: result.toolCalls, finishReason: result.finishReason, usage: result.usage }));
console.log("cost USD:", adapter.pricing(result.usage));
'

# Qwen3-Coder-Next on Together (non-thinking; expect NO reasoning trace). Replace
# the model id with your dedicated-endpoint id if Together requires one:
node --input-type=module -e '
import { TOGETHER_QWEN_MODEL, createTogetherAdapter, resolveTogetherConfig } from "./packages/adapters/dist/index.js";
const cfg = resolveTogetherConfig(process.env, { model: TOGETHER_QWEN_MODEL });
const adapter = createTogetherAdapter(cfg);
const state = {
  system: "You are glamfire. Use the calculator tool for arithmetic.",
  task: { goal: "compute", budget: {} },
  messages: [{ role: "user", content: "What is (2 + 3) * 4? Use the calculator tool." }],
  tools: [{ name: "calculator", description: "Evaluate an arithmetic expression.", permission: "read",
    parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    handler: async () => ({}) }],
  config: { model: cfg.model, maxTokens: 1024 },
};
const result = await adapter.stream(state, (ev) => { if (ev.kind === "text") process.stdout.write(ev.delta); });
console.log("\n-- quant:", adapter.quantization, JSON.stringify({ toolCalls: result.toolCalls, finishReason: result.finishReason, usage: result.usage }));
console.log("cost USD:", adapter.pricing(result.usage));
'
```

Expect, for real: streamed text, then a reassembled
`calculator({"expression":"(2 + 3) * 4"})` tool call (rebuilt from fragmented
`tool_calls[].function.arguments` deltas), `finishReason: "tool_calls"`, a real
`usage` object, and a non-zero cost from the per-model price table. GLM emits a
reasoning trace; Qwen3-Coder-Next does not.

## 2. Refresh the wire-format fixtures from a live response

```bash
node packages/adapters/scripts/capture-together-fixture.mjs glm
node packages/adapters/scripts/capture-together-fixture.mjs qwen
# -> model: <id>  quant: FP4|FP8
# -> wrote N bytes of raw SSE to .../fixtures/together-<model>-stream-live.sse.txt
# -> parsed: 1 tool call(s), … finish=tool_calls, usage in=… out=…
#      -> calculator({"expression":"(2 + 3) * 4"})
```

## 3. Routing selects Qwen-on-Together as the cheap coding tier (offline, no key)

```bash
# In a project whose glam.toml lists providers.together.models =
# ["zai-org/GLM-5.2", "Qwen/Qwen3-Coder-Next"] and a rule with
# requires = ["tool_calling", "long_context"], candidates ordered Qwen-first:
node packages/cli/src/index.mjs route "Refactor this module and add unit tests using the calculator tool"
# -> chosen model: Qwen/Qwen3-Coder-Next  projected: $0.0005  frontier baseline: $0.0029
# -> why: rule #0 matched; chose cheapest of 2 eligible candidate(s): Qwen/Qwen3-Coder-Next
# -> cascade: Qwen/Qwen3-Coder-Next -> accounts/fireworks/models/glm-5p2
```

## 4. Local / self-host adapter (Ollama) — LIVE-VERIFIED 2026-07-03

Unlike the hosted adapters, the `local` adapter needs **no key** — only a
running OpenAI-compatible server. It was verified live against a real Ollama
daemon (v0.30.6, macOS) serving **qwen3:0.6b**, with `FIREWORKS_API_KEY`
removed from the environment (a fully local run must need no hosted key):

```bash
ollama pull qwen3:0.6b
cat > glam.toml << 'TOML'
[providers.local]
baseUrl = "http://localhost:11434/v1"
models = ["qwen3:0.6b"]
capabilities = ["tool_calling", "streaming"]
TOML
echo "The secret animal is: armadillo" > notes.txt
env -u FIREWORKS_API_KEY node packages/cli/src/index.mjs run \
  "Read the file notes.txt using the read_file tool and tell me which animal it mentions." \
  --model qwen3:0.6b --yes
```

Observed output (real transcript):

```
glamfire 0.4.1 · run
  adapter: local   model: qwen3:0.6b
  routing: explicit --model override (router bypassed)
  endpoint: http://localhost:11434/v1   price: $0/$0 per 1M (self-host, declared)   budget: $0.5000 / 8 steps

  → read_file({"path":"notes.txt"})  [allow]
  ← read_file ok (32 bytes)
The file notes.txt mentions the animal **armadillo**.

──
tokens: in 3381 (cached 0) · out 481 (3862 total)   cost: $0.000000   steps: 6   status: done
recorded to ~/.glam/usage.jsonl — see `glam usage`
```

Also verified live: the routed path (`glam run --local` selects qwen3:0.6b via
the router at $0 with `local-only` in the header), `glam route` picking the $0
local candidate while keeping GLM in the escalation cascade, and the loud
`local_only` failure when only a hosted fallback exists. The conformance
fixtures under `test/fixtures/ollama-*` are real wire captures from this same
daemon (`scripts/capture-local-fixtures.mjs`). The smoke test re-runs the live
tool round-trip whenever an Ollama daemon with qwen3:0.6b is present, and
prints a LOUD skip naming exactly what was not exercised otherwise.

DwarfStar/DS4 itself was **not** run (hardware floor: 96–128 GB unified memory
for ~87 GB of weights); its catalog entry is validated by schema + the shared
OpenAI-compatible contract and flagged unverified-live in `glam models` notes.
