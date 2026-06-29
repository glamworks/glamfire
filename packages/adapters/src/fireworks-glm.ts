// fireworks-glm — the reference adapter: GLM-5.2 via Fireworks AI's
// OpenAI-compatible Chat Completions API (SPEC §5.4, research/01 + 02).
//
// Handles GLM's two streaming quirks (research/01):
//   1. tool-call arguments arrive as FRAGMENTS across deltas -> reassemble by index.
//   2. reasoning ("thinking") tokens are interleaved with content and tool calls.

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
import type { FireworksConfig } from './config.js';

// --- pricing (research/02), USD per 1M tokens: input / cached-input / output --
interface PriceRow {
  input: number;
  cached: number;
  output: number;
}
const PRICING: Record<FireworksConfig['serviceTier'], PriceRow> = {
  standard: { input: 1.4, cached: 0.14, output: 4.4 },
  priority: { input: 1.75, cached: 0.18, output: 5.5 },
  // Fast ≈ 2× Standard; Background ≈ ¼ Standard.
  fast: { input: 2.8, cached: 0.28, output: 8.8 },
  background: { input: 0.35, cached: 0.035, output: 1.1 },
};

// --- OpenAI-compatible wire shapes (only the fields we read) ----------------
interface WireToolCall {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}
interface WireUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}
interface WireMessage {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  tool_calls?: WireToolCall[];
}
interface WireChoiceFull {
  message?: WireMessage;
  finish_reason?: string | null;
}
interface WireCompletion {
  choices?: WireChoiceFull[];
  usage?: WireUsage;
}
interface WireDelta {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  tool_calls?: WireToolCall[];
}
interface WireChoiceDelta {
  delta?: WireDelta;
  finish_reason?: string | null;
}
export interface WireStreamChunk {
  choices?: WireChoiceDelta[];
  usage?: WireUsage;
}

function toUsage(u: WireUsage | undefined): Usage {
  return {
    inputTokens: u?.prompt_tokens ?? 0,
    cachedInputTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
  };
}

// --- streaming accumulator: reassembles fragmented tool calls + interleaved reasoning ---

interface PartialToolCall {
  id: string;
  name: string;
  args: string;
}

/**
 * Stateful accumulator for a streamed GLM response. `push` each parsed SSE
 * chunk (in order); it emits live token events and rebuilds the full turn.
 * `finalize` returns the neutral result with tool-call arguments parsed.
 */
export class StreamAccumulator {
  private text = '';
  private reasoning = '';
  private finishReason = '';
  private usage: Usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  /** Keyed by tool-call index so fragments across deltas land in the right slot. */
  private readonly toolCalls = new Map<number, PartialToolCall>();
  private readonly started = new Set<number>();

  push(chunk: WireStreamChunk, onEvent?: (ev: StreamEvent) => void): void {
    if (chunk.usage) this.usage = toUsage(chunk.usage);
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) this.finishReason = choice.finish_reason;
    const delta = choice.delta;
    if (!delta) return;

    const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
    if (reasoningDelta) {
      this.reasoning += reasoningDelta;
      onEvent?.({ kind: 'reasoning', delta: reasoningDelta });
    }
    if (delta.content) {
      this.text += delta.content;
      onEvent?.({ kind: 'text', delta: delta.content });
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        let slot = this.toolCalls.get(idx);
        if (!slot) {
          slot = { id: '', name: '', args: '' };
          this.toolCalls.set(idx, slot);
        }
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name = tc.function.name;
        // The crucial bit: arguments stream as fragments — concatenate them.
        if (tc.function?.arguments) slot.args += tc.function.arguments;
        if (slot.name && !this.started.has(idx)) {
          this.started.add(idx);
          onEvent?.({ kind: 'tool_call_started', id: slot.id || `call_${idx}`, name: slot.name });
        }
      }
    }
  }

  finalize(): ModelTurnResult {
    const toolCalls: ToolCall[] = [...this.toolCalls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, slot]) => ({
        id: slot.id || `call_${idx}`,
        name: slot.name,
        arguments: parseArgs(slot.args),
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

/**
 * Split a raw SSE body into parsed JSON chunks (dropping the `[DONE]`
 * sentinel). Tolerant of multi-line `data:` framing and blank separators.
 */
export function parseSSE(raw: string): WireStreamChunk[] {
  const chunks: WireStreamChunk[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice('data:'.length).trim();
    if (payload === '' || payload === '[DONE]') continue;
    chunks.push(JSON.parse(payload) as WireStreamChunk);
  }
  return chunks;
}

/** Reassemble a full streamed response from raw SSE text (used by tests + live path). */
export function reduceStream(
  chunks: WireStreamChunk[],
  onEvent?: (ev: StreamEvent) => void,
): ModelTurnResult {
  const acc = new StreamAccumulator();
  for (const chunk of chunks) acc.push(chunk, onEvent);
  return acc.finalize();
}

// --- request encoding -------------------------------------------------------

function toolToFunction(tool: ToolSpec): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function neutralToWire(messages: NeutralMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.callId, name: m.name, content: m.content };
    }
    // assistant
    const out: Record<string, unknown> = { role: 'assistant', content: m.content };
    if (m.toolCalls.length > 0) {
      out.tool_calls = m.toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.arguments) },
      }));
    }
    return out;
  });
}

