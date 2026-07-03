// Unit + regression tests for the `together` adapter, exercised against captured
// OpenAI-compatible Together AI wire payloads (real wire format, not mocks). Two
// models share the adapter:
//   - GLM-5.2 (zai-org/GLM-5.2)        — thinking, FP4, sends reasoning_effort.
//   - Qwen3-Coder-Next                 — non-thinking, FP8, NO reasoning_effort.
// The streaming fixtures reproduce the OpenAI-compatible tool-call fragment quirk
// for BOTH models (research/23 §3).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOGETHER_DEEPSEEK_MODEL,
  TOGETHER_GLM_MODEL,
  TOGETHER_QWEN_MODEL,
  type TogetherConfig,
  createTogetherAdapter,
  parseSSE,
  reduceStream,
  resolveTogetherConfig,
} from '@glamfire/adapters';
import type { RunState, StreamEvent, ToolSpec, Usage } from '@glamfire/engine';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

const glmConfig: TogetherConfig = resolveTogetherConfig(
  { TOGETHER_API_KEY: 'test-key' },
  { model: TOGETHER_GLM_MODEL },
);
const qwenConfig: TogetherConfig = resolveTogetherConfig(
  { TOGETHER_API_KEY: 'test-key' },
  { model: TOGETHER_QWEN_MODEL },
);
const deepseekConfig: TogetherConfig = resolveTogetherConfig(
  { TOGETHER_API_KEY: 'test-key' },
  { model: TOGETHER_DEEPSEEK_MODEL },
);

describe('streaming: GLM-5.2 on Together (thinking, fragmented tool args)', () => {
  it('reassembles tool-call argument fragments and interleaved reasoning', () => {
    const result = reduceStream(parseSSE(fixture('together-glm-stream-toolcall.sse.txt')));
    expect(result.toolCalls).toHaveLength(1);
    const call = result.toolCalls[0];
    expect(call.name).toBe('calculator');
    expect(call.id).toBe('call_tg_glm_str1');
    expect(call.arguments).toEqual({ expression: '(2 + 3) * 4' });
    expect(result.reasoning).toBe(
      "The user wants me to compute (2 + 3) * 4. I'll use the calculator tool.",
    );
    expect(result.finishReason).toBe('tool_calls');
    expect(result.usage).toEqual({
      inputTokens: 300,
      cachedInputTokens: 240,
      outputTokens: 45,
    } satisfies Usage);
  });
});

describe('streaming: Qwen3-Coder-Next on Together (non-thinking)', () => {
  it('reassembles fragmented tool-call args with NO reasoning trace', () => {
    const events: StreamEvent[] = [];
    const result = reduceStream(parseSSE(fixture('together-qwen-stream-toolcall.sse.txt')), (ev) =>
      events.push(ev),
    );
    expect(result.toolCalls).toHaveLength(1);
    const call = result.toolCalls[0];
    expect(call.name).toBe('calculator');
    expect(call.id).toBe('call_qwen_str1');
    // Fragments "{\"expr" + "ession\": \"(2 " + "+ 3) * 4\"}" rebuild into one object.
    expect(call.arguments).toEqual({ expression: '(2 + 3) * 4' });
    // Non-thinking model: never emits reasoning.
    expect(result.reasoning).toBe('');
    expect(events.some((e) => e.kind === 'reasoning')).toBe(false);
    const started = events.filter((e) => e.kind === 'tool_call_started');
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ name: 'calculator', id: 'call_qwen_str1' });
    expect(result.finishReason).toBe('tool_calls');
    expect(result.usage.outputTokens).toBe(40);
  });

  it('reassembles a plain-text answer with no tool calls', () => {
    const result = reduceStream(parseSSE(fixture('together-qwen-stream-text.sse.txt')));
    expect(result.text).toBe('(2 + 3) * 4 equals 20.');
    expect(result.reasoning).toBe('');
    expect(result.toolCalls).toHaveLength(0);
    expect(result.finishReason).toBe('stop');
  });
});

