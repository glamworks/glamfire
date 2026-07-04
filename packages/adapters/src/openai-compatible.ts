// openai-compatible — the reusable core shared by every OpenAI-compatible
// Chat Completions provider (Fireworks, Together AI, DeepInfra, Baseten, …).
//
// It owns the transport, request encoding (neutral -> OpenAI function-call
// grammar), response decoding, pricing, and streaming-fragment reassembly. A
// concrete adapter (fireworks-glm, together) is just this core parameterized by
// `{ baseUrl, apiKey, headers, model, capabilities, pricing, quirks }`, so every
// provider's wire handling — and every fix to it — is shared, tested once, and
// gated by the same conformance battery (SPEC §5.4, research/23 §3).
//
// Two streaming quirks every OpenAI-compatible host shares (research/01):
//   1. tool-call arguments arrive as FRAGMENTS across deltas -> reassemble by index.
//   2. reasoning ("thinking") tokens may be interleaved with content/tool calls
//      (GLM emits them; Qwen3-Coder-Next is non-thinking and emits none — the
//      accumulator tolerates both).

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

/**
 * Served quantization of a `{provider, model}` deployment (research/23 §3:
 * quantization is a deployment property, not an API field — record it honestly
 * per model). `FP4+FP8` = DeepSeek-V4's native mixed-precision release (MoE
 * expert params FP4, everything else FP8).
 */
export type ServedQuantization = 'FP8' | 'FP4' | 'FP4+FP8';

// --- OpenAI-compatible wire shapes (only the fields we read) -----------------
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
 * Stateful accumulator for a streamed OpenAI-compatible response. `push` each
 * parsed SSE chunk (in order); it emits live token events and rebuilds the full
 * turn. `finalize` returns the neutral result with tool-call arguments parsed.
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

// --- adapter parameterization -----------------------------------------------

/**
 * Everything that differs between OpenAI-compatible providers. The transport,
 * encode/decode, streaming reassembly, and the conformance contract are
 * identical; only these values change per `{provider, model}`.
 */
export interface OpenAICompatibleSpec {
  /** Stable adapter id (e.g. 'fireworks-glm', 'together'). */
  id: string;
  /**
   * Stable lowercase provider id (e.g. 'fireworks', 'together') — the company
   * actually serving the model. Surfaced in the run header and usage records so
   * a DeepSeek run through the shared adapter shows the provider, never the
   * adapter's internal id (issue #24).
   */
  provider: string;
  /** Provider base URL, e.g. `https://api.together.xyz/v1`. */
  baseUrl: string;
  /** Resolved API key (Bearer). Never logged. */
  apiKey: string;
  /** Provider-specific model id as served (e.g. `zai-org/GLM-5.2`). */
  model: string;
  /** Declared support surface for this `{provider, model}` (router filters on it). */
  capabilities: Capabilities;
  /** Per-1M-token cost function (input / cached-input / output already folded in). */
  pricing: (usage: Usage) => number;
  /** Human-readable label used in error messages, e.g. 'Together AI'. */
  providerLabel: string;
  /** Env var name surfaced on a 401, e.g. 'TOGETHER_API_KEY'. */
  keyEnvVar: string;
  /** Extra request headers merged after the standard Authorization/Content-Type. */
  headers?: Record<string, string> | undefined;
  /** Default sampling temperature when a run does not override it. */
  temperature?: number | undefined;
  /** Default max output tokens when a run does not override it. */
  maxTokens?: number | undefined;
  /** Default seed when a run does not override it. */
  seed?: number | undefined;
  /** Default reasoning effort for thinking models (only sent if `sendReasoningEffort`). */
  reasoningEffort?: 'high' | 'max' | undefined;
  /** Default Fireworks service tier (only sent if `sendServiceTier`). */
  serviceTier?: string | undefined;
  /**
   * Send `reasoning_effort` in the request body. True for GLM-style thinking
   * models; false for non-thinking models (Qwen3-Coder-Next) and hosts that
   * reject the field. (research/23 §3 — reasoning is a per-model capability.)
   */
  sendReasoningEffort: boolean;
  /** Send `service_tier` (a Fireworks-only knob; absent on Together/DeepInfra). */
  sendServiceTier: boolean;
  /**
   * Translate glamfire's INTERNAL service-tier vocabulary (the pricing/CLI
   * names, e.g. `standard`) into the provider's on-the-wire `service_tier`
   * value — or `undefined` to OMIT the field entirely. This is the single
   * chokepoint where the tier reaches the wire, so BOTH the spec default and a
   * runtime override are translated here: no raw internal name can escape to
   * the provider. When absent, the tier is sent verbatim (providers whose wire
   * vocabulary equals ours). Only consulted when `sendServiceTier` is true.
   */
  wireServiceTier?: ((tier: string | undefined) => string | undefined) | undefined;
}

/**
 * The shared OpenAI-compatible adapter. Concrete adapters subclass this and
 * supply an {@link OpenAICompatibleSpec}; they add no wire logic of their own.
 */
export class OpenAICompatibleAdapter implements StreamingAdapter {
  readonly id: string;
  /** Stable lowercase provider id serving the model (e.g. 'fireworks'). */
  readonly provider: string;
  readonly capabilities: Capabilities;

  constructor(protected readonly spec: OpenAICompatibleSpec) {
    this.id = spec.id;
    this.provider = spec.provider;
    this.capabilities = spec.capabilities;
  }

  private body(state: RunState, stream: boolean): Record<string, unknown> {
    const spec = this.spec;
    const runtime: AdapterRuntimeConfig = state.config;
    const messages = [{ role: 'system', content: state.system }, ...neutralToWire(state.messages)];
    const body: Record<string, unknown> = {
      model: runtime.model || spec.model,
      messages,
      temperature: runtime.temperature ?? spec.temperature,
      stream,
    };
    if (spec.sendReasoningEffort) {
      const effort = runtime.reasoningEffort ?? spec.reasoningEffort;
      if (effort !== undefined) body.reasoning_effort = effort;
    }
    if (spec.sendServiceTier) {
      const tier = runtime.serviceTier ?? spec.serviceTier;
      // Translate the internal tier to the provider's wire value at the single
      // wire chokepoint (or omit it). This covers both the spec default and any
      // runtime override, so a raw internal name can never reach the provider.
      const wire = spec.wireServiceTier ? spec.wireServiceTier(tier) : tier;
      if (wire !== undefined) body.service_tier = wire;
    }
    const maxTokens = runtime.maxTokens ?? spec.maxTokens;
    if (maxTokens !== undefined) body.max_tokens = maxTokens;
    const seed = runtime.seed ?? spec.seed;
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
      url: `${this.spec.baseUrl}/chat/completions`,
      headers: {
        Authorization: `Bearer ${this.spec.apiKey}`,
        'Content-Type': 'application/json',
        ...this.spec.headers,
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
    return this.spec.pricing(usage);
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
      throw new Error(await providerError(res, this.spec));
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
      throw new Error(await providerError(res, this.spec));
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

async function providerError(res: Response, spec: OpenAICompatibleSpec): Promise<string> {
  let detail = '';
  try {
    detail = await res.text();
  } catch {
    /* ignore */
  }
  const hint =
    res.status === 401
      ? ` (check ${spec.keyEnvVar})`
      : res.status === 429
        ? ' (rate limited — back off and retry)'
        : res.status === 503
          ? ' (service overloaded — retry with backoff)'
          : '';
  return `${spec.providerLabel} request for "${spec.model}" failed: HTTP ${res.status} ${res.statusText}${hint}${
    detail ? ` — ${detail.slice(0, 500)}` : ''
  }`;
}
