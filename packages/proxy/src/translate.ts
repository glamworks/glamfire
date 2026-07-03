// Anthropic Messages ⇄ OpenAI Chat Completions translation — the wire heart of
// `glam serve` (research/28 §3/§6 mode 3, research/32 backlog item 4).
//
// A client speaking the Anthropic Messages dialect (Claude Code via
// ANTHROPIC_BASE_URL) is translated FAITHFULLY onto glamfire's OpenAI-compatible
// upstream (GLM 5.2 on Fireworks by default) and the response is translated
// back, streaming included. Fidelity rules that matter in practice:
//
//   - tool-call IDs round-trip VERBATIM in both directions: an id minted by the
//     upstream appears unchanged as the `tool_use` id, and comes back unchanged
//     as `tool_call_id` when the client threads the `tool_result`;
//   - streamed tool-call arguments arrive as fragments (both dialects) and are
//     re-framed fragment-by-fragment (`arguments` -> `input_json_delta`),
//     never buffered into a fake single delta;
//   - system prompts (string or block array) become the OpenAI system message;
//   - images pass through as data:/http(s) URLs where the target declares
//     vision, and fail LOUDLY (a clean provider-shaped 400) where it does not.
//
// This module is pure translation: no HTTP, no metering, no config. The server
// (`packages/cli/src/proxy-server.mjs`) owns transport, auth, budget stops, and
// the usage ledger.

import type { Usage } from '@glamfire/engine';

// ---------------------------------------------------------------------------
// Errors — always provider-shaped, never a bare stack trace at a client.
// ---------------------------------------------------------------------------

/** A translation failure that maps to a clean, dialect-shaped HTTP error. */
export class TranslateError extends Error {
  readonly status: number;
  /** Anthropic error type vocabulary (e.g. 'invalid_request_error'). */
  readonly type: string;

  constructor(status: number, type: string, message: string) {
    super(message);
    this.name = 'TranslateError';
    this.status = status;
    this.type = type;
  }
}

/** Anthropic-dialect error body: `{"type":"error","error":{...}}`. */
export function anthropicErrorBody(type: string, message: string): Record<string, unknown> {
  return { type: 'error', error: { type, message } };
}

/** OpenAI-dialect error body: `{"error":{...}}`. */
export function openaiErrorBody(
  message: string,
  type: string,
  code?: string,
): Record<string, unknown> {
  return { error: { message, type, ...(code ? { code } : {}), param: null } };
}

// ---------------------------------------------------------------------------
// Wire shapes (only the fields we read; extra fields are tolerated).
// ---------------------------------------------------------------------------

interface AnthropicContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  // tool_use
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  is_error?: boolean;
  // image
  source?: { type?: string; media_type?: string; data?: string; url?: string };
}

interface AnthropicMessage {
  role?: string;
  content?: string | AnthropicContentBlock[];
}