describe('decodeResponse: non-streaming completions', () => {
  it('decodes a GLM tool-call completion with reasoning', () => {
    const adapter = createTogetherAdapter(glmConfig);
    const result = adapter.decodeResponse(
      JSON.parse(fixture('together-glm-completion-toolcall.json')),
    );
    expect(result.reasoning).toBe('Need to evaluate (2 + 3) * 4 with the calculator.');
    expect(result.toolCalls[0].name).toBe('calculator');
    expect(result.usage).toEqual({
      inputTokens: 488,
      cachedInputTokens: 96,
      outputTokens: 41,
    } satisfies Usage);
  });

  it('decodes a Qwen tool-call completion (no reasoning)', () => {
    const adapter = createTogetherAdapter(qwenConfig);
    const result = adapter.decodeResponse(
      JSON.parse(fixture('together-qwen-completion-toolcall.json')),
    );
    expect(result.reasoning).toBe('');
    expect(result.toolCalls[0].arguments).toEqual({ expression: '(2 + 3) * 4' });
    expect(result.finishReason).toBe('tool_calls');
  });
});

describe('per-model capabilities, quantization, and pricing (research/23)', () => {
  it('records FP4 for GLM-5.2 and FP8 for Qwen3-Coder-Next', () => {
    expect(createTogetherAdapter(glmConfig).quantization).toBe('FP4');
    expect(createTogetherAdapter(qwenConfig).quantization).toBe('FP8');
  });

  it('declares long-context windows for both models', () => {
    expect(createTogetherAdapter(glmConfig).capabilities.contextWindow).toBeGreaterThanOrEqual(
      200_000,
    );
    expect(createTogetherAdapter(qwenConfig).capabilities.contextWindow).toBeGreaterThanOrEqual(
      200_000,
    );
  });

  it('prices GLM-5.2 with the Together cached-input discount', () => {
    const adapter = createTogetherAdapter(glmConfig);
    // 240 cached + 60 uncached input, 45 output (research/23 §2: 1.40 / 0.26 / 4.40).
    const usage: Usage = { inputTokens: 300, cachedInputTokens: 240, outputTokens: 45 };
    const expected = (60 * 1.4 + 240 * 0.26 + 45 * 4.4) / 1_000_000;
    expect(adapter.pricing(usage)).toBeCloseTo(expected, 12);
  });

  it('prices Qwen3-Coder-Next far cheaper than GLM-5.2 for the same usage', () => {
    const usage: Usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 1000 };
    const glm = createTogetherAdapter(glmConfig).pricing(usage);
    const qwen = createTogetherAdapter(qwenConfig).pricing(usage);
    expect(qwen).toBeGreaterThan(0);
    expect(qwen).toBeLessThan(glm);
  });
});

describe('DeepSeek-V4-Pro on Together (secondary DeepSeek host, research/25)', () => {
  it('records the native FP4+FP8 mixed precision and thinking flag', () => {
    const adapter = createTogetherAdapter(deepseekConfig);
    expect(adapter.quantization).toBe('FP4+FP8');
    expect(adapter.modelInfo.thinking).toBe(true);
  });

  it('declares the 512K context Together actually serves (not the native 1M)', () => {
    const caps = createTogetherAdapter(deepseekConfig).capabilities;
    expect(caps.contextWindow).toBe(524_288);
    expect(caps.toolCalling).toBe(true);
    expect(caps.parallelToolCalls).toBe(true);
  });

  it('prices through the catalog row (Together model page: $1.74/$0.20/$3.48)', () => {
    // Sources conflict (launch blog said $2.10/$4.40); the live model page —
    // recorded in catalog.ts with asOf+sourceUrl — wins, and the adapter must
    // bill exactly what `glam models` shows. Reconcile on first real invoice.
    const adapter = createTogetherAdapter(deepseekConfig);
    const usage: Usage = { inputTokens: 310, cachedInputTokens: 248, outputTokens: 47 };
    const expected = (62 * 1.74 + 248 * 0.2 + 47 * 3.48) / 1_000_000;
    expect(adapter.pricing(usage)).toBeCloseTo(expected, 12);
  });

  it('sends reasoning_effort (thinking model) with the DeepSeek model id', () => {
    const adapter = createTogetherAdapter(deepseekConfig);
    const body = adapter.encodeRequest({
      system: 'You are glamfire.',
      task: { goal: 'compute', budget: {} },
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      config: { model: TOGETHER_DEEPSEEK_MODEL, reasoningEffort: 'high' },
    }).body as Record<string, unknown>;
    expect(body.model).toBe('deepseek-ai/DeepSeek-V4-Pro');
    expect(body.reasoning_effort).toBe('high');
    expect(body.service_tier).toBeUndefined(); // Fireworks-only knob
  });

  it('reassembles the fragmented DeepSeek tool-call stream (exact wire format)', () => {
    const result = reduceStream(parseSSE(fixture('together-deepseek-stream-toolcall.sse.txt')));
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].id).toBe('call_tg_ds_str1');
    expect(result.toolCalls[0].arguments).toEqual({ expression: '(2 + 3) * 4' });
    expect(result.reasoning).toContain('calculator tool');
    expect(result.finishReason).toBe('tool_calls');
  });
});

