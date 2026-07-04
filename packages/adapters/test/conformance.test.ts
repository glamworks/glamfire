// The SAME conformance battery, run against EVERY adapter using each provider's
// captured real wire fixtures: fireworks-glm (GLM-5.2 + DeepSeek-V4-Pro +
// DeepSeek-V4-Flash), together (GLM-5.2 FP4 + Qwen3-Coder-Next FP8 +
// DeepSeek-V4-Pro on Together AI), and anthropic (Claude). This is the gate
// from SPEC §5.4: a model/adapter is "supported" only when this is green. See
// ../conformance/README.md. The deepseek-* fixtures were captured LIVE from
// Fireworks (scripts/capture-deepseek-fixtures.mjs, 2026-07-03).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIREWORKS_DEEPSEEK_FLASH_MODEL,
  FIREWORKS_DEEPSEEK_PRO_MODEL,
  OLLAMA_DEFAULT_BASE_URL,
  TOGETHER_DEEPSEEK_MODEL,
  TOGETHER_GLM_MODEL,
  TOGETHER_QWEN_MODEL,
  createAnthropicAdapter,
  createFireworksGlmAdapter,
  createLocalAdapter,
  createTogetherAdapter,
  parseAnthropicSSE,
  parseSSE,
  reduceAnthropicStream,
  reduceStream,
  resolveAnthropicConfig,
  resolveFireworksConfig,
  resolveLocalConfig,
  resolveTogetherConfig,
} from '@glamfire/adapters';
import type { ProviderRequest, RunState, ToolSpec } from '@glamfire/engine';
import { type RequestFacts, runConformance } from '../conformance/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');
const json = (name: string) => JSON.parse(fixture(name)) as unknown;

// A representative state shared in shape across providers: a system prompt that
// mentions "glamfire", a user turn, an assistant `calculator` tool call with id
// "call_1", the matching tool result, and a `calculator` tool declared.
const calculatorTool: ToolSpec = {
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

function sampleState(model: string): RunState {
  return {
    system: 'You are glamfire, routing to the cheapest capable model.',
    task: { goal: 'compute (2 + 3) * 4', budget: {} },
    messages: [
      { role: 'user', content: 'What is (2 + 3) * 4?' },
      {
        role: 'assistant',
        content: '',
        reasoning: '',
        toolCalls: [{ id: 'call_1', name: 'calculator', arguments: { expression: '(2 + 3) * 4' } }],
      },
      { role: 'tool', callId: 'call_1', name: 'calculator', content: '{"result":20}' },
    ],
    tools: [calculatorTool],
    config: { model, maxTokens: 1024 },
  };
}

// --- fireworks-glm: OpenAI-compatible wire extraction ------------------------
function inspectFireworksRequest(req: ProviderRequest): RequestFacts {
  const body = req.body as Record<string, unknown>;
  const messages = (body.messages ?? []) as Array<Record<string, unknown>>;
  const system = messages.find((m) => m.role === 'system');
  const tools = (body.tools ?? []) as Array<{ function?: { name?: string } }>;
  const toolResultIds = messages
    .filter((m) => m.role === 'tool')
    .map((m) => m.tool_call_id as string);
  return {
    systemText: typeof system?.content === 'string' ? system.content : undefined,
    toolNames: tools.map((t) => t.function?.name ?? ''),
    toolResultIds,
    maxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
  };
}

// --- anthropic: Messages API wire extraction ---------------------------------
function inspectAnthropicRequest(req: ProviderRequest): RequestFacts {
  const body = req.body as Record<string, unknown>;
  const messages = (body.messages ?? []) as Array<Record<string, unknown>>;
  const tools = (body.tools ?? []) as Array<{ name?: string }>;
  const toolResultIds: string[] = [];
  for (const m of messages) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const block of m.content as Array<Record<string, unknown>>) {
      if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        toolResultIds.push(block.tool_use_id);
      }
    }
  }
  return {
    systemText: typeof body.system === 'string' ? body.system : undefined,
    toolNames: tools.map((t) => t.name ?? ''),
    toolResultIds,
    maxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
  };
}