interface AnthropicTool {
  type?: string;
  name?: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

export interface AnthropicMessagesRequest {
  model?: string;
  max_tokens?: number;
  system?: string | AnthropicContentBlock[];
  messages?: AnthropicMessage[];
  tools?: AnthropicTool[];
  tool_choice?: { type?: string; name?: string };
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: { user_id?: string };
}

interface OpenAIToolCall {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export interface OpenAIChatResponse {
  model?: string;
  choices?: {
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string | null;
  }[];
  usage?: OpenAIUsage;
}

export interface OpenAIStreamChunk {
  model?: string;
  choices?: {
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string | null;
  }[];
  usage?: OpenAIUsage;
}

/** Options describing the resolved upstream target. */
export interface TranslateOptions {
  /** Whether the target model declares vision (image passthrough gate). */
  vision: boolean;
  /** Target's max output tokens — client `max_tokens` above this is clamped. */
  maxOutputTokens: number;
  /** Human label for error messages, e.g. 'GLM-5.2 on Fireworks'. */
  targetLabel: string;
}

export interface TranslatedRequest {
  /** OpenAI chat-completions body (WITHOUT `model` — the server pins/routes it). */
  body: Record<string, unknown>;
  /** Non-fatal fidelity notes (e.g. a server-tool skipped) for the server log. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Request: Anthropic Messages -> OpenAI Chat Completions
// ---------------------------------------------------------------------------

function systemText(system: string | AnthropicContentBlock[] | undefined): string {
  if (system === undefined) return '';
  if (typeof system === 'string') return system;
  return system
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

function imageToOpenAIPart(
  block: AnthropicContentBlock,
  opts: TranslateOptions,
): Record<string, unknown> {
  if (!opts.vision) {
    throw new TranslateError(
      400,
      'invalid_request_error',
      `glamfire proxy: the request contains an image but the target model (${opts.targetLabel}) does not support vision. Pin a vision-capable model in [serve] or remove the image.`,
    );
  }
  const src = block.source ?? {};
  if (src.type === 'base64' && src.data) {
    const media = src.media_type ?? 'image/png';
    return { type: 'image_url', image_url: { url: `data:${media};base64,${src.data}` } };
  }
  if (src.type === 'url' && src.url) {
    return { type: 'image_url', image_url: { url: src.url } };
  }
  throw new TranslateError(
    400,
    'invalid_request_error',
    'glamfire proxy: unsupported image source (expected base64 or url)',
  );
}

/** Flatten a tool_result's content (string or block array) to the OpenAI tool-message string. */
function toolResultText(content: string | AnthropicContentBlock[] | undefined): string {
  if (content === undefined) return '';
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const b of content) {
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
    else if (b.type === 'image')
      parts.push('[image content omitted: tool results are text-only on this target]');
  }
  return parts.join('\n');
}

/**
 * Translate one Anthropic Messages request into an OpenAI chat-completions
 * body. Throws {@link TranslateError} on inputs that cannot be represented
 * faithfully (never silently drops meaning); collects non-fatal notes in
 * `warnings`.
 */
export function anthropicToOpenAIRequest(
  areq: AnthropicMessagesRequest,
  opts: TranslateOptions,
): TranslatedRequest {
  const warnings: string[] = [];
  const messages: Record<string, unknown>[] = [];

  const sys = systemText(areq.system);
  if (sys !== '') messages.push({ role: 'system', content: sys });

  if (!Array.isArray(areq.messages) || areq.messages.length === 0) {
    throw new TranslateError(
      400,
      'invalid_request_error',
      'messages: at least one message is required',
    );
  }

  for (const m of areq.messages) {
    const role = m.role;
    // Claude Code (observed live, v2.1.200) sends `role: "system"` messages
    // INSIDE the messages array for some requests, beyond the top-level
    // `system` field. They map 1:1 onto OpenAI system messages.
    if (role === 'system') {
      const text =
        typeof m.content === 'string'
          ? m.content
          : systemText(m.content as AnthropicContentBlock[]);
      if (text !== '') messages.push({ role: 'system', content: text });
      continue;
    }
    if (role !== 'user' && role !== 'assistant') {
      throw new TranslateError(
        400,
        'invalid_request_error',
        `messages: unsupported role "${String(role)}"`,
      );
    }

    if (typeof m.content === 'string') {
      messages.push({ role, content: m.content });
      continue;
    }
    const blocks = Array.isArray(m.content) ? m.content : [];

    if (role === 'user') {
      // Walk blocks IN ORDER: tool_result blocks become individual OpenAI
      // `tool` messages (tool_call_id = tool_use_id, verbatim); text/image
      // blocks accumulate into a user message, flushed when order demands.
      let parts: Record<string, unknown>[] = [];
      const flushParts = () => {
        if (parts.length === 0) return;
        const allText = parts.every((p) => p.type === 'text');
        messages.push({
          role: 'user',
          content: allText ? parts.map((p) => p.text as string).join('\n') : parts,
        });
        parts = [];
      };
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          flushParts();
          if (!b.tool_use_id) {
            throw new TranslateError(
              400,
              'invalid_request_error',
              'tool_result: missing tool_use_id',
            );
          }
          messages.push({
            role: 'tool',
            tool_call_id: b.tool_use_id,
            content: toolResultText(b.content),
          });
        } else if (b.type === 'text' && typeof b.text === 'string') {
          parts.push({ type: 'text', text: b.text });
        } else if (b.type === 'image') {
          parts.push(imageToOpenAIPart(b, opts));
        } else if (b.type !== undefined) {
          // Unknown block kinds (e.g. future betas) are dropped with a LOUD
          // note; failing the whole request would break clients on upgrade.
          warnings.push(`dropped unsupported user content block "${b.type}"`);
        }
      }
      flushParts();
      continue;
    }