describe('encodeRequest: per-model body shaping', () => {
  const tool: ToolSpec = {
    name: 'calculator',
    description: 'do math',
    permission: 'read',
    parameters: { type: 'object', properties: { expression: { type: 'string' } } },
    handler: async () => ({}),
  };
  const state = (model: string): RunState => ({
    system: 'You are glamfire.',
    task: { goal: 'compute', budget: {} },
    messages: [{ role: 'user', content: 'what is 2+2?' }],
    tools: [tool],
    config: { model },
  });

  it('targets the Together base URL with Bearer auth', () => {
    const adapter = createTogetherAdapter(glmConfig);
    const req = adapter.encodeRequest(state(TOGETHER_GLM_MODEL), { stream: true });
    expect(req.url).toBe('https://api.together.xyz/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer test-key');
    const body = req.body as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    // Together has no Fireworks-style service tier.
    expect(body.service_tier).toBeUndefined();
  });

  it('sends reasoning_effort for GLM-5.2 (thinking) but NOT for Qwen (non-thinking)', () => {
    const glmReq = createTogetherAdapter(glmConfig).encodeRequest(state(TOGETHER_GLM_MODEL));
    expect((glmReq.body as Record<string, unknown>).reasoning_effort).toBe('high');

    const qwenReq = createTogetherAdapter(qwenConfig).encodeRequest(state(TOGETHER_QWEN_MODEL));
    expect((qwenReq.body as Record<string, unknown>).reasoning_effort).toBeUndefined();
  });
});

describe('config resolution', () => {
  it('applies documented defaults (GLM-5.2, Together base URL)', () => {
    const c = resolveTogetherConfig({ TOGETHER_API_KEY: 'k' });
    expect(c.model).toBe('zai-org/GLM-5.2');
    expect(c.baseUrl).toBe('https://api.together.xyz/v1');
    expect(c.reasoningEffort).toBe('high');
    expect(c.temperature).toBe(0.2);
  });

  it('lets overrides win over env', () => {
    const c = resolveTogetherConfig(
      { TOGETHER_API_KEY: 'k', TOGETHER_MODEL: 'zai-org/GLM-5.2' },
      { model: TOGETHER_QWEN_MODEL },
    );
    expect(c.model).toBe('Qwen/Qwen3-Coder-Next');
  });

  it('throws a clear error when the API key is missing', () => {
    expect(() => resolveTogetherConfig({})).toThrow(/TOGETHER_API_KEY is not set/);
  });

  it('fails loud for an unknown Together model (no faked capabilities)', () => {
    const c = resolveTogetherConfig({ TOGETHER_API_KEY: 'k' }, { model: 'made-up/model' });
    expect(() => createTogetherAdapter(c)).toThrow(/unsupported Together model "made-up\/model"/);
  });
});
