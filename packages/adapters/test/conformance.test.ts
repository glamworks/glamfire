// The SAME conformance battery, run against BOTH first-class adapters
// (fireworks-glm and anthropic) using each provider's captured real wire
// fixtures. This is the gate from SPEC §5.4: a model/adapter is "supported"
// only when this is green. See ../conformance/README.md.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAnthropicAdapter,
  createFireworksGlmAdapter,
  parseAnthropicSSE,
  parseSSE,
  reduceAnthropicStream,
  reduceStream,
  resolveAnthropicConfig,
  resolveFireworksConfig,
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
