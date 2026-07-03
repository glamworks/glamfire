#!/usr/bin/env node
// Capture the FULL set of REAL Fireworks DeepSeek-V4 wire fixtures used by the
// conformance battery, using the adapter's own encodeRequest so every recorded
// payload matches exactly what glamfire sends in production. Requires
// FIREWORKS_API_KEY. The committed fixtures under test/fixtures/deepseek-* were
// produced by this script against the live API (2026-07-03) — re-run it any
// time to refresh them and confirm the committed parser reproduces the wire.
//
// Usage:
//   node packages/adapters/scripts/capture-deepseek-fixtures.mjs [pro|flash]
//
// Captures, per model (default: pro):
//   deepseek-<which>-completion-toolcall.json    non-streaming calculator call
//   deepseek-<which>-completion-multitool.json   non-streaming parallel get_weather
//   deepseek-<which>-completion-json.json        non-streaming JSON document answer
//   deepseek-<which>-stream-toolcall.sse.txt     streamed fragmented tool call
//   deepseek-<which>-stream-text.sse.txt         streamed plain-text answer

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIREWORKS_DEEPSEEK_FLASH_MODEL,
  FIREWORKS_DEEPSEEK_PRO_MODEL,
  createFireworksGlmAdapter,
  parseSSE,
  reduceStream,
  resolveFireworksConfig,
} from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'test', 'fixtures');
const which = (process.argv[2] ?? 'pro').toLowerCase();
if (which !== 'pro' && which !== 'flash') {
  process.stderr.write(`usage: capture-deepseek-fixtures.mjs [pro|flash] (got "${which}")\n`);
  process.exit(2);
}
const model = which === 'flash' ? FIREWORKS_DEEPSEEK_FLASH_MODEL : FIREWORKS_DEEPSEEK_PRO_MODEL;

const config = resolveFireworksConfig(process.env, { model });
const adapter = createFireworksGlmAdapter(config);
process.stdout.write(`model: ${config.model}  quant: ${adapter.quantization}\n`);

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
    system: 'You are glamfire, routing to the cheapest capable model.',
    task: { goal: user, budget: {} },
    messages: [{ role: 'user', content: user }],
    tools,
    config: {
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      serviceTier: config.serviceTier,
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
      `capture failed: HTTP ${res.status} ${res.statusText}\n${await res.text()}\n`,
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

// 1. Non-streaming single tool call.
{
  const raw = await call(state('What is (2 + 3) * 4? Use the calculator tool.', [calculator]), {
    stream: false,
  });
  const file = join(fixtures, `deepseek-${which}-completion-toolcall.json`);
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
  const file = join(fixtures, `deepseek-${which}-completion-multitool.json`);
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
  const file = join(fixtures, `deepseek-${which}-completion-json.json`);
  writeFileSync(file, pretty(raw), 'utf8');
  summarize(`completion-json -> ${file}`, adapter.decodeResponse(JSON.parse(raw)));
}

// 4. Streamed fragmented tool call.
{
  const raw = await call(state('What is (2 + 3) * 4? Use the calculator tool.', [calculator]), {
    stream: true,
  });
  const file = join(fixtures, `deepseek-${which}-stream-toolcall.sse.txt`);
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
  const file = join(fixtures, `deepseek-${which}-stream-text.sse.txt`);
  writeFileSync(file, raw, 'utf8');
  summarize(`stream-text -> ${file}`, reduceStream(parseSSE(raw)));
}