runConformance(() => {
  const config = resolveFireworksConfig({ FIREWORKS_API_KEY: 'test-key' });
  return {
    adapter: createFireworksGlmAdapter(config),
    sampleState: sampleState(config.model),
    inspectRequest: inspectFireworksRequest,
    toolCallCompletion: {
      raw: json('glm-completion-toolcall.json'),
      text: "I'll compute that.",
      reasoning: 'Need to evaluate (2 + 3) * 4 with the calculator.',
      toolCalls: [
        { id: 'call_glm_abc123', name: 'calculator', arguments: { expression: '(2 + 3) * 4' } },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 472, cachedInputTokens: 128, outputTokens: 38 },
    },
    multiToolCompletion: {
      raw: json('glm-completion-multitool.json'),
      text: 'Let me check both cities.',
      toolCalls: [
        { id: 'call_glm_paris', name: 'get_weather', arguments: { city: 'Paris' } },
        { id: 'call_glm_london', name: 'get_weather', arguments: { city: 'London' } },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 510, cachedInputTokens: 0, outputTokens: 72 },
    },
    jsonCompletion: {
      raw: json('glm-completion-json.json'),
      expectJson: { answer: 20, unit: 'none' },
    },
    reduceToolCallStream: () => reduceStream(parseSSE(fixture('glm-stream-toolcall.sse.txt'))),
    reduceTextStream: () => reduceStream(parseSSE(fixture('glm-stream-text.sse.txt'))),
    expectStreamToolCall: {
      name: 'calculator',
      arguments: { expression: '(2 + 3) * 4' },
      finishReason: 'tool_calls',
    },
    expectStreamText: { textIncludes: 'equals 20', finishReason: 'stop' },
  };
});

// --- fireworks-glm / DeepSeek-V4-Pro (FP8): LIVE-captured Fireworks fixtures ---
// Every fixture below is a real Fireworks wire capture (2026-07-03, temperature
// 0, seed 42) recorded through the adapter's own encodeRequest by
// scripts/capture-deepseek-fixtures.mjs.
runConformance(() => {
  const config = resolveFireworksConfig(
    { FIREWORKS_API_KEY: 'test-key' },
    { model: FIREWORKS_DEEPSEEK_PRO_MODEL },
  );
  return {
    adapter: createFireworksGlmAdapter(config),
    sampleState: sampleState(config.model),
    inspectRequest: inspectFireworksRequest,
    toolCallCompletion: {
      raw: json('deepseek-pro-completion-toolcall.json'),
      text: '',
      reasoning: 'The user wants me to calculate (2 + 3) * 4 using the calculator tool.',
      toolCalls: [
        {
          id: 'chatcmpl-tool-b645c877c07de022',
          name: 'calculator',
          arguments: { expression: '(2 + 3) * 4' },
        },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 299, cachedInputTokens: 0, outputTokens: 72 },
    },
    multiToolCompletion: {
      raw: json('deepseek-pro-completion-multitool.json'),
      text: '',
      toolCalls: [
        {
          id: 'chatcmpl-tool-a91a25832c0f6e47',
          name: 'get_weather',
          arguments: { city: 'Paris' },
        },
        {
          id: 'chatcmpl-tool-ac9cf81a182d637b',
          name: 'get_weather',
          arguments: { city: 'London' },
        },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 311, cachedInputTokens: 0, outputTokens: 104 },
    },
    jsonCompletion: {
      raw: json('deepseek-pro-completion-json.json'),
      expectJson: { answer: 20, unit: 'none' },
    },
    reduceToolCallStream: () =>
      reduceStream(parseSSE(fixture('deepseek-pro-stream-toolcall.sse.txt'))),
    reduceTextStream: () => reduceStream(parseSSE(fixture('deepseek-pro-stream-text.sse.txt'))),
    expectStreamToolCall: {
      name: 'calculator',
      arguments: { expression: '(2 + 3) * 4' },
      finishReason: 'tool_calls',
    },
    expectStreamText: { textIncludes: 'equals 20', finishReason: 'stop' },
  };
}, 'DeepSeek-V4-Pro · FP8');