    // assistant history: text -> content, tool_use -> tool_calls (ids verbatim),
    // thinking blocks are not replayed upstream (OpenAI wire has no request
    // slot for prior reasoning).
    let text = '';
    const toolCalls: Record<string, unknown>[] = [];
    for (const b of blocks) {
      if (b.type === 'text' && typeof b.text === 'string') text += b.text;
      else if (b.type === 'tool_use') {
        toolCalls.push({
          id: b.id ?? '',
          type: 'function',
          function: { name: b.name ?? '', arguments: JSON.stringify(b.input ?? {}) },
        });
      } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
        // Intentionally dropped: reasoning is an output artifact, not input.
      } else if (b.type !== undefined) {
        warnings.push(`dropped unsupported assistant content block "${b.type}"`);
      }
    }
    const out: Record<string, unknown> = { role: 'assistant', content: text };
    if (toolCalls.length > 0) out.tool_calls = toolCalls;
    messages.push(out);
  }

  // Tools: custom tools translate 1:1; Anthropic SERVER tools (web_search etc.)
  // cannot run on a third-party upstream — skipped with a loud warning.
  const tools: Record<string, unknown>[] = [];
  for (const t of areq.tools ?? []) {
    const isCustom = t.type === undefined || t.type === 'custom';
    if (!isCustom || !t.input_schema) {
      warnings.push(
        `skipped non-custom tool "${t.name ?? t.type ?? 'unknown'}" (server tools cannot run on this target)`,
      );
      continue;
    }
    tools.push({
      type: 'function',
      function: { name: t.name, description: t.description ?? '', parameters: t.input_schema },
    });
  }

  const body: Record<string, unknown> = { messages };
  if (tools.length > 0) {
    body.tools = tools;
    const tc = areq.tool_choice;
    if (tc?.type === 'any') body.tool_choice = 'required';
    else if (tc?.type === 'tool' && tc.name) {
      body.tool_choice = { type: 'function', function: { name: tc.name } };
    } else if (tc?.type === 'none') body.tool_choice = 'none';
    else body.tool_choice = 'auto';
  }

  if (typeof areq.max_tokens === 'number') {
    body.max_tokens = Math.min(areq.max_tokens, opts.maxOutputTokens);
    if (areq.max_tokens > opts.maxOutputTokens) {
      warnings.push(
        `max_tokens clamped ${areq.max_tokens} -> ${opts.maxOutputTokens} (target ceiling)`,
      );
    }
  }
  if (typeof areq.temperature === 'number') body.temperature = areq.temperature;
  if (typeof areq.top_p === 'number') body.top_p = areq.top_p;
  if (Array.isArray(areq.stop_sequences) && areq.stop_sequences.length > 0) {
    body.stop = areq.stop_sequences;
  }
  if (typeof areq.metadata?.user_id === 'string') body.user = areq.metadata.user_id;
  if (areq.stream === true) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }

  return { body, warnings };
}

// ---------------------------------------------------------------------------
// Response: OpenAI -> Anthropic (non-streaming)
// ---------------------------------------------------------------------------

/** Map an OpenAI finish_reason onto Anthropic's stop_reason vocabulary. */
export function mapFinishToStopReason(
  finish: string | null | undefined,
  hasToolCalls: boolean,
): string {
  switch (finish) {
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'refusal';
    case 'stop':
      return hasToolCalls ? 'tool_use' : 'end_turn';
    default:
      return hasToolCalls ? 'tool_use' : 'end_turn';
  }
}

function usageToAnthropic(u: OpenAIUsage | undefined): Record<string, unknown> {
  const prompt = u?.prompt_tokens ?? 0;
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    // Anthropic reports input_tokens EXCLUDING cache reads; OpenAI's
    // prompt_tokens INCLUDES them. Split faithfully.
    input_tokens: Math.max(0, prompt - cached),
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cached,
    output_tokens: u?.completion_tokens ?? 0,
  };
}

