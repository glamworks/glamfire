// anthropic — the second first-class adapter: the Claude family via Anthropic's
// native Messages API (SPEC §5.4). For edge escalation and migration parity.
//
// The Messages API differs from the OpenAI-compatible surface fireworks-glm
// speaks, and this adapter handles every difference for real:
//   - the system prompt is a TOP-LEVEL `system` field, not a message;
//   - tools use `input_schema` (not `function.parameters`);
//   - tool calls are `tool_use` content blocks; tool results are `tool_result`
//     blocks threaded back inside a USER message by `tool_use_id`;
//   - `max_tokens` is REQUIRED;
//   - streaming reassembles `tool_use` arguments from `input_json_delta`
//     fragments (Claude's analogue of GLM's fragmented tool-call args) and
//     `text`/`thinking` from their respective deltas; usage arrives split across
//     `message_start` (input/cache) and `message_delta` (final output).

import type {
  AdapterRuntimeConfig,
  Capabilities,
  ModelTurnResult,
  NeutralMessage,
  ProviderRequest,
  RunState,
  StreamEvent,
  StreamingAdapter,
  ToolCall,
  ToolSpec,
  Usage,
} from '@glamfire/engine';
import type { AnthropicConfig } from './anthropic-config.js';

// --- pricing (real Claude list prices), USD per 1M tokens: input / output -----
// Cache reads bill at ~0.1x input; cache writes (folded into `inputTokens` on
// decode) bill at ~1.25x input — we price the fresh+write bucket at the input
// rate, which is faithful to within the write premium.
interface PriceRow {
  input: number;
  output: number;
}
const CACHE_READ_FACTOR = 0.1;
const PRICING: Record<string, PriceRow> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5': { input: 10, output: 50 },
};
const DEFAULT_PRICE: PriceRow = PRICING['claude-opus-4-8'] as PriceRow;

function priceFor(model: string): PriceRow {
  return PRICING[model] ?? DEFAULT_PRICE;
}

// --- Messages API wire shapes (only the fields we read) ----------------------
interface WireUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}
interface WireContentBlock {
  type?: string;
  // text block
  text?: string;
  // thinking block
  thinking?: string;
  // tool_use block
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}
interface WireMessage {
  content?: WireContentBlock[];
  stop_reason?: string | null;
  usage?: WireUsage;
}

// streaming events
interface WireDelta {
  type?: string;
  text?: string;
  thinking?: string;
  partial_json?: string;
  stop_reason?: string | null;
}
export interface WireStreamEvent {
  type?: string;
  index?: number;
  // message_start
  message?: WireMessage;
  // content_block_start
  content_block?: WireContentBlock;
  // content_block_delta
  delta?: WireDelta;
  // message_delta usage
  usage?: WireUsage;
}

function toUsage(u: WireUsage | undefined): Usage {
  const input = u?.input_tokens ?? 0;
  const cacheCreate = u?.cache_creation_input_tokens ?? 0;
  const cacheRead = u?.cache_read_input_tokens ?? 0;
  return {
    // Fresh input + cache-write tokens both bill near full input rate.
    inputTokens: input + cacheCreate,
    cachedInputTokens: cacheRead,
    outputTokens: u?.output_tokens ?? 0,
  };
}

/**
 * Map an Anthropic `stop_reason` to glamfire's neutral finish-reason vocabulary
 * (the same OpenAI-style tokens fireworks-glm emits), so the engine and the
 * conformance suite treat stop reasons uniformly across adapters.
 */
export function mapStopReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    case 'refusal':
      return 'refusal';
    case 'pause_turn':
      return 'pause';
    default:
      return reason ?? 'stop';
  }
}

function parseArgs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    // Surface the raw fragment so the model can see/repair malformed arguments.
    return { __unparsed_arguments: raw };
  }
}

// --- streaming accumulator: reassembles tool_use args + interleaved blocks ----

interface PartialBlock {
  type: string;
  id: string;
  name: string;
  json: string;
}

/**
 * Stateful accumulator for a streamed Messages response. `push` each parsed SSE
 * event (in order); it emits live token events and rebuilds the full turn.
 * `finalize` returns the neutral result with tool-call arguments parsed.
 */
export class AnthropicStreamAccumulator {
  private text = '';
  private reasoning = '';
  private finishReason = '';
  private usage: Usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  /** Keyed by content-block index so fragments across deltas land correctly. */
  private readonly blocks = new Map<number, PartialBlock>();