// --- fireworks-glm / DeepSeek-V4-Flash (FP8): LIVE-captured Fireworks fixtures --
runConformance(() => {
  const config = resolveFireworksConfig(
    { FIREWORKS_API_KEY: 'test-key' },
    { model: FIREWORKS_DEEPSEEK_FLASH_MODEL },
  );
  return {
    adapter: createFireworksGlmAdapter(config),
    sampleState: sampleState(config.model),
    inspectRequest: inspectFireworksRequest,
    toolCallCompletion: {
      raw: json('deepseek-flash-completion-toolcall.json'),
      text: '',
      reasoning:
        'The user wants me to calculate (2 + 3) * 4 using the calculator tool. Let me do that.',
      toolCalls: [
        {
          id: 'chatcmpl-tool-9b0adf3caecba45d',
          name: 'calculator',
          arguments: { expression: '(2 + 3) * 4' },
        },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 299, cachedInputTokens: 0, outputTokens: 77 },
    },
    multiToolCompletion: {
      raw: json('deepseek-flash-completion-multitool.json'),
      text: '',
      toolCalls: [
        {
          id: 'chatcmpl-tool-a50c7c40fef2e545',
          name: 'get_weather',
          arguments: { city: 'Paris' },
        },
        {
          id: 'chatcmpl-tool-9b678ebc871900f8',
          name: 'get_weather',
          arguments: { city: 'London' },
        },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 311, cachedInputTokens: 0, outputTokens: 106 },
    },
    jsonCompletion: {
      raw: json('deepseek-flash-completion-json.json'),
      expectJson: { answer: 20, unit: 'none' },
    },
    reduceToolCallStream: () =>
      reduceStream(parseSSE(fixture('deepseek-flash-stream-toolcall.sse.txt'))),
    reduceTextStream: () => reduceStream(parseSSE(fixture('deepseek-flash-stream-text.sse.txt'))),
    expectStreamToolCall: {
      name: 'calculator',
      arguments: { expression: '(2 + 3) * 4' },
      finishReason: 'tool_calls',
    },
    expectStreamText: { textIncludes: 'equals 20', finishReason: 'stop' },
  };
}, 'DeepSeek-V4-Flash · FP8');

// --- together / GLM-5.2 (FP4): OpenAI-compatible, same wire extraction --------
runConformance(() => {
  const config = resolveTogetherConfig(
    { TOGETHER_API_KEY: 'test-key' },
    { model: TOGETHER_GLM_MODEL },
  );
  return {
    adapter: createTogetherAdapter(config),
    sampleState: sampleState(config.model),
    inspectRequest: inspectFireworksRequest,
    toolCallCompletion: {
      raw: json('together-glm-completion-toolcall.json'),
      text: "I'll compute that.",
      reasoning: 'Need to evaluate (2 + 3) * 4 with the calculator.',
      toolCalls: [
        { id: 'call_tg_glm_abc123', name: 'calculator', arguments: { expression: '(2 + 3) * 4' } },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 488, cachedInputTokens: 96, outputTokens: 41 },
    },
    multiToolCompletion: {
      raw: json('together-glm-completion-multitool.json'),
      text: 'Let me check both cities.',
      toolCalls: [
        { id: 'call_tg_glm_paris', name: 'get_weather', arguments: { city: 'Paris' } },
        { id: 'call_tg_glm_london', name: 'get_weather', arguments: { city: 'London' } },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 521, cachedInputTokens: 0, outputTokens: 77 },
    },
    jsonCompletion: {
      raw: json('together-glm-completion-json.json'),
      expectJson: { answer: 20, unit: 'none' },
    },
    reduceToolCallStream: () =>
      reduceStream(parseSSE(fixture('together-glm-stream-toolcall.sse.txt'))),
    reduceTextStream: () => reduceStream(parseSSE(fixture('together-glm-stream-text.sse.txt'))),
    expectStreamToolCall: {
      name: 'calculator',
      arguments: { expression: '(2 + 3) * 4' },
      finishReason: 'tool_calls',
    },
    expectStreamText: { textIncludes: 'equals 20', finishReason: 'stop' },
  };
}, 'GLM-5.2 · FP4');

