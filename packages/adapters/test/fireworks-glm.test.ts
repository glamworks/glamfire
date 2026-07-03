// Unit + regression tests for the fireworks-glm adapter, exercised against
// captured OpenAI-compatible Fireworks wire payloads (real data, not mocks).
// The streaming fixtures reproduce GLM-5.2's two quirks: fragmented tool-call
// arguments and interleaved reasoning tokens (research/01).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIREWORKS_DEEPSEEK_FLASH_MODEL,
  FIREWORKS_DEEPSEEK_PRO_MODEL,
  type FireworksConfig,
  createFireworksGlmAdapter,
  fireworksModelInfo,
  fireworksWireServiceTier,
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

    // GLM/Fireworks knobs. The default internal tier `standard` maps to
    // Fireworks' default cheapest on-demand tier, which is the OMISSION of the
    // wire field — sending the literal `standard` is rejected HTTP 400.
    expect(body.reasoning_effort).toBe('high');
    expect(body).not.toHaveProperty('service_tier');
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.tool_choice).toBe('auto');

    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools[0].type).toBe('function');
    expect((tools[0].function as Record<string, unknown>).name).toBe('calculator');
  });
});

describe('service_tier: internal -> Fireworks wire translation', () => {
  // Fireworks accepts only `auto | default | flex | priority` as the wire
  // `service_tier`; our internal vocabulary is `standard | priority | fast |
  // background`. The default `standard` must OMIT the field (Fireworks' default
  // cheapest on-demand tier) — sending the literal `standard` is HTTP 400.
  it('maps every internal tier to a valid wire value (or omit)', () => {
    expect(fireworksWireServiceTier('standard')).toBeUndefined();
    expect(fireworksWireServiceTier('background')).toBe('flex');
    expect(fireworksWireServiceTier('priority')).toBe('priority');
    // `fast` has no distinct wire tier — it aliases the priority-speed tier.
    expect(fireworksWireServiceTier('fast')).toBe('priority');
  });

  it('never forwards an invalid internal tier to the wire', () => {
    // Defense-in-depth: anything outside the enum is omitted, not sent raw.
    expect(fireworksWireServiceTier('turbo')).toBeUndefined();
    expect(fireworksWireServiceTier(undefined)).toBeUndefined();
    expect(fireworksWireServiceTier('')).toBeUndefined();
  });

  // Drive the mapping through the REAL request body the adapter would send.
  const minimalState = (tier: FireworksConfig['serviceTier']): RunState => ({
    system: 'You are glamfire.',
    task: { goal: 'compute', budget: {} },
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    config: {
      model: 'accounts/fireworks/models/glm-5p2',
      reasoningEffort: 'high',
      serviceTier: tier,
      temperature: 0.2,
    },
  });

  const wireTierOf = (tier: FireworksConfig['serviceTier']): unknown => {
    // Both the spec default (adapter built from config) and the runtime override
    // (state.config.serviceTier) carry the internal tier; assert the wire body.
    const adapter = createFireworksGlmAdapter({ ...config, serviceTier: tier });
    const body = adapter.encodeRequest(minimalState(tier)).body as Record<string, unknown>;
    return Object.hasOwn(body, 'service_tier') ? body.service_tier : Symbol.for('omitted');
  };

  const OMITTED = Symbol.for('omitted');

  it('omits service_tier for the default `standard` tier', () => {
    expect(wireTierOf('standard')).toBe(OMITTED);
  });

  it('sends `flex` for `background`', () => {
    expect(wireTierOf('background')).toBe('flex');
  });

  it('sends `priority` for `priority`', () => {
    expect(wireTierOf('priority')).toBe('priority');
  });

  it('sends `priority` for `fast` (alias of the priority-speed wire tier)', () => {
    expect(wireTierOf('fast')).toBe('priority');
  });

  it('translates a runtime override that differs from the adapter default', () => {
    // Adapter built as `standard`, but the per-run runtime config asks for
    // `background`: the runtime override wins and is translated to `flex`.
    const adapter = createFireworksGlmAdapter(config); // standard default
    const state = minimalState('background');
    const body = adapter.encodeRequest(state).body as Record<string, unknown>;
    expect(body.service_tier).toBe('flex');
  });
});