// --- the adapter ------------------------------------------------------------

export class FireworksGlmAdapter implements StreamingAdapter {
  readonly id = 'fireworks-glm';
  readonly capabilities: Capabilities = {
    contextWindow: 1_000_000,
    maxOutputTokens: 131_072,
    toolCalling: true,
    parallelToolCalls: true,
    jsonMode: true,
    vision: false,
    streaming: true,
    seed: true,
  };

  constructor(private readonly config: FireworksConfig) {}

  private body(state: RunState, stream: boolean): Record<string, unknown> {
    const cfg = this.config;
    const runtime: AdapterRuntimeConfig = state.config;
    const messages = [{ role: 'system', content: state.system }, ...neutralToWire(state.messages)];
    const body: Record<string, unknown> = {
      model: runtime.model || cfg.model,
      messages,
      temperature: runtime.temperature ?? cfg.temperature,
      reasoning_effort: runtime.reasoningEffort ?? cfg.reasoningEffort,
      service_tier: runtime.serviceTier ?? cfg.serviceTier,
      stream,
    };
    const maxTokens = runtime.maxTokens ?? cfg.maxTokens;
    if (maxTokens !== undefined) body.max_tokens = maxTokens;
    const seed = runtime.seed ?? cfg.seed;
    if (seed !== undefined) body.seed = seed;
    if (state.tools.length > 0) {
      body.tools = state.tools.map(toolToFunction);
      body.tool_choice = 'auto';
    }
    if (stream) body.stream_options = { include_usage: true };
    return body;
  }

  encodeRequest(state: RunState, opts?: { stream?: boolean }): ProviderRequest {
    const stream = opts?.stream ?? false;
    return {
      url: `${this.config.baseUrl}/chat/completions`,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: this.body(state, stream),
    };
  }

  decodeResponse(raw: unknown): ModelTurnResult {
    const r = raw as WireCompletion;
    const choice = r.choices?.[0];
    const msg = choice?.message ?? {};
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc, i) => ({
      id: tc.id || `call_${i}`,
      name: tc.function?.name ?? '',
      arguments: parseArgs(tc.function?.arguments ?? ''),
    }));
    return {
      text: msg.content ?? '',
      reasoning: msg.reasoning_content ?? msg.reasoning ?? '',
      toolCalls,
      usage: toUsage(r.usage),
      finishReason: choice?.finish_reason ?? (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
    };
  }

  pricing(usage: Usage): number {
    const row = PRICING[this.config.serviceTier];
    const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
    const cost =
      (uncachedInput * row.input +
        usage.cachedInputTokens * row.cached +
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
    });
    if (!res.ok || !res.body) {
      throw new Error(await providerError(res, this.config.model));
    }
    const acc = new StreamAccumulator();
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(part, { stream: true });
      // SSE events are separated by a blank line; process complete lines only.
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const t = line.trim();
        if (t.startsWith('data:')) {
          const payload = t.slice('data:'.length).trim();
          if (payload !== '' && payload !== '[DONE]') {
            acc.push(JSON.parse(payload) as WireStreamChunk, onEvent);
          }
        }
        nl = buffer.indexOf('\n');
      }
    }
    // Flush any trailing buffered line.
    const tail = buffer.trim();
    if (tail.startsWith('data:')) {
      const payload = tail.slice('data:'.length).trim();
      if (payload !== '' && payload !== '[DONE]') {
        acc.push(JSON.parse(payload) as WireStreamChunk, onEvent);
      }
    }
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
      ? ' (check FIREWORKS_API_KEY)'
      : res.status === 429
        ? ' (rate limited — back off and retry)'
        : res.status === 503
          ? ' (service overloaded — retry with backoff)'
          : '';
  return `Fireworks request for "${model}" failed: HTTP ${res.status} ${res.statusText}${hint}${
    detail ? ` — ${detail.slice(0, 500)}` : ''
  }`;
}

/** Construct the adapter from a resolved Fireworks config. */
export function createFireworksGlmAdapter(config: FireworksConfig): FireworksGlmAdapter {
  return new FireworksGlmAdapter(config);
}
