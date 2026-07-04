// Unit + regression tests for the anthropic adapter, exercised against captured
// Anthropic Messages API wire payloads (real data, not mocks). The streaming
// fixtures reproduce Claude's `input_json_delta` fragmented tool-call args and
// interleaved `thinking`/`text` blocks; usage split across message_start /
// message_delta.

import { readFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AnthropicConfig,
  createAnthropicAdapter,
  mapStopReason,
  parseAnthropicSSE,
  reduceAnthropicStream,
  resolveAnthropicConfig,
} from '@glamfire/adapters';
import type { RunState, StreamEvent, ToolSpec, Usage } from '@glamfire/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

const config: AnthropicConfig = resolveAnthropicConfig({ ANTHROPIC_API_KEY: 'test-key' });

describe('streaming: fragmented tool_use arg reassembly (input_json_delta)', () => {
  it('reassembles tool-call argument fragments across deltas', () => {
    const events = parseAnthropicSSE(fixture('anthropic-stream-toolcall.sse.txt'));
    const result = reduceAnthropicStream(events);

    expect(result.toolCalls).toHaveLength(1);
    const call = result.toolCalls[0];
    expect(call?.name).toBe('calculator');
    expect(call?.id).toBe('toolu_01Xp4mNc2gKb9YvRf7wQ3aLe');
    // Fragments "{\"expr" + "ession\": \"(2 + " + "3) * 4\"}" must rebuild.
    expect(call?.arguments).toEqual({ expression: '(2 + 3) * 4' });
    expect(result.text).toBe('Let me calculate that for you.');
    expect(result.finishReason).toBe('tool_calls');
  });

  it('reports usage split across message_start (input/cache) and message_delta (output)', () => {
    const events = parseAnthropicSSE(fixture('anthropic-stream-toolcall.sse.txt'));
    const result = reduceAnthropicStream(events);
    expect(result.usage).toEqual({
      inputTokens: 472,
      cachedInputTokens: 256,
      outputTokens: 48,
    } satisfies Usage);
  });

  it('emits live text + tool-call-started events in order', () => {
    const events = parseAnthropicSSE(fixture('anthropic-stream-toolcall.sse.txt'));
    const out: StreamEvent[] = [];
    reduceAnthropicStream(events, (ev) => out.push(ev));

    const started = out.filter((e) => e.kind === 'tool_call_started');
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      name: 'calculator',
      id: 'toolu_01Xp4mNc2gKb9YvRf7wQ3aLe',
    });
    const textIdx = out.findIndex((e) => e.kind === 'text');
    const startedIdx = out.findIndex((e) => e.kind === 'tool_call_started');
    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(textIdx).toBeLessThan(startedIdx);
  });
});

describe('streaming: thinking + plain text', () => {
  it('reassembles interleaved thinking and text blocks, ignoring signature_delta', () => {
    const events = parseAnthropicSSE(fixture('anthropic-stream-text.sse.txt'));
    const result = reduceAnthropicStream(events);

    expect(result.text).toBe('(2 + 3) * 4 equals 20.');
    expect(result.reasoning).toBe('The tool returned 20. I can answer directly now.');
    expect(result.toolCalls).toHaveLength(0);
    expect(result.finishReason).toBe('stop');
    expect(result.usage.outputTokens).toBe(15);
  });
});

