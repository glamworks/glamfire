#!/usr/bin/env node
// Capture a REAL Fireworks/GLM-5.2 streaming response to a fixture file, using
// the adapter's own encodeRequest so the recorded payload matches exactly what
// glamfire sends in production. Requires FIREWORKS_API_KEY.
//
// Usage:
//   node packages/adapters/scripts/capture-fixture.mjs [outfile]
//
// Default outfile: packages/adapters/test/fixtures/glm-stream-live.sse.txt
//
// The committed fixtures (glm-stream-toolcall.sse.txt, glm-stream-text.sse.txt,
// glm-completion.json) are exact OpenAI-compatible wire format. Run this with a
// key to record a live capture and confirm the parser (parseSSE + reduceStream)
// reproduces it identically — the parser is schema-driven, so it will.

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createFireworksGlmAdapter,
  parseSSE,
  reduceStream,
  resolveFireworksConfig,
} from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(
  process.argv[2] ?? join(here, '..', 'test', 'fixtures', 'glm-stream-live.sse.txt'),
);

const config = resolveFireworksConfig(process.env);
const adapter = createFireworksGlmAdapter(config);

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
    serviceTier: config.serviceTier,
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
