// Translation-layer unit tests: Anthropic Messages ⇄ OpenAI chat completions,
// both directions, streaming re-framing, and — the classic failure mode of
// every gateway in this class — tool-call ID round-trip fidelity.

import { describe, expect, it } from 'vitest';
import {
  type AnthropicMessagesRequest,
  AnthropicStreamTranslator,
  type OpenAIStreamChunk,
  TranslateError,
  anthropicErrorBody,
  anthropicToOpenAIRequest,
  encodeAnthropicSSE,
  estimateInputTokens,
  mapFinishToStopReason,
  openaiErrorBody,
  openaiToAnthropicResponse,
  usageFromOpenAI,
} from '../src/index.js';

const OPTS = { vision: false, maxOutputTokens: 131_072, targetLabel: 'glm-5p2' };
const VISION_OPTS = { ...OPTS, vision: true };

describe('anthropicToOpenAIRequest', () => {
  it('maps system, user text, params, and stop sequences', () => {
    const { body, warnings } = anthropicToOpenAIRequest(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: 'be terse',
        messages: [{ role: 'user', content: 'hello' }],
        temperature: 0.3,
        top_p: 0.9,
        stop_sequences: ['END'],
        metadata: { user_id: 'u1' },
      },
      OPTS,
    );
    expect(body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hello' },
    ]);
    expect(body.max_tokens).toBe(1000);
    expect(body.temperature).toBe(0.3);
    expect(body.top_p).toBe(0.9);
    expect(body.stop).toEqual(['END']);
    expect(body.user).toBe('u1');
    expect(body.model).toBeUndefined(); // the server pins/routes the model
    expect(warnings).toEqual([]);
  });

  it('maps a block-array system prompt and in-array system messages (Claude Code sends both)', () => {
    const { body } = anthropicToOpenAIRequest(
      {
        system: [
          { type: 'text', text: 'part one' },
          { type: 'text', text: 'part two' },
        ],
        messages: [
          // Observed live from Claude Code v2.1.200: role "system" INSIDE messages.
          { role: 'system', content: 'inline system reminder' },
          { role: 'user', content: 'hi' },
        ],
      },
      OPTS,
    );
    expect(body.messages).toEqual([
      { role: 'system', content: 'part one\npart two' },
      { role: 'system', content: 'inline system reminder' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('round-trips tool definitions, tool_use history, and tool_result IDs VERBATIM', () => {
    const { body } = anthropicToOpenAIRequest(
      {
        messages: [
          { role: 'user', content: 'weather?' },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'checking' },
              {
                type: 'tool_use',
                id: 'chatcmpl-tool-abc123',
                name: 'get_weather',
                input: { city: 'Paris' },
              },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'chatcmpl-tool-abc123', content: '18C' },
              { type: 'text', text: 'and now?' },
            ],
          },
        ],
        tools: [
          {
            name: 'get_weather',
            description: 'weather',
            input_schema: { type: 'object', properties: { city: { type: 'string' } } },
          },
        ],
        tool_choice: { type: 'any' },
      },
      OPTS,
    );
    const messages = body.messages as Record<string, unknown>[];
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: 'checking',
      tool_calls: [
        {
          id: 'chatcmpl-tool-abc123',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
        },
      ],
    });
    // The tool_result becomes a `tool` message with the SAME id, and the
    // trailing text becomes a separate user message, order preserved.
    expect(messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'chatcmpl-tool-abc123',
      content: '18C',
    });
    expect(messages[3]).toEqual({ role: 'user', content: 'and now?' });
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      },
    ]);
    expect(body.tool_choice).toBe('required');
  });

  it('maps tool_choice tool/none and defaults to auto', () => {
    const base: AnthropicMessagesRequest = {
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ name: 't', input_schema: { type: 'object' } }],
    };
    expect(
      anthropicToOpenAIRequest({ ...base, tool_choice: { type: 'tool', name: 't' } }, OPTS).body
        .tool_choice,
    ).toEqual({ type: 'function', function: { name: 't' } });
    expect(
      anthropicToOpenAIRequest({ ...base, tool_choice: { type: 'none' } }, OPTS).body.tool_choice,
    ).toBe('none');
    expect(anthropicToOpenAIRequest(base, OPTS).body.tool_choice).toBe('auto');
  });

  it('passes images through as data URLs when the target has vision', () => {
    const { body } = anthropicToOpenAIRequest(
      {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'what is this?' },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA=' } },
            ],
          },
        ],
      },
      VISION_OPTS,
    );
    const messages = body.messages as Record<string, unknown>[];
    expect(messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA=' } },
      ],
    });
  });

  it('rejects images LOUDLY (clean 400) when the target lacks vision', () => {
    expect(() =>
      anthropicToOpenAIRequest(
        {
          messages: [
            { role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'A' } }] },
          ],
        },
        OPTS,
      ),
    ).toThrowError(TranslateError);
    try {
      anthropicToOpenAIRequest(
        {
          messages: [
            { role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'A' } }] },
          ],
        },
        OPTS,
      );
    } catch (err) {
      const e = err as TranslateError;
      expect(e.status).toBe(400);
      expect(e.type).toBe('invalid_request_error');
      expect(e.message).toContain('vision');
    }
  });

  it('clamps max_tokens to the target ceiling with a warning', () => {
    const { body, warnings } = anthropicToOpenAIRequest(
      { max_tokens: 999_999_999, messages: [{ role: 'user', content: 'x' }] },
      OPTS,
    );
    expect(body.max_tokens).toBe(131_072);
    expect(warnings.join(' ')).toContain('clamped');
  });

  it('skips server tools with a warning and drops thinking blocks from history', () => {
    const { body, warnings } = anthropicToOpenAIRequest(
      {
        messages: [
          { role: 'user', content: 'x' },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'private', signature: 's' } as Record<string, unknown>,
              { type: 'text', text: 'answer' },
            ],
          },
          { role: 'user', content: 'y' },
        ],
        tools: [{ type: 'web_search_20250305', name: 'web_search' } as Record<string, unknown>],
      },
      OPTS,
    );
    const messages = body.messages as Record<string, unknown>[];
    expect(messages[1]).toEqual({ role: 'assistant', content: 'answer' });
    expect(body.tools).toBeUndefined();
    expect(warnings.join(' ')).toContain('web_search');
  });

  it('enables streaming with usage reporting (the exact-meter requirement)', () => {
    const { body } = anthropicToOpenAIRequest(
      { stream: true, messages: [{ role: 'user', content: 'x' }] },
      OPTS,
    );
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('rejects an empty messages array with a clean 400', () => {
    expect(() => anthropicToOpenAIRequest({ messages: [] }, OPTS)).toThrowError(TranslateError);
  });
});