/** Neutral usage (glamfire's ledger shape) from an OpenAI usage object. */
export function usageFromOpenAI(u: OpenAIUsage | undefined): Usage {
  return {
    inputTokens: u?.prompt_tokens ?? 0,
    cachedInputTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
  };
}

function parseToolArguments(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    // Same convention as the adapters: surface the raw fragment so the client
    // (and its model) can see/repair malformed arguments — never fake `{}`.
    return { __unparsed_arguments: raw };
  }
}

let msgCounter = 0;
function messageId(): string {
  msgCounter += 1;
  return `msg_glam_${Date.now().toString(36)}_${msgCounter.toString(36)}`;
}

/**
 * Translate a non-streaming OpenAI chat completion into an Anthropic Messages
 * response. `model` is reported honestly as the model that actually served the
 * request (the target), never the client's requested alias.
 */
export function openaiToAnthropicResponse(
  res: OpenAIChatResponse,
  { model }: { model: string },
): Record<string, unknown> {
  const choice = res.choices?.[0];
  const msg = choice?.message ?? {};
  const content: Record<string, unknown>[] = [];

  const reasoning = msg.reasoning_content ?? msg.reasoning ?? '';
  if (reasoning) content.push({ type: 'thinking', thinking: reasoning, signature: '' });
  if (msg.content) content.push({ type: 'text', text: msg.content });

  const toolCalls = msg.tool_calls ?? [];
  for (const [i, tc] of toolCalls.entries()) {
    content.push({
      type: 'tool_use',
      id: tc.id || `call_${i}`,
      name: tc.function?.name ?? '',
      input: parseToolArguments(tc.function?.arguments ?? ''),
    });
  }

  return {
    id: messageId(),
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: mapFinishToStopReason(choice?.finish_reason, toolCalls.length > 0),
    stop_sequence: null,
    usage: usageToAnthropic(res.usage),
  };
}

// ---------------------------------------------------------------------------
// Streaming: OpenAI SSE chunks -> Anthropic Messages SSE events
// ---------------------------------------------------------------------------