describe('decodeResponse: non-streaming completion', () => {
  it('parses text, tool_use, usage, and maps stop_reason -> neutral', () => {
    const adapter = createAnthropicAdapter(config);
    const json = JSON.parse(fixture('anthropic-completion-toolcall.json'));
    const result = adapter.decodeResponse(json);

    expect(result.text).toBe("I'll compute that.");
    expect(result.toolCalls).toEqual([
      {
        id: 'toolu_01Xp4mNc2gKb9YvRf7wQ3aLe',
        name: 'calculator',
        arguments: { expression: '(2 + 3) * 4' },
      },
    ]);
    expect(result.finishReason).toBe('tool_calls');
    expect(result.usage).toEqual({
      inputTokens: 472,
      cachedInputTokens: 128,
      outputTokens: 38,
    } satisfies Usage);
  });

  it('folds cache_creation tokens into inputTokens', () => {
    const adapter = createAnthropicAdapter(config);
    const result = adapter.decodeResponse({
      content: [{ type: 'text', text: 'hi' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        cache_creation_input_tokens: 40,
        cache_read_input_tokens: 10,
        output_tokens: 5,
      },
    });
    expect(result.usage).toEqual({ inputTokens: 140, cachedInputTokens: 10, outputTokens: 5 });
  });
});

describe('stop-reason mapping', () => {
  it('maps Anthropic stop reasons to the neutral vocabulary', () => {
    expect(mapStopReason('end_turn')).toBe('stop');
    expect(mapStopReason('stop_sequence')).toBe('stop');
    expect(mapStopReason('tool_use')).toBe('tool_calls');
    expect(mapStopReason('max_tokens')).toBe('length');
    expect(mapStopReason('refusal')).toBe('refusal');
    expect(mapStopReason('pause_turn')).toBe('pause');
    expect(mapStopReason(null)).toBe('stop');
  });
});

describe('pricing (real Claude list prices)', () => {
  it('prices opus-4-8 input/output with the cache-read discount', () => {
    const adapter = createAnthropicAdapter(config); // claude-opus-4-8
    const usage: Usage = { inputTokens: 1000, cachedInputTokens: 1000, outputTokens: 1000 };
    // 1000*$5 + 1000*$5*0.1 (cache read) + 1000*$25, per 1M.
    const expected = (1000 * 5 + 1000 * 5 * 0.1 + 1000 * 25) / 1_000_000;
    expect(adapter.pricing(usage)).toBeCloseTo(expected, 12);
  });

  it('prices sonnet cheaper than opus, haiku cheaper than sonnet', () => {
    const opus = createAnthropicAdapter(config);
    const sonnet = createAnthropicAdapter({ ...config, model: 'claude-sonnet-4-6' });
    const haiku = createAnthropicAdapter({ ...config, model: 'claude-haiku-4-5' });
    const usage: Usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 1000 };
    expect(sonnet.pricing(usage)).toBeLessThan(opus.pricing(usage));
    expect(haiku.pricing(usage)).toBeLessThan(sonnet.pricing(usage));
  });

  it('falls back to opus-4-8 pricing for an unknown model', () => {
    const known = createAnthropicAdapter(config);
    const unknown = createAnthropicAdapter({ ...config, model: 'claude-unreleased-9' });
    const usage: Usage = { inputTokens: 500, cachedInputTokens: 0, outputTokens: 500 };
    expect(unknown.pricing(usage)).toBeCloseTo(known.pricing(usage), 12);
  });
});

describe('encodeRequest: neutral -> Messages API', () => {
  const tool: ToolSpec = {
    name: 'calculator',
    description: 'do math',
    permission: 'read',
    parameters: { type: 'object', properties: { expression: { type: 'string' } } },
    handler: async () => ({}),
  };
  const state: RunState = {
    system: 'You are glamfire.',
    task: { goal: 'compute', budget: {} },
    messages: [
      { role: 'user', content: 'what is 2+2?' },
      {
        role: 'assistant',
        content: '',
        reasoning: 'think',
        toolCalls: [{ id: 'call_1', name: 'calculator', arguments: { expression: '2+2' } }],
      },
      { role: 'tool', callId: 'call_1', name: 'calculator', content: '{"result":4}' },
    ],
    tools: [tool],
    config: { model: 'claude-opus-4-8', maxTokens: 1024 },
  };

  it('shapes top-level system, tool grammar, and threaded tool_result blocks', () => {
    const adapter = createAnthropicAdapter(config);
    const req = adapter.encodeRequest(state, { stream: true });

    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers['x-api-key']).toBe('test-key');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    expect(req.headers['content-type']).toBe('application/json');

    const body = req.body as Record<string, unknown>;
    // System is a TOP-LEVEL field, not a message.
    expect(body.system).toBe('You are glamfire.');
    expect(body.max_tokens).toBe(1024);
    expect(body.stream).toBe(true);
    // No temperature on Opus 4.8 by default (the API would 400 on it).
    expect(body.temperature).toBeUndefined();
    expect(body.output_config).toBeUndefined();

    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0]).toEqual({ role: 'user', content: 'what is 2+2?' });

    // assistant tool call -> tool_use content block.
    const asst = messages[1];
    expect(asst?.role).toBe('assistant');
    const asstContent = asst?.content as Array<Record<string, unknown>>;
    expect(asstContent[0]).toEqual({
      type: 'tool_use',
      id: 'call_1',
      name: 'calculator',
      input: { expression: '2+2' },
    });

    // tool result -> tool_result block in a USER message, threaded by id.
    const toolMsg = messages[2];
    expect(toolMsg?.role).toBe('user');
    const trContent = toolMsg?.content as Array<Record<string, unknown>>;
    expect(trContent[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'call_1',
      content: '{"result":4}',
    });

    // tools use input_schema, not function.parameters.
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools[0]?.name).toBe('calculator');
    expect(tools[0]?.input_schema).toEqual(tool.parameters);
  });

  it('omits system when empty and sends effort/temperature when configured', () => {
    const adapter = createAnthropicAdapter({
      ...config,
      temperature: 0.5,
      effort: 'high',
      model: 'claude-sonnet-4-6',
    });
    const bare: RunState = { ...state, system: '', config: { model: 'claude-sonnet-4-6' } };
    const body = adapter.encodeRequest(bare).body as Record<string, unknown>;
    expect(body.system).toBeUndefined();
    expect(body.temperature).toBe(0.5);
    expect(body.output_config).toEqual({ effort: 'high' });
    expect(body.stream).toBe(false);
  });

  it('merges consecutive tool results into a single user message', () => {
    const adapter = createAnthropicAdapter(config);
    const multi: RunState = {
      ...state,
      messages: [
        { role: 'user', content: 'weather in Paris and London?' },
        {
          role: 'assistant',
          content: '',
          reasoning: '',
          toolCalls: [
            { id: 'c1', name: 'get_weather', arguments: { city: 'Paris' } },
            { id: 'c2', name: 'get_weather', arguments: { city: 'London' } },
          ],
        },
        { role: 'tool', callId: 'c1', name: 'get_weather', content: 'sunny' },
        { role: 'tool', callId: 'c2', name: 'get_weather', content: 'rainy' },
      ],
    };
    const body = adapter.encodeRequest(multi).body as Record<string, unknown>;
    const messages = body.messages as Array<Record<string, unknown>>;
    // user, assistant, ONE user message carrying both tool_result blocks.
    expect(messages).toHaveLength(3);
    const results = messages[2]?.content as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.tool_use_id)).toEqual(['c1', 'c2']);
  });
});

