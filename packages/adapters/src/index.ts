// @glamfire/adapters — per-model harnesses behind one contract (SPEC §5.4).
// First-class adapters: fireworks-glm (GLM-5.2, the reference), together (GLM-5.2
// + Qwen3-Coder-Next on Together AI), and anthropic (Claude family, for edge
// escalation / migration parity). The OpenAI-compatible ones share one core
// (./openai-compatible). All are gated by the shared conformance suite
// (./conformance).

export {
  OpenAICompatibleAdapter,
  StreamAccumulator,
  parseSSE,
  reduceStream,
  type OpenAICompatibleSpec,
  type WireStreamChunk,
} from './openai-compatible.js';
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
  fireworksWireServiceTier,
} from './fireworks-glm.js';
export {
  TOGETHER_DEFAULT_BASE_URL,
  TOGETHER_GLM_MODEL,
  TOGETHER_QWEN_MODEL,
  togetherConfigSchema,
  type TogetherConfig,
  type TogetherOverrides,
  type ResolveTogetherOptions,
  resolveTogetherConfig,
} from './together-config.js';
export {
  TogetherAdapter,
  createTogetherAdapter,
  togetherModelInfo,
  TOGETHER_MODELS,
  type TogetherModelInfo,
} from './together.js';
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
