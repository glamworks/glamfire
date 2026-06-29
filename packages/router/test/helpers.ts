// Real in-test adapter implementations of the engine's AdapterContract. These
// are NOT mocks of a provider wire — they implement the actual StreamingAdapter
// interface with deterministic, scripted turns (exactly like the engine's own
// loop.test.ts), so the router's cascade can be proven end-to-end through the
// REAL engine loop without touching a network.

import type {
  AdapterRuntimeConfig,
  Capabilities,
  ModelTurnResult,
  RunState,
  StreamEvent,
  StreamingAdapter,
  Usage,
} from '@glamfire/engine';
import { descriptorFromAdapter } from '../src/registry.js';
import type { ModelDescriptor } from '../src/types.js';

export function fullCaps(over: Partial<Capabilities> = {}): Capabilities {
  return {
    contextWindow: 1_000_000,
    maxOutputTokens: 100_000,
    toolCalling: true,
    parallelToolCalls: true,
    jsonMode: true,
    vision: false,
    streaming: true,
    seed: true,
    ...over,
  };
}

export function turn(partial: Partial<ModelTurnResult>): ModelTurnResult {
  return {
    text: '',
    reasoning: '',
    toolCalls: [],
    usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 },
    finishReason: 'stop',
    ...partial,
  };
}

export interface ScriptedAdapterSpec {
  id: string;
  /** USD per 1M (input+output) tokens — a flat, easy-to-reason-about rate. */
  ratePerMillion: number;
  capabilities?: Capabilities;
  /** Scripted turns; defaults to a single empty final answer. */
  turns?: ModelTurnResult[];
}

/** A deterministic adapter that replays a fixed sequence of turns. */
export function scriptedAdapter(spec: ScriptedAdapterSpec): StreamingAdapter {
  const turns = spec.turns ?? [turn({ text: 'ok' })];
  let i = 0;
  const next = (): ModelTurnResult => {
    const t = turns[Math.min(i, turns.length - 1)] as ModelTurnResult;
    i += 1;
    return t;
  };
  return {
    id: spec.id,
    capabilities: spec.capabilities ?? fullCaps(),
    encodeRequest: () => ({ url: '', headers: {}, body: {} }),
    decodeResponse: () => next(),
    pricing: (u: Usage) => ((u.inputTokens + u.outputTokens) * spec.ratePerMillion) / 1_000_000,
    stream: async (_state: RunState, _onEvent: (ev: StreamEvent) => void) => next(),
    complete: async (_state: RunState) => next(),
  };
}

/** Build a registry descriptor for a scripted adapter at a given model id. */
export function descriptor(
  modelId: string,
  spec: Omit<ScriptedAdapterSpec, 'id'>,
): ModelDescriptor {
  const adapter = scriptedAdapter({ id: `adapter:${modelId}`, ...spec });
  const config: AdapterRuntimeConfig = { model: modelId };
  return descriptorFromAdapter(adapter, config);
}
