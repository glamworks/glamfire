// Exercises the adapter's REAL streaming transport: fetch -> TextDecoder ->
// incremental SSE line buffering -> StreamAccumulator. A loopback HTTP server
// replays a captured Fireworks SSE response in deliberately awkward byte chunks
// (splitting tool-call argument fragments mid-line) to prove the adapter
// reassembles correctly over a real socket. This replays recorded provider
// bytes; the live model call is covered by MANUAL-VERIFY.md.

import { readFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFireworksGlmAdapter, resolveFireworksConfig } from '@glamfire/adapters';
import type { RunState, StreamEvent } from '@glamfire/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const sse = readFileSync(join(here, 'fixtures', 'glm-stream-toolcall.sse.txt'), 'utf8');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    // Stream the bytes in tiny 7-byte slices so SSE lines (and the tool-call
    // argument fragments inside them) are split across network reads.
    const bytes = Buffer.from(sse, 'utf8');
    let i = 0;
    const tick = () => {
      if (i >= bytes.length) {
        res.end();
        return;
      }
      res.write(bytes.subarray(i, i + 7));
      i += 7;
      setImmediate(tick);
    };
    tick();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/v1`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('FireworksGlmAdapter.stream over real HTTP', () => {
  it('reassembles a fragmented tool call streamed over a socket', async () => {
    const config = resolveFireworksConfig({ FIREWORKS_API_KEY: 'test-key' }, { baseUrl });
    const adapter = createFireworksGlmAdapter(config);
    const state: RunState = {
      system: 'sys',
      task: { goal: 'compute', budget: {} },
      messages: [{ role: 'user', content: 'compute (2 + 3) * 4' }],
      tools: [],
      config: { model: config.model },
    };

    const events: StreamEvent[] = [];
    const result = await adapter.stream(state, (ev) => events.push(ev));

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'calculator',
      arguments: { expression: '(2 + 3) * 4' },
    });
    expect(result.reasoning).toContain("I'll use the calculator tool.");
    expect(result.usage).toEqual({ inputTokens: 312, cachedInputTokens: 256, outputTokens: 48 });
    expect(events.some((e) => e.kind === 'tool_call_started')).toBe(true);
  });
});
