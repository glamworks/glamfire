// Unit + regression tests for the fireworks-glm adapter, exercised against
// captured OpenAI-compatible Fireworks wire payloads (real data, not mocks).
// The streaming fixtures reproduce GLM-5.2's two quirks: fragmented tool-call
// arguments and interleaved reasoning tokens (research/01).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type FireworksConfig,
  createFireworksGlmAdapter,
  parseSSE,
  reduceStream,
  resolveFireworksConfig,
} from '@glamfire/adapters';
import type { RunState, StreamEvent, ToolSpec, Usage } from '@glamfire/engine';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

const config: FireworksConfig = resolveFireworksConfig({ FIREWORKS_API_KEY: 'test-key' });

describe('streaming: fragmented tool-call reassembly', () => {
  it('reassembles tool-call argument fragments across deltas', () => {
    const chunks = parseSSE(fixture('glm-stream-toolcall.sse.txt'));
    const result = reduceStream(chunks);

    expect(result.toolCalls).toHaveLength(1);
    const call = result.toolCalls[0];
    expect(call.name).toBe('calculator');
    expect(call.id).toBe('call_abc123');
    // The fragments "{\"expr" + "ession\": \"(2 + " + "3) * 4\"}" must rebuild
    // into a single valid JSON object.
    expect(call.arguments).toEqual({ expression: '(2 + 3) * 4' });
    expect(result.finishReason).toBe('tool_calls');
  });

  it('reassembles interleaved reasoning tokens and parses usage', () => {
    const chunks = parseSSE(fixture('glm-stream-toolcall.sse.txt'));
    const result = reduceStream(chunks);

    expect(result.reasoning).toBe(
      "The user wants me to compute (2 + 3) * 4. I'll use the calculator tool.",
    );
    expect(result.usage).toEqual({
      inputTokens: 312,
      cachedInputTokens: 256,
      outputTokens: 48,
    } satisfies Usage);
  });

  it('emits live token + tool-call-started events in order', () => {
    const chunks = parseSSE(fixture('glm-stream-toolcall.sse.txt'));
    const events: StreamEvent[] = [];
    reduceStream(chunks, (ev) => events.push(ev));

    const started = events.filter((e) => e.kind === 'tool_call_started');
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ name: 'calculator', id: 'call_abc123' });
    // Reasoning is emitted before the tool call starts (interleaved thinking).
    const reasoningIdx = events.findIndex((e) => e.kind === 'reasoning');
    const startedIdx = events.findIndex((e) => e.kind === 'tool_call_started');
    expect(reasoningIdx).toBeGreaterThanOrEqual(0);
    expect(reasoningIdx).toBeLessThan(startedIdx);
  });
});

describe('streaming: plain text answer', () => {
  it('reassembles content fragments and reports no tool calls', () => {
    const chunks = parseSSE(fixture('glm-stream-text.sse.txt'));
    const result = reduceStream(chunks);

    expect(result.text).toBe('(2 + 3) * 4 equals 20.');
    expect(result.reasoning).toBe('The tool returned 20. I can answer directly now.');
    expect(result.toolCalls).toHaveLength(0);
    expect(result.finishReason).toBe('stop');
    expect(result.usage.outputTokens).toBe(12);
  });
});

describe('decodeResponse: non-streaming completion', () => {
  it('parses content, reasoning, usage, and stop reason', () => {
    const adapter = createFireworksGlmAdapter(config);
    const json = JSON.parse(fixture('glm-completion.json'));
    const result = adapter.decodeResponse(json);

    expect(result.text).toBe('(2 + 3) * 4 equals 20.');
    expect(result.reasoning).toBe('Computed (2+3)=5, then 5*4=20.');
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toEqual({
      inputTokens: 256,
      cachedInputTokens: 128,
      outputTokens: 14,
    } satisfies Usage);
  });
});

describe('pricing (research/02 numbers)', () => {
  it('prices standard tier with the cached-input discount', () => {
    const adapter = createFireworksGlmAdapter(config); // standard
    // 256 cached + 56 uncached input, 48 output.
    const usage: Usage = { inputTokens: 312, cachedInputTokens: 256, outputTokens: 48 };
    const expected = (56 * 1.4 + 256 * 0.14 + 48 * 4.4) / 1_000_000;
    expect(adapter.pricing(usage)).toBeCloseTo(expected, 12);
  });

  it('prices priority tier higher than standard', () => {
    const std = createFireworksGlmAdapter(config);
    const pri = createFireworksGlmAdapter({ ...config, serviceTier: 'priority' });
    const usage: Usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 1000 };
    expect(pri.pricing(usage)).toBeGreaterThan(std.pricing(usage));
  });
});

describe('encodeRequest: neutral -> OpenAI function-call grammar', () => {
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
    config: {
      model: 'accounts/fireworks/models/glm-5p2',
      reasoningEffort: 'high',
      serviceTier: 'standard',
      temperature: 0.2,
    },
  };

  it('shapes the request body with system-first messages, tools, and GLM knobs', () => {
    const adapter = createFireworksGlmAdapter(config);
    const req = adapter.encodeRequest(state, { stream: true });

    expect(req.url).toBe('https://api.fireworks.ai/inference/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer test-key');

    const body = req.body as Record<string, unknown>;
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0]).toEqual({ role: 'system', content: 'You are glamfire.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'what is 2+2?' });

    // assistant tool call re-emitted into OpenAI grammar (arguments as a string).
    const asst = messages[2];
    expect(asst.role).toBe('assistant');
    const tcs = asst.tool_calls as Array<Record<string, unknown>>;
    expect(tcs[0].id).toBe('call_1');
    expect((tcs[0].function as Record<string, unknown>).arguments).toBe('{"expression":"2+2"}');

    // tool result threaded back by tool_call_id.
    expect(messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      name: 'calculator',
      content: '{"result":4}',
    });

    // GLM/Fireworks knobs.
    expect(body.reasoning_effort).toBe('high');
    expect(body.service_tier).toBe('standard');
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.tool_choice).toBe('auto');

    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools[0].type).toBe('function');
    expect((tools[0].function as Record<string, unknown>).name).toBe('calculator');
  });
});

describe('config resolution', () => {
  it('applies documented defaults', () => {
    const c = resolveFireworksConfig({ FIREWORKS_API_KEY: 'k' });
    expect(c.model).toBe('accounts/fireworks/models/glm-5p2');
    expect(c.baseUrl).toBe('https://api.fireworks.ai/inference/v1');
    expect(c.reasoningEffort).toBe('high');
    expect(c.serviceTier).toBe('standard');
    expect(c.temperature).toBe(0.2);
  });

  it('lets overrides win over env', () => {
    const c = resolveFireworksConfig(
      { FIREWORKS_API_KEY: 'k', FIREWORKS_MODEL: 'env-model' },
      { model: 'flag-model', serviceTier: 'fast', reasoningEffort: 'max' },
    );
    expect(c.model).toBe('flag-model');
    expect(c.serviceTier).toBe('fast');
    expect(c.reasoningEffort).toBe('max');
  });

  it('throws a clear error when the API key is missing', () => {
    expect(() => resolveFireworksConfig({})).toThrow(/FIREWORKS_API_KEY is not set/);
  });

  it('rejects an invalid service tier', () => {
    expect(() =>
      resolveFireworksConfig({ FIREWORKS_API_KEY: 'k' }, { serviceTier: 'turbo' as never }),
    ).toThrow(/invalid Fireworks configuration/);
  });
});
