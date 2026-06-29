# Adapter conformance suite (SPEC §5.4)

> **A model/adapter is "supported" only when this suite is green.**

This is the single, provider-agnostic battery that turns a model into a *working
agent*. The same cases run against **every** adapter (`fireworks-glm`,
`anthropic`, …). It is the gate the harness exists to defend: a new adapter is
not "done" — and a model is not "supported" — until `runConformance` passes for
it.

## What the battery checks

Each adapter is exercised against its own **captured real wire fixtures** (real
provider SSE/JSON recorded into committed files — never mocks), so the suite is
hermetic and runs in CI with no live keys:

- **Capability declaration** — `capabilities` is complete and self-consistent
  (positive context/output windows, output ≤ context, all flags boolean).
- **Pricing sanity** — zero usage is free; cost rises with tokens; output is
  never cheaper than input per token; cached input is strictly cheaper than
  fresh input.
- **Request shaping** — `encodeRequest` emits the system prompt, re-emits tools
  in the provider's native grammar, threads tool-call results back by id, and
  sets a positive max-output-tokens.
- **Streaming flag** — a streaming request is encoded as streaming.
- **Tool-call decode round-trip + stop-reason mapping** — a captured tool-call
  completion decodes to the neutral `tool_calls` finish reason with parsed args
  and exact usage.
- **Multi-tool** — multiple tool calls decode with distinct ids.
- **Structured / JSON output** — a JSON-text completion survives decode intact.
- **Streamed fragment reassembly** — tool-call arguments streamed as fragments
  (`tool_calls[].function.arguments` for OpenAI-compatible providers,
  `input_json_delta` for Anthropic) reassemble into one valid object; a streamed
  plain-text answer reassembles with no tool calls.

## How to wire a new adapter in

Construct a `ConformanceCase` and call `runConformance` from a Vitest file:

```ts
import { runConformance } from '../conformance/index.js';

runConformance(() => ({
  adapter,                 // your AdapterContract instance
  sampleState,             // system mentioning "glamfire" + a calculator tool call (id "call_1")
  inspectRequest(req) {    // extract neutral facts from YOUR provider request body
    const body = req.body as Record<string, unknown>;
    return { systemText, toolNames, toolResultIds, maxTokens };
  },
  toolCallCompletion: { raw, toolCalls, finishReason: 'tool_calls', usage },
  multiToolCompletion: { raw, toolCalls, finishReason: 'tool_calls', usage },
  jsonCompletion: { raw, expectJson },
  reduceToolCallStream: () => yourReduce(yourParseSSE(toolCallFixture)),
  reduceTextStream: () => yourReduce(yourParseSSE(textFixture)),
  expectStreamToolCall: { name, arguments, finishReason: 'tool_calls' },
  expectStreamText: { textIncludes, finishReason: 'stop' },
}));
```

The battery is the contract; the closures above are how each provider's wire
format plugs into it. See `../test/conformance.test.ts` for the live wiring of
both first-class adapters.

## Refreshing fixtures from a live call

Each adapter ships a capture script under `../scripts/` that records a **real**
streamed response using the adapter's own `encodeRequest`, writes the raw wire
bytes to a fixture, and re-proves the committed parser reproduces it. Run it with
the provider key set (`FIREWORKS_API_KEY` / `ANTHROPIC_API_KEY`) to refresh.
