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
- a run header: `glamfire <version> · run`, `adapter: fireworks-glm`,
  `model: accounts/fireworks/models/glm-5p2`, the routing honesty note, and the
  effort/tier/budget line;
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

## 3. Conformance gate (both adapters, hermetic)

```bash
npx vitest run packages/adapters/test/conformance.test.ts
# -> adapter conformance: fireworks-glm  (9 cases green)
# -> adapter conformance: anthropic      (9 cases green)
```