  push(event: WireStreamEvent, onEvent?: (ev: StreamEvent) => void): void {
    switch (event.type) {
      case 'message_start': {
        // Input + cache usage is reported here; output_tokens is provisional.
        if (event.message?.usage) this.usage = toUsage(event.message.usage);
        return;
      }
      case 'content_block_start': {
        const idx = event.index ?? 0;
        const cb = event.content_block ?? {};
        const block: PartialBlock = {
          type: cb.type ?? '',
          id: cb.id ?? '',
          name: cb.name ?? '',
          json: '',
        };
        this.blocks.set(idx, block);
        if (block.type === 'tool_use') {
          onEvent?.({
            kind: 'tool_call_started',
            id: block.id || `toolu_${idx}`,
            name: block.name,
          });
        }
        return;
      }
      case 'content_block_delta': {
        const idx = event.index ?? 0;
        const delta = event.delta;
        if (!delta) return;
        if (delta.type === 'text_delta' && delta.text) {
          this.text += delta.text;
          onEvent?.({ kind: 'text', delta: delta.text });
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
          this.reasoning += delta.thinking;
          onEvent?.({ kind: 'reasoning', delta: delta.thinking });
        } else if (delta.type === 'input_json_delta' && delta.partial_json !== undefined) {
          // The crucial bit: tool args stream as fragments — concatenate them.
          const block = this.blocks.get(idx);
          if (block) block.json += delta.partial_json;
        }
        // signature_delta and other delta kinds carry no neutral content.
        return;
      }
      case 'message_delta': {
        if (event.delta?.stop_reason) this.finishReason = mapStopReason(event.delta.stop_reason);
        // The final, cumulative output-token count lands on message_delta.
        if (event.usage?.output_tokens !== undefined) {
          this.usage = { ...this.usage, outputTokens: event.usage.output_tokens };
        }
        return;
      }
      // content_block_stop / message_stop / ping: nothing to accumulate.
      default:
        return;
    }
  }

  finalize(): ModelTurnResult {
    const toolCalls: ToolCall[] = [...this.blocks.entries()]
      .filter(([, b]) => b.type === 'tool_use')
      .sort((a, b) => a[0] - b[0])
      .map(([idx, b]) => ({
        id: b.id || `toolu_${idx}`,
        name: b.name,
        arguments: parseArgs(b.json),
      }));
    return {
      text: this.text,
      reasoning: this.reasoning,
      toolCalls,
      usage: this.usage,
      finishReason: this.finishReason || (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
    };
  }
}

/**
 * Split a raw Messages SSE body into parsed JSON events (reading `data:` lines;
 * the redundant `event:` lines and `ping`/`[DONE]` sentinels are ignored).
 */
export function parseAnthropicSSE(raw: string): WireStreamEvent[] {
  const events: WireStreamEvent[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice('data:'.length).trim();
    if (payload === '' || payload === '[DONE]') continue;
    events.push(JSON.parse(payload) as WireStreamEvent);
  }
  return events;
}

/** Reassemble a full streamed response from parsed SSE events. */
export function reduceAnthropicStream(
  events: WireStreamEvent[],
  onEvent?: (ev: StreamEvent) => void,
): ModelTurnResult {
  const acc = new AnthropicStreamAccumulator();
  for (const e of events) acc.push(e, onEvent);
  return acc.finalize();
}

// --- request encoding --------------------------------------------------------

function toolToAnthropic(tool: ToolSpec): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

/**
 * Translate the neutral conversation into Messages API content blocks. The two
 * non-obvious rules: (1) the system prompt is NOT a message here — it is the
 * top-level `system` field; (2) neutral `tool` results become `tool_result`
 * blocks inside a USER message, and consecutive tool results are merged into a
 * single user message (parallel tool results must share one turn).
 */
function neutralToAnthropic(messages: NeutralMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let pendingToolResults: Record<string, unknown>[] | null = null;

  const flushToolResults = () => {
    if (pendingToolResults && pendingToolResults.length > 0) {
      out.push({ role: 'user', content: pendingToolResults });
    }
    pendingToolResults = null;
  };

  for (const m of messages) {
    if (m.role === 'tool') {
      if (!pendingToolResults) pendingToolResults = [];
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.callId,
        content: m.content,
      });
      continue;
    }
    flushToolResults();
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    // assistant: text block (if any) followed by tool_use blocks.
    const content: Record<string, unknown>[] = [];
    if (m.content) content.push({ type: 'text', text: m.content });
    for (const c of m.toolCalls) {
      content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.arguments });
    }
    // A turn must carry content; fall back to an empty text block if somehow bare.
    out.push({ role: 'assistant', content: content.length > 0 ? content : '' });
  }
  flushToolResults();
  return out;
}

// --- the adapter -------------------------------------------------------------

