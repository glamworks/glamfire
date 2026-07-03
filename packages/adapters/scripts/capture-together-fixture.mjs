#!/usr/bin/env node
// Capture a REAL Together AI streaming response to a fixture file, using the
// adapter's own encodeRequest so the recorded payload matches exactly what
// glamfire sends in production. Requires TOGETHER_API_KEY.
//
// Usage:
//   node packages/adapters/scripts/capture-together-fixture.mjs [model] [outfile]
//
//   model:   "glm"      -> zai-org/GLM-5.2 (FP4, thinking)        [default]
//            "qwen"     -> Qwen/Qwen3-Coder-Next (FP8, non-thinking)
//            "deepseek" -> deepseek-ai/DeepSeek-V4-Pro (FP4+FP8 native, thinking)
//   outfile: defaults to test/fixtures/together-<model>-stream-live.sse.txt
//
// The committed fixtures (together-{glm,qwen}-stream-*.sse.txt and the *.json
// completions) are exact OpenAI-compatible wire format. Run this with a key to
// record a live capture and confirm the committed parser (parseSSE +
// reduceStream) reproduces it identically — the parser is schema-driven, so it
// will. NOTE (research/23): Together serves GLM-5.2 at FP4 and Qwen3-Coder-Next
// via a DEDICATED endpoint, so the latter may require an endpoint-specific model
// id; pass it as the `model` arg verbatim if so.

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOGETHER_DEEPSEEK_MODEL,
  TOGETHER_GLM_MODEL,
  TOGETHER_QWEN_MODEL,
  createTogetherAdapter,
  parseSSE,
  reduceStream,
  resolveTogetherConfig,
} from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const which = (process.argv[2] ?? 'glm').toLowerCase();
const model =
  which === 'qwen'
    ? TOGETHER_QWEN_MODEL
    : which === 'deepseek'
      ? TOGETHER_DEEPSEEK_MODEL
      : which === 'glm'
        ? TOGETHER_GLM_MODEL
        : process.argv[2]; // allow passing a raw/dedicated-endpoint model id
const outfile = resolve(
  process.argv[3] ?? join(here, '..', 'test', 'fixtures', `together-${which}-stream-live.sse.txt`),
);

const config = resolveTogetherConfig(process.env, { model });
const adapter = createTogetherAdapter(config);
process.stdout.write(`model: ${config.model}  quant: ${adapter.quantization}\n`);

// A prompt that should provoke a tool call so we record fragmented tool-call args.
const state = {
  system: 'You are glamfire. Use the calculator tool to do arithmetic.',
  task: { goal: 'compute (2 + 3) * 4', budget: {} },
  messages: [{ role: 'user', content: 'What is (2 + 3) * 4? Use the calculator tool.' }],
  tools: [
    {
      name: 'calculator',
      description: 'Evaluate a basic arithmetic expression.',
      permission: 'read',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string' } },
        required: ['expression'],
      },
      handler: async () => ({}),
    },
  ],
  config: {
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    temperature: 0,
  },
};

const req = adapter.encodeRequest(state, { stream: true });
const res = await fetch(req.url, {
  method: 'POST',
  headers: req.headers,
  body: JSON.stringify(req.body),
});
if (!res.ok) {
  process.stderr.write(
    `capture failed: HTTP ${res.status} ${res.statusText}\n${await res.text()}\n`,
  );
  process.exit(1);
}

const raw = await res.text();
writeFileSync(outfile, raw, 'utf8');
process.stdout.write(`wrote ${raw.length} bytes of raw SSE to ${outfile}\n`);

// Prove the committed parser reproduces this live capture.
const result = reduceStream(parseSSE(raw));
process.stdout.write(
  `parsed: ${result.toolCalls.length} tool call(s), ` +
    `${result.reasoning.length} reasoning chars, ${result.text.length} content chars, ` +
    `finish=${result.finishReason}, ` +
    `usage in=${result.usage.inputTokens} out=${result.usage.outputTokens}\n`,
);
for (const c of result.toolCalls) {
  process.stdout.write(`  -> ${c.name}(${JSON.stringify(c.arguments)})\n`);
}