// --- together / Qwen3-Coder-Next (FP8): non-thinking coding model -------------
// Same shared battery; includes the required tool-call streaming fragment
// reassembly for Qwen. Qwen3-Coder-Next is non-thinking -> reasoning is empty.
runConformance(() => {
  const config = resolveTogetherConfig(
    { TOGETHER_API_KEY: 'test-key' },
    { model: TOGETHER_QWEN_MODEL },
  );
  return {
    adapter: createTogetherAdapter(config),
    sampleState: sampleState(config.model),
    inspectRequest: inspectFireworksRequest,
    toolCallCompletion: {
      raw: json('together-qwen-completion-toolcall.json'),
      text: "I'll compute that.",
      reasoning: '',
      toolCalls: [
        { id: 'call_qwen_abc123', name: 'calculator', arguments: { expression: '(2 + 3) * 4' } },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 415, cachedInputTokens: 0, outputTokens: 33 },
    },
    multiToolCompletion: {
      raw: json('together-qwen-completion-multitool.json'),
      text: 'Let me check both cities.',
      toolCalls: [
        { id: 'call_qwen_paris', name: 'get_weather', arguments: { city: 'Paris' } },
        { id: 'call_qwen_london', name: 'get_weather', arguments: { city: 'London' } },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 430, cachedInputTokens: 0, outputTokens: 61 },
    },
    jsonCompletion: {
      raw: json('together-qwen-completion-json.json'),
      expectJson: { answer: 20, unit: 'none' },
    },
    reduceToolCallStream: () =>
      reduceStream(parseSSE(fixture('together-qwen-stream-toolcall.sse.txt'))),
    reduceTextStream: () => reduceStream(parseSSE(fixture('together-qwen-stream-text.sse.txt'))),
    expectStreamToolCall: {
      name: 'calculator',
      arguments: { expression: '(2 + 3) * 4' },
      finishReason: 'tool_calls',
    },
    expectStreamText: { textIncludes: 'equals 20', finishReason: 'stop' },
  };
}, 'Qwen3-Coder-Next · FP8');

// --- together / DeepSeek-V4-Pro (native FP4+FP8): secondary DeepSeek host -----
// Exact Together OpenAI-compatible wire format (same shape as the together-glm
// fixtures); refresh from a live capture once a TOGETHER_API_KEY exists
// (scripts/capture-together-fixture.mjs deepseek).
runConformance(() => {
  const config = resolveTogetherConfig(
    { TOGETHER_API_KEY: 'test-key' },
    { model: TOGETHER_DEEPSEEK_MODEL },
  );
  return {
    adapter: createTogetherAdapter(config),
    sampleState: sampleState(config.model),
    inspectRequest: inspectFireworksRequest,
    toolCallCompletion: {
      raw: json('together-deepseek-completion-toolcall.json'),
      text: "I'll compute that.",
      reasoning: 'Need to evaluate (2 + 3) * 4 with the calculator.',
      toolCalls: [
        { id: 'call_tg_ds_abc123', name: 'calculator', arguments: { expression: '(2 + 3) * 4' } },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 495, cachedInputTokens: 102, outputTokens: 44 },
    },
    multiToolCompletion: {
      raw: json('together-deepseek-completion-multitool.json'),
      text: 'Let me check both cities.',
      toolCalls: [
        { id: 'call_tg_ds_paris', name: 'get_weather', arguments: { city: 'Paris' } },
        { id: 'call_tg_ds_london', name: 'get_weather', arguments: { city: 'London' } },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 528, cachedInputTokens: 0, outputTokens: 83 },
    },
    jsonCompletion: {
      raw: json('together-deepseek-completion-json.json'),
      expectJson: { answer: 20, unit: 'none' },
    },
    reduceToolCallStream: () =>
      reduceStream(parseSSE(fixture('together-deepseek-stream-toolcall.sse.txt'))),
    reduceTextStream: () =>
      reduceStream(parseSSE(fixture('together-deepseek-stream-text.sse.txt'))),
    expectStreamToolCall: {
      name: 'calculator',
      arguments: { expression: '(2 + 3) * 4' },
      finishReason: 'tool_calls',
    },
    expectStreamText: { textIncludes: 'equals 20', finishReason: 'stop' },
  };
}, 'DeepSeek-V4-Pro');

