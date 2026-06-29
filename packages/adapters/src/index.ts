// @glamfire/adapters — per-model harnesses behind one contract (SPEC §5.4).
// First-class adapters: fireworks-glm (GLM-5.2, the reference) and anthropic
// (Claude family, for edge escalation / migration parity). Both are gated by
// the shared conformance suite (./conformance).

export {
  FIREWORKS_DEFAULT_BASE_URL,
  FIREWORKS_DEFAULT_MODEL,
  fireworksConfigSchema,
  type FireworksConfig,
  type FireworksOverrides,
  type ResolveFireworksOptions,
  resolveFireworksConfig,
} from './config.js';
export {
  FireworksGlmAdapter,
  createFireworksGlmAdapter,
  StreamAccumulator,
  parseSSE,
  reduceStream,
  type WireStreamChunk,
} from './fireworks-glm.js';
export {
  ANTHROPIC_DEFAULT_BASE_URL,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_DEFAULT_VERSION,
  anthropicConfigSchema,
  type AnthropicConfig,
  type AnthropicOverrides,
  type ResolveAnthropicOptions,
  resolveAnthropicConfig,
} from './anthropic-config.js';
export {
  AnthropicAdapter,
  createAnthropicAdapter,
  AnthropicStreamAccumulator,
  parseAnthropicSSE,
  reduceAnthropicStream,
  mapStopReason,
  type WireStreamEvent,
} from './anthropic.js';
