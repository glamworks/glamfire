# Manual verification — fireworks-glm adapter (live call)

The full vertical slice (engine loop + fireworks-glm adapter + `glam run`) is
built and tested. The **only** step that needs a real Fireworks key is the live
end-to-end call. This builder had no `FIREWORKS_API_KEY`, so the live call is
**pending a key** — everything else is verified (build, typecheck, lint, 32
unit/regression tests including streaming fragment reassembly against captured
wire-format fixtures, and smoke).

No part of the call path is faked. The unit tests parse real OpenAI-compatible
Fireworks SSE/JSON wire format; the live run below is the last mile.

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