describe('openaiToAnthropicResponse', () => {
  it('translates text + reasoning + tool calls with usage split (cached vs fresh)', () => {
    const out = openaiToAnthropicResponse(
      {
        choices: [
          {
            message: {
              content: 'the answer',
              reasoning_content: 'thinking...',
              tool_calls: [
                { id: 'call_9', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 60 },
        },
      },
      { model: 'glm-5p2' },
    );
    expect(out.model).toBe('glm-5p2');
    expect(out.stop_reason).toBe('tool_use');
    expect(out.content).toEqual([
      { type: 'thinking', thinking: 'thinking...', signature: '' },
      { type: 'text', text: 'the answer' },
      { type: 'tool_use', id: 'call_9', name: 'get_weather', input: { city: 'Paris' } },
    ]);
    // Anthropic reports input EXCLUDING cache reads; OpenAI includes them.
    expect(out.usage).toEqual({
      input_tokens: 40,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 60,
      output_tokens: 20,
    });
  });

  it('surfaces unparseable tool arguments instead of faking {}', () => {
    const out = openaiToAnthropicResponse(
      {
        choices: [
          {
            message: {
              content: '',
              tool_calls: [{ id: 'c', function: { name: 't', arguments: '{broken' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
      { model: 'm' },
    );
    const content = out.content as Record<string, unknown>[];
    expect(content[0]?.input).toEqual({ __unparsed_arguments: '{broken' });
  });

  it('maps finish reasons onto Anthropic stop_reason vocabulary', () => {
    expect(mapFinishToStopReason('stop', false)).toBe('end_turn');
    expect(mapFinishToStopReason('stop', true)).toBe('tool_use');
    expect(mapFinishToStopReason('tool_calls', true)).toBe('tool_use');
    expect(mapFinishToStopReason('length', false)).toBe('max_tokens');
    expect(mapFinishToStopReason('content_filter', false)).toBe('refusal');
    expect(mapFinishToStopReason(undefined, false)).toBe('end_turn');
  });
});

describe('AnthropicStreamTranslator', () => {
  const chunk = (delta: Record<string, unknown>, finish?: string): OpenAIStreamChunk => ({
    choices: [{ delta, ...(finish ? { finish_reason: finish } : {}) }],
  });

  it('re-frames text + reasoning + fragmented tool calls, fragment for fragment', () => {
    const t = new AnthropicStreamTranslator('glm-5p2');
    const events = [
      ...t.push(chunk({ reasoning_content: 'thin' })),
      ...t.push(chunk({ reasoning_content: 'king' })),
      ...t.push(chunk({ content: 'hello ' })),
      ...t.push(chunk({ content: 'world' })),
      ...t.push(
        chunk({
          tool_calls: [
            { index: 0, id: 'call_a1', function: { name: 'get_weather', arguments: '{"ci' } },
          ],
        }),
      ),
      ...t.push(chunk({ tool_calls: [{ index: 0, function: { arguments: 'ty":"Paris"}' } }] })),
      ...t.push(chunk({}, 'tool_calls')),
      ...t.push({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 9 } }),
      ...t.finish(),
    ];
    const kinds = events.map((e) => e.event);
    expect(kinds[0]).toBe('message_start');
    expect(kinds[1]).toBe('ping');
    // thinking block opens, streams, closes when text starts; text closes when
    // the tool call starts; every input_json fragment is its own delta.
    expect(kinds).toContain('content_block_start');
    const starts = events.filter((e) => e.event === 'content_block_start');
    expect(starts.map((s) => (s.data.content_block as Record<string, unknown>).type)).toEqual([
      'thinking',
      'text',
      'tool_use',
    ]);
    const toolStart = starts[2]?.data.content_block as Record<string, unknown>;
    expect(toolStart.id).toBe('call_a1'); // upstream id VERBATIM
    expect(toolStart.name).toBe('get_weather');
    const jsonDeltas = events
      .filter(
        (e) =>
          e.event === 'content_block_delta' &&
          (e.data.delta as Record<string, unknown>).type === 'input_json_delta',
      )
      .map((e) => (e.data.delta as Record<string, unknown>).partial_json);
    expect(jsonDeltas).toEqual(['{"ci', 'ty":"Paris"}']); // fragments preserved
    expect(jsonDeltas.join('')).toBe('{"city":"Paris"}');

    const messageDelta = events.find((e) => e.event === 'message_delta');
    expect((messageDelta?.data.delta as Record<string, unknown>).stop_reason).toBe('tool_use');
    expect(messageDelta?.data.usage).toEqual({
      input_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 9,
    });
    expect(kinds[kinds.length - 1]).toBe('message_stop');

    // Metering surface: the exact upstream usage + tool ids.
    expect(t.usage).toEqual({ inputTokens: 50, cachedInputTokens: 0, outputTokens: 9 });
    expect(t.toolCallIds).toEqual(['call_a1']);
    expect(t.finishReason).toBe('tool_use');

    // Every open block was closed exactly once.
    const stops = events.filter((e) => e.event === 'content_block_stop');
    expect(stops).toHaveLength(3);
  });

  it('keeps parallel tool calls in distinct blocks with distinct ids', () => {
    const t = new AnthropicStreamTranslator('m');
    const events = [
      ...t.push(
        chunk({
          tool_calls: [
            { index: 0, id: 'call_x', function: { name: 'a', arguments: '{}' } },
            { index: 1, id: 'call_y', function: { name: 'b', arguments: '{"k"' } },
          ],
        }),
      ),
      ...t.push(chunk({ tool_calls: [{ index: 1, function: { arguments: ':1}' } }] })),
      ...t.finish(),
    ];
    const starts = events.filter((e) => e.event === 'content_block_start');
    expect(starts).toHaveLength(2);
    expect(t.toolCallIds).toEqual(['call_x', 'call_y']);
    const byIndex = new Map<number, string>();
    for (const e of events) {
      if (e.event !== 'content_block_delta') continue;
      const d = e.data.delta as Record<string, unknown>;
      if (d.type !== 'input_json_delta') continue;
      const idx = e.data.index as number;
      byIndex.set(idx, (byIndex.get(idx) ?? '') + (d.partial_json as string));
    }
    expect([...byIndex.values()]).toEqual(['{}', '{"k":1}']);
    // block indexes are distinct and stops cover both
    const stops = events.filter((e) => e.event === 'content_block_stop');
    expect(new Set(stops.map((s) => s.data.index)).size).toBe(2);
  });

  it('produces a valid empty message when the upstream stream carried nothing', () => {
    const t = new AnthropicStreamTranslator('m');
    const events = t.finish();
    expect(events.map((e) => e.event)).toEqual([
      'message_start',
      'ping',
      'message_delta',
      'message_stop',
    ]);
  });

  it('encodes SSE frames in Anthropic wire format', () => {
    const s = encodeAnthropicSSE({ event: 'ping', data: { type: 'ping' } });
    expect(s).toBe('event: ping\ndata: {"type":"ping"}\n\n');
  });
});

describe('helpers', () => {
  it('usageFromOpenAI maps the three billed dimensions', () => {
    expect(
      usageFromOpenAI({
        prompt_tokens: 10,
        completion_tokens: 3,
        prompt_tokens_details: { cached_tokens: 4 },
      }),
    ).toEqual({ inputTokens: 10, cachedInputTokens: 4, outputTokens: 3 });
    expect(usageFromOpenAI(undefined)).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
  });

  it('error bodies are provider-shaped for each dialect', () => {
    expect(anthropicErrorBody('invalid_request_error', 'nope')).toEqual({
      type: 'error',
      error: { type: 'invalid_request_error', message: 'nope' },
    });
    expect(openaiErrorBody('nope', 'insufficient_quota', 'insufficient_quota')).toEqual({
      error: {
        message: 'nope',
        type: 'insufficient_quota',
        code: 'insufficient_quota',
        param: null,
      },
    });
  });

  it('estimateInputTokens returns a positive, size-proportional estimate', () => {
    const small = estimateInputTokens({ messages: [{ role: 'user', content: 'hi' }] });
    const big = estimateInputTokens({ messages: [{ role: 'user', content: 'hi'.repeat(4000) }] });
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small * 10);
  });
});