/** One Anthropic SSE event ready for `event:`/`data:` framing. */
export interface AnthropicSSEEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Frame one event in Anthropic's SSE wire format. */
export function encodeAnthropicSSE(ev: AnthropicSSEEvent): string {
  return `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}

interface OpenBlock {
  /** Anthropic content-block index. */
  index: number;
  type: 'text' | 'thinking' | 'tool_use';
}

/**
 * Stateful streaming translator. `push` each parsed OpenAI SSE chunk in
 * arrival order; it returns the Anthropic SSE events to emit for that chunk —
 * incrementally, fragment-for-fragment (tool-call `arguments` fragments become
 * `input_json_delta.partial_json` fragments; nothing is buffered until the
 * end). `finish` closes every open block and emits `message_delta` (with the
 * REAL usage from the upstream's final chunk) + `message_stop`.
 *
 * After `finish`, `usage`/`finishReason`/`toolCallIds` expose what the server
 * needs for metering — the exact tokens the upstream billed.
 */
export class AnthropicStreamTranslator {
  private started = false;
  private nextBlockIndex = 0;
  /** The open text/thinking block, if any (closed when the kind switches). */
  private openFlow: OpenBlock | null = null;
  /** OpenAI tool-call index -> open Anthropic tool_use block. */
  private readonly openTools = new Map<number, OpenBlock>();
  private wireUsage: OpenAIUsage | undefined;
  private openaiFinish: string | null | undefined;
  private sawToolCalls = false;
  readonly toolCallIds: string[] = [];

  constructor(private readonly model: string) {}

  /** Neutral usage for metering (real numbers from the upstream final chunk). */
  get usage(): Usage {
    return usageFromOpenAI(this.wireUsage);
  }

  get finishReason(): string {
    return mapFinishToStopReason(this.openaiFinish, this.sawToolCalls);
  }

  private start(events: AnthropicSSEEvent[]): void {
    if (this.started) return;
    this.started = true;
    events.push({
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: messageId(),
          type: 'message',
          role: 'assistant',
          model: this.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          // Real input usage is only known at the END of an OpenAI-compatible
          // stream (stream_options.include_usage); the final numbers land on
          // message_delta below. Zeros here are provisional, not fabricated.
          usage: {
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
          },
        },
      },
    });
    events.push({ event: 'ping', data: { type: 'ping' } });
  }

  private closeFlow(events: AnthropicSSEEvent[]): void {
    if (this.openFlow === null) return;
    events.push({
      event: 'content_block_stop',
      data: { type: 'content_block_stop', index: this.openFlow.index },
    });
    this.openFlow = null;
  }

  private ensureFlow(kind: 'text' | 'thinking', events: AnthropicSSEEvent[]): OpenBlock {
    if (this.openFlow?.type === kind) return this.openFlow;
    this.closeFlow(events);
    const block: OpenBlock = { index: this.nextBlockIndex, type: kind };
    this.nextBlockIndex += 1;
    this.openFlow = block;
    events.push({
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: block.index,
        content_block:
          kind === 'text'
            ? { type: 'text', text: '' }
            : { type: 'thinking', thinking: '', signature: '' },
      },
    });
    return block;
  }

  push(chunk: OpenAIStreamChunk): AnthropicSSEEvent[] {
    const events: AnthropicSSEEvent[] = [];
    this.start(events);
    if (chunk.usage) this.wireUsage = chunk.usage;

    const choice = chunk.choices?.[0];
    if (!choice) return events;
    if (choice.finish_reason) this.openaiFinish = choice.finish_reason;
    const delta = choice.delta;
    if (!delta) return events;

    const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
    if (reasoningDelta) {
      const block = this.ensureFlow('thinking', events);
      events.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: block.index,
          delta: { type: 'thinking_delta', thinking: reasoningDelta },
        },
      });
    }
    if (delta.content) {
      const block = this.ensureFlow('text', events);
      events.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: block.index,
          delta: { type: 'text_delta', text: delta.content },
        },
      });
    }
    for (const tc of delta.tool_calls ?? []) {
      this.sawToolCalls = true;
      const idx = tc.index ?? 0;
      let block = this.openTools.get(idx);
      if (!block) {
        // A new tool call: close any open text/thinking flow, open a tool_use
        // block. The upstream's id passes through VERBATIM (round-trip fidelity).
        this.closeFlow(events);
        block = { index: this.nextBlockIndex, type: 'tool_use' };
        this.nextBlockIndex += 1;
        this.openTools.set(idx, block);
        const id = tc.id || `call_${idx}`;
        this.toolCallIds.push(id);
        events.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: block.index,
            content_block: { type: 'tool_use', id, name: tc.function?.name ?? '', input: {} },
          },
        });
      }
      if (tc.function?.arguments) {
        events.push({
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: block.index,
            delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
          },
        });
      }
    }
    return events;
  }

  finish(): AnthropicSSEEvent[] {
    const events: AnthropicSSEEvent[] = [];
    this.start(events); // an empty upstream stream still yields a valid message
    this.closeFlow(events);
    for (const block of [...this.openTools.values()].sort((a, b) => a.index - b.index)) {
      events.push({
        event: 'content_block_stop',
        data: { type: 'content_block_stop', index: block.index },
      });
    }
    this.openTools.clear();
    const u = usageToAnthropic(this.wireUsage);
    events.push({
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: this.finishReason, stop_sequence: null },
        usage: u,
      },
    });
    events.push({ event: 'message_stop', data: { type: 'message_stop' } });
    return events;
  }
}

// ---------------------------------------------------------------------------
// count_tokens — a real heuristic serving a real purpose (Claude Code calls
// this for context management; a non-Anthropic target has no exact counter).
// ---------------------------------------------------------------------------

/**
 * Estimate the input token count of a Messages request (~4 chars/token over
 * the serialized payload). Documented as an ESTIMATE: the target tokenizer is
 * not Anthropic's, so an exact count does not exist at this boundary.
 */
export function estimateInputTokens(areq: AnthropicMessagesRequest): number {
  const text = JSON.stringify({
    system: areq.system ?? '',
    messages: areq.messages ?? [],
    tools: areq.tools ?? [],
  });
  return Math.max(1, Math.ceil(text.length / 4));
}