export class AnthropicAdapter implements StreamingAdapter {
  readonly id = 'anthropic';
  readonly capabilities: Capabilities = {
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    toolCalling: true,
    parallelToolCalls: true,
    jsonMode: true,
    vision: true,
    streaming: true,
    // The Messages API has no seed parameter.
    seed: false,
  };

  constructor(private readonly config: AnthropicConfig) {}

  private body(state: RunState, stream: boolean): Record<string, unknown> {
    const cfg = this.config;
    const runtime: AdapterRuntimeConfig = state.config;
    const body: Record<string, unknown> = {
      model: runtime.model || cfg.model,
      max_tokens: runtime.maxTokens ?? cfg.maxTokens,
      messages: neutralToAnthropic(state.messages),
      stream,
    };
    if (state.system !== '') body.system = state.system;
    const temperature = runtime.temperature ?? cfg.temperature;
    if (temperature !== undefined) body.temperature = temperature;
    // Neutral 'high' | 'max' maps onto Anthropic's effort levels directly.
    const effort = runtime.reasoningEffort ?? cfg.effort;
    if (effort !== undefined) body.output_config = { effort };
    if (state.tools.length > 0) {
      body.tools = state.tools.map(toolToAnthropic);
    }
    return body;
  }

  encodeRequest(state: RunState, opts?: { stream?: boolean }): ProviderRequest {
    const stream = opts?.stream ?? false;
    return {
      url: `${this.config.baseUrl}/v1/messages`,
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.apiVersion,
        'content-type': 'application/json',
      },
      body: this.body(state, stream),
    };
  }

  decodeResponse(raw: unknown): ModelTurnResult {
    const r = raw as WireMessage;
    const blocks = r.content ?? [];
    let text = '';
    let reasoning = '';
    const toolCalls: ToolCall[] = [];
    for (const b of blocks) {
      if (b.type === 'text' && b.text) text += b.text;
      else if (b.type === 'thinking' && b.thinking) reasoning += b.thinking;
      else if (b.type === 'tool_use') {
        toolCalls.push({
          id: b.id ?? '',
          name: b.name ?? '',
          arguments: b.input ?? {},
        });
      }
    }
    return {
      text,
      reasoning,
      toolCalls,
      usage: toUsage(r.usage),
      finishReason: mapStopReason(r.stop_reason) || (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
    };
  }

  pricing(usage: Usage): number {
    const row = priceFor(this.config.model);
    const cost =
      (usage.inputTokens * row.input +
        usage.cachedInputTokens * row.input * CACHE_READ_FACTOR +
        usage.outputTokens * row.output) /
      1_000_000;
    return cost;
  }

  async complete(state: RunState): Promise<ModelTurnResult> {
    const req = this.encodeRequest(state, { stream: false });
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      ...(state.signal ? { signal: state.signal } : {}),
    });
    if (!res.ok) {
      throw new Error(await providerError(res, this.config.model));
    }
    const json = (await res.json()) as unknown;
    return this.decodeResponse(json);
  }

  async stream(state: RunState, onEvent: (ev: StreamEvent) => void): Promise<ModelTurnResult> {
    const req = this.encodeRequest(state, { stream: true });
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      ...(state.signal ? { signal: state.signal } : {}),
    });
    if (!res.ok || !res.body) {
      throw new Error(await providerError(res, this.config.model));
    }
    const acc = new AnthropicStreamAccumulator();
    const decoder = new TextDecoder();
    let buffer = '';
    const consume = (line: string) => {
      const t = line.trim();
      if (!t.startsWith('data:')) return;
      const payload = t.slice('data:'.length).trim();
      if (payload !== '' && payload !== '[DONE]') {
        acc.push(JSON.parse(payload) as WireStreamEvent, onEvent);
      }
    };
    for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(part, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        consume(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
      }
    }
    // Flush any trailing buffered line.
    consume(buffer);
    return acc.finalize();
  }
}

async function providerError(res: Response, model: string): Promise<string> {
  let detail = '';
  try {
    detail = await res.text();
  } catch {
    /* ignore */
  }
  const hint =
    res.status === 401
      ? ' (check ANTHROPIC_API_KEY)'
      : res.status === 429
        ? ' (rate limited — back off and retry)'
        : res.status === 529
          ? ' (overloaded — retry with backoff)'
          : '';
  return `Anthropic request for "${model}" failed: HTTP ${res.status} ${res.statusText}${hint}${
    detail ? ` — ${detail.slice(0, 500)}` : ''
  }`;
}

/** Construct the adapter from a resolved Anthropic config. */
export function createAnthropicAdapter(config: AnthropicConfig): AnthropicAdapter {
  return new AnthropicAdapter(config);
}