describe('per-model table: DeepSeek-V4 on Fireworks (research/25)', () => {
  const proConfig = resolveFireworksConfig(
    { FIREWORKS_API_KEY: 'test-key' },
    { model: FIREWORKS_DEEPSEEK_PRO_MODEL },
  );
  const flashConfig = resolveFireworksConfig(
    { FIREWORKS_API_KEY: 'test-key' },
    { model: FIREWORKS_DEEPSEEK_FLASH_MODEL },
  );

  it('declares the live-verified DeepSeek capability surface (1M ctx, tools, FP8)', () => {
    for (const cfg of [proConfig, flashConfig]) {
      const adapter = createFireworksGlmAdapter(cfg);
      expect(adapter.capabilities.contextWindow).toBe(1_048_576);
      expect(adapter.capabilities.toolCalling).toBe(true);
      expect(adapter.capabilities.parallelToolCalls).toBe(true);
      expect(adapter.quantization).toBe('FP8');
      expect(adapter.modelInfo.thinking).toBe(true);
    }
  });

  it('prices DeepSeek-V4-Pro from the Fireworks serverless table ($1.74/$0.145/$3.48)', () => {
    const adapter = createFireworksGlmAdapter(proConfig); // standard tier
    const usage: Usage = {
      inputTokens: 1_000_000,
      cachedInputTokens: 250_000,
      outputTokens: 100_000,
    };
    const expected = (750_000 * 1.74 + 250_000 * 0.145 + 100_000 * 3.48) / 1_000_000;
    expect(adapter.pricing(usage)).toBeCloseTo(expected, 10);
  });

  it('prices DeepSeek-V4-Flash as the budget tier ($0.14/$0.028/$0.28), 10x under GLM', () => {
    const flash = createFireworksGlmAdapter(flashConfig);
    const glm = createFireworksGlmAdapter(config);
    const usage: Usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 1000 };
    expect(flash.pricing(usage)).toBeCloseTo((1000 * 0.14 + 1000 * 0.28) / 1_000_000, 12);
    expect(flash.pricing(usage) * 10 < glm.pricing(usage)).toBe(true);
  });

  it('sends reasoning_effort for DeepSeek (thinking model, verified live)', () => {
    const adapter = createFireworksGlmAdapter(proConfig);
    const body = adapter.encodeRequest({
      system: 'You are glamfire.',
      task: { goal: 'compute', budget: {} },
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      config: { model: FIREWORKS_DEEPSEEK_PRO_MODEL, reasoningEffort: 'high' },
    }).body as Record<string, unknown>;
    expect(body.reasoning_effort).toBe('high');
    expect(body.model).toBe(FIREWORKS_DEEPSEEK_PRO_MODEL);
  });

  it('decodes the LIVE-captured DeepSeek-V4-Pro tool-call completion', () => {
    const adapter = createFireworksGlmAdapter(proConfig);
    const result = adapter.decodeResponse(
      JSON.parse(fixture('deepseek-pro-completion-toolcall.json')),
    );
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('calculator');
    expect(result.toolCalls[0].arguments).toEqual({ expression: '(2 + 3) * 4' });
    expect(result.finishReason).toBe('tool_calls');
    expect(result.reasoning.length).toBeGreaterThan(0); // thinking model, real trace
  });

  it('fails loud for a Fireworks model with no verified entry (no faked pricing)', () => {
    const c = resolveFireworksConfig(
      { FIREWORKS_API_KEY: 'test-key' },
      { model: 'accounts/fireworks/models/made-up' },
    );
    expect(() => createFireworksGlmAdapter(c)).toThrow(/unsupported Fireworks model/);
    expect(() => fireworksModelInfo('nope')).toThrow(/unsupported Fireworks model "nope"/);
  });

  it('fails loud when asked for a tier Fireworks does not offer for Flash', () => {
    // Fireworks lists NO Priority tier for DeepSeek-V4-Flash; the adapter must
    // refuse rather than bill an invented rate.
    const c = resolveFireworksConfig(
      { FIREWORKS_API_KEY: 'test-key' },
      { model: FIREWORKS_DEEPSEEK_FLASH_MODEL, serviceTier: 'priority' },
    );
    expect(() => createFireworksGlmAdapter(c)).toThrow(
      /does not offer the "priority" service tier/,
    );
    // ...while the offered tiers construct fine.
    expect(() => createFireworksGlmAdapter({ ...c, serviceTier: 'standard' })).not.toThrow();
    expect(() => createFireworksGlmAdapter({ ...c, serviceTier: 'background' })).not.toThrow();
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

describe('provider identity (issue #24 — the run header must show the serving provider)', () => {
  it('declares provider "fireworks", distinct from the shared adapter id', () => {
    const adapter = createFireworksGlmAdapter(config);
    expect(adapter.id).toBe('fireworks-glm');
    expect(adapter.provider).toBe('fireworks');
  });

  it('keeps provider "fireworks" for DeepSeek models served through the shared adapter', () => {
    const flash = createFireworksGlmAdapter(
      resolveFireworksConfig(
        { FIREWORKS_API_KEY: 'test-key' },
        { model: FIREWORKS_DEEPSEEK_FLASH_MODEL },
      ),
    );
    expect(flash.provider).toBe('fireworks');
    const pro = createFireworksGlmAdapter(
      resolveFireworksConfig(
        { FIREWORKS_API_KEY: 'test-key' },
        { model: FIREWORKS_DEEPSEEK_PRO_MODEL },
      ),
    );
    expect(pro.provider).toBe('fireworks');
  });
});