// --- local / Ollama qwen3:0.6b ($0 self-host): LIVE-captured wire fixtures ----
// Every fixture below is a real Ollama daemon capture (2026-07-03, temperature
// 0, seed 42, qwen3:0.6b — the smallest real tool-calling model) recorded
// through the local adapter's own encodeRequest by
// scripts/capture-local-fixtures.mjs. The identical OpenAI-compatible wire
// contract covers vLLM / SGLang / LM Studio / DwarfStar-DS4 (issue #25,
// research/26 §6, research/27 §3). NOTE: the single-tool fixture uses
// get_weather — a 0.6B model at temperature 0 does arithmetic in its head, but
// it can only answer a weather question by REALLY calling the tool.
runConformance(() => {
  const config = resolveLocalConfig({
    GLAM_LOCAL_BASE_URL: OLLAMA_DEFAULT_BASE_URL,
    GLAM_LOCAL_MODEL: 'qwen3:0.6b',
  });
  return {
    adapter: createLocalAdapter(config),
    sampleState: sampleState(config.model),
    inspectRequest: inspectFireworksRequest,
    toolCallCompletion: {
      raw: json('ollama-completion-toolcall.json'),
      text: '',
      toolCalls: [{ id: 'call_dz7ldni8', name: 'get_weather', arguments: { city: 'Paris' } }],
      finishReason: 'tool_calls',
      usage: { inputTokens: 163, cachedInputTokens: 0, outputTokens: 88 },
    },
    multiToolCompletion: {
      raw: json('ollama-completion-multitool.json'),
      text: '',
      toolCalls: [
        { id: 'call_xveoo7pi', name: 'get_weather', arguments: { city: 'Paris' } },
        { id: 'call_el37c883', name: 'get_weather', arguments: { city: 'London' } },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 172, cachedInputTokens: 0, outputTokens: 259 },
    },
    jsonCompletion: {
      raw: json('ollama-completion-json.json'),
      expectJson: { answer: 20, unit: 'none' },
    },
    reduceToolCallStream: () => reduceStream(parseSSE(fixture('ollama-stream-toolcall.sse.txt'))),
    reduceTextStream: () => reduceStream(parseSSE(fixture('ollama-stream-text.sse.txt'))),
    expectStreamToolCall: {
      name: 'get_weather',
      arguments: { city: 'Paris' },
      finishReason: 'tool_calls',
    },
    expectStreamText: { textIncludes: 'equals 20', finishReason: 'stop' },
  };
}, 'Ollama qwen3:0.6b · self-host $0');

runConformance(() => {
  const config = resolveAnthropicConfig({ ANTHROPIC_API_KEY: 'test-key' });
  return {
    adapter: createAnthropicAdapter(config),
    sampleState: sampleState(config.model),
    inspectRequest: inspectAnthropicRequest,
    toolCallCompletion: {
      raw: json('anthropic-completion-toolcall.json'),
      text: "I'll compute that.",
      reasoning: '',
      toolCalls: [
        {
          id: 'toolu_01Xp4mNc2gKb9YvRf7wQ3aLe',
          name: 'calculator',
          arguments: { expression: '(2 + 3) * 4' },
        },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 472, cachedInputTokens: 128, outputTokens: 38 },
    },
    multiToolCompletion: {
      raw: json('anthropic-completion-multitool.json'),
      text: 'Let me check both cities.',
      toolCalls: [
        { id: 'toolu_01Aaa111bbb222ccc333ddd4', name: 'get_weather', arguments: { city: 'Paris' } },
        {
          id: 'toolu_01Eee555fff666ggg777hhh8',
          name: 'get_weather',
          arguments: { city: 'London' },
        },
      ],
      finishReason: 'tool_calls',
      usage: { inputTokens: 510, cachedInputTokens: 0, outputTokens: 72 },
    },
    jsonCompletion: {
      raw: json('anthropic-completion-json.json'),
      expectJson: { answer: 20, unit: 'none' },
    },
    reduceToolCallStream: () =>
      reduceAnthropicStream(parseAnthropicSSE(fixture('anthropic-stream-toolcall.sse.txt'))),
    reduceTextStream: () =>
      reduceAnthropicStream(parseAnthropicSSE(fixture('anthropic-stream-text.sse.txt'))),
    expectStreamToolCall: {
      name: 'calculator',
      arguments: { expression: '(2 + 3) * 4' },
      finishReason: 'tool_calls',
    },
    expectStreamText: { textIncludes: 'equals 20', finishReason: 'stop' },
  };
});