describe('config resolution', () => {
  it('applies documented defaults', () => {
    const c = resolveAnthropicConfig({ ANTHROPIC_API_KEY: 'k' });
    expect(c.model).toBe('claude-opus-4-8');
    expect(c.baseUrl).toBe('https://api.anthropic.com');
    expect(c.apiVersion).toBe('2023-06-01');
    expect(c.maxTokens).toBe(4096);
    expect(c.temperature).toBeUndefined();
    expect(c.effort).toBeUndefined();
  });

  it('lets overrides win over env', () => {
    const c = resolveAnthropicConfig(
      { ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'env-model' },
      { model: 'flag-model', maxTokens: 2000, effort: 'max' },
    );
    expect(c.model).toBe('flag-model');
    expect(c.maxTokens).toBe(2000);
    expect(c.effort).toBe('max');
  });

  it('throws a clear error when the API key is missing', () => {
    expect(() => resolveAnthropicConfig({})).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it('rejects an invalid effort level', () => {
    expect(() =>
      resolveAnthropicConfig({ ANTHROPIC_API_KEY: 'k' }, { effort: 'turbo' as never }),
    ).toThrow(/invalid Anthropic configuration/);
  });
});

// --- real HTTP streaming transport -------------------------------------------
// A loopback server replays a captured Messages SSE response in tiny 7-byte
// slices (splitting input_json_delta fragments mid-line) to prove the adapter
// reassembles correctly over a real socket. Recorded provider bytes; the live
// model call is covered by MANUAL-VERIFY.md.

describe('AnthropicAdapter.stream over real HTTP', () => {
  let server: Server;
  let baseUrl: string;
  const sse = fixture('anthropic-stream-toolcall.sse.txt');

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
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
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('reassembles a fragmented tool call streamed over a socket', async () => {
    const cfg = resolveAnthropicConfig({ ANTHROPIC_API_KEY: 'test-key' }, { baseUrl });
    const adapter = createAnthropicAdapter(cfg);
    const state: RunState = {
      system: 'sys',
      task: { goal: 'compute', budget: {} },
      messages: [{ role: 'user', content: 'compute (2 + 3) * 4' }],
      tools: [],
      config: { model: cfg.model },
    };

    const events: StreamEvent[] = [];
    const result = await adapter.stream(state, (ev) => events.push(ev));

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'calculator',
      arguments: { expression: '(2 + 3) * 4' },
    });
    expect(result.text).toBe('Let me calculate that for you.');
    expect(result.usage).toEqual({ inputTokens: 472, cachedInputTokens: 256, outputTokens: 48 });
    expect(events.some((e) => e.kind === 'tool_call_started')).toBe(true);
  });
});

describe('provider identity (issue #24)', () => {
  it('declares provider "anthropic"', () => {
    expect(createAnthropicAdapter(config).provider).toBe('anthropic');
  });
});
