#!/usr/bin/env node
// Capture the FULL set of REAL local-server wire fixtures used by the
// conformance battery, using the local adapter's own encodeRequest so every
// recorded payload matches exactly what glamfire sends in production. Runs
// against a REAL local OpenAI-compatible server — Ollama by default (issue
// #25; the same wire contract covers vLLM, SGLang, LM Studio, and
// DwarfStar/DS4). No API key required.
//
// Usage:
//   GLAM_LOCAL_BASE_URL=http://localhost:11434/v1 GLAM_LOCAL_MODEL=qwen3:0.6b \
//     node packages/adapters/scripts/capture-local-fixtures.mjs [prefix]
//
// Captures (default prefix: ollama):
//   <prefix>-completion-toolcall.json    non-streaming calculator call
//   <prefix>-completion-multitool.json   non-streaming parallel get_weather
//   <prefix>-completion-json.json        non-streaming JSON document answer
//   <prefix>-stream-toolcall.sse.txt     streamed fragmented tool call
//   <prefix>-stream-text.sse.txt         streamed plain-text answer
//
// The committed ollama-* fixtures were produced by this script against a live
// Ollama daemon serving qwen3:0.6b (the smallest real tool-calling model).

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OLLAMA_DEFAULT_BASE_URL,
  createLocalAdapter,
  parseSSE,
  reduceStream,
  resolveLocalConfig,
} from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'test', 'fixtures');
const prefix = process.argv[2] ?? 'ollama';

const config = resolveLocalConfig(
  {
    GLAM_LOCAL_BASE_URL: OLLAMA_DEFAULT_BASE_URL,
    GLAM_LOCAL_MODEL: 'qwen3:0.6b',
    ...process.env,
  },
  {},
);
const adapter = createLocalAdapter(config);
process.stdout.write(`endpoint: ${config.baseUrl}  model: ${config.model}\n`);

const calculator = {
  name: 'calculator',
  description: 'Evaluate a basic arithmetic expression.',
  permission: 'read',
  parameters: {
    type: 'object',
    properties: { expression: { type: 'string' } },
    required: ['expression'],
  },
  handler: async () => ({}),
};
const getWeather = {
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  permission: 'read',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
  handler: async () => ({}),
};

function state(user, tools) {
  return {
    system: 'You are glamfire, routing to the cheapest capable model. /no_think',
    task: { goal: user, budget: {} },
    messages: [{ role: 'user', content: user }],
    tools,
    config: {
      model: config.model,
      temperature: 0,
      seed: 42,
      maxTokens: 2048,
    },
  };
}

async function call(runState, { stream }) {
  const req = adapter.encodeRequest(runState, { stream });
  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(req.body),
  });
  if (!res.ok) {
    process.stderr.write(
      `capture failed: HTTP ${res.status} ${res.statusText}\n${await res.text()}\nIs the local server running? (ollama serve / vllm serve / LM Studio)\n`,
    );
    process.exit(1);
  }
  return res.text();
}

function summarize(label, result) {
  process.stdout.write(
    `${label}: ${result.toolCalls.length} tool call(s), ` +
      `${result.reasoning.length} reasoning chars, ${result.text.length} content chars, ` +
      `finish=${result.finishReason}, ` +
      `usage in=${result.usage.inputTokens} cached=${result.usage.cachedInputTokens} ` +
      `out=${result.usage.outputTokens}\n`,
  );
  for (const c of result.toolCalls) {
    process.stdout.write(`  -> ${c.id} ${c.name}(${JSON.stringify(c.arguments)})\n`);
  }
  if (result.text) process.stdout.write(`  text: ${JSON.stringify(result.text.slice(0, 120))}\n`);
}

// Pretty-print captured completion JSON (identical parsed wire data; keeps the
// committed fixture Biome-format-clean).
const pretty = (raw) => `${JSON.stringify(JSON.parse(raw), null, 2)}\n`;

// 1. Non-streaming single tool call. NOTE: a 0.6B model at temperature 0 does
// arithmetic in its head instead of calling a calculator, but it CANNOT know
// the weather — so the single-tool fixture uses get_weather (a task the model
// can only solve by really calling the tool). The calculator tool still
// exercises the encode path via the shared sampleState in the battery.
const TOOLCALL_PROMPT = 'What is the current weather in Paris? Use the get_weather tool.';
{
  const raw = await call(state(TOOLCALL_PROMPT, [getWeather]), {
    stream: false,
  });
  const file = join(fixtures, `${prefix}-completion-toolcall.json`);
  writeFileSync(file, pretty(raw), 'utf8');
  summarize(`completion-toolcall -> ${file}`, adapter.decodeResponse(JSON.parse(raw)));
}

// 2. Non-streaming parallel multi-tool call.
{
  const raw = await call(
    state(
      'Get the weather for BOTH Paris and London using the get_weather tool. Call it once per city, in parallel.',
      [getWeather],
    ),
    { stream: false },
  );
  const file = join(fixtures, `${prefix}-completion-multitool.json`);
  writeFileSync(file, pretty(raw), 'utf8');
  summarize(`completion-multitool -> ${file}`, adapter.decodeResponse(JSON.parse(raw)));
}

// 3. Non-streaming JSON document answer.
{
  const raw = await call(
    state(
      'Respond with ONLY this exact JSON object and nothing else (no code fences, no prose): {"answer": 20, "unit": "none"}',
      [],
    ),
    { stream: false },
  );
  const file = join(fixtures, `${prefix}-completion-json.json`);
  writeFileSync(file, pretty(raw), 'utf8');
  summarize(`completion-json -> ${file}`, adapter.decodeResponse(JSON.parse(raw)));
}

// 4. Streamed fragmented tool call.
{
  const raw = await call(state(TOOLCALL_PROMPT, [getWeather]), {
    stream: true,
  });
  const file = join(fixtures, `${prefix}-stream-toolcall.sse.txt`);
  writeFileSync(file, raw, 'utf8');
  summarize(`stream-toolcall -> ${file}`, reduceStream(parseSSE(raw)));
}

// 5. Streamed plain-text answer.
{
  const raw = await call(
    state(
      'In one short sentence using the exact phrase "equals 20", state what (2 + 3) * 4 evaluates to.',
      [],
    ),
    { stream: true },
  );
  const file = join(fixtures, `${prefix}-stream-text.sse.txt`);
  writeFileSync(file, raw, 'utf8');
  summarize(`stream-text -> ${file}`, reduceStream(parseSSE(raw)));
}
