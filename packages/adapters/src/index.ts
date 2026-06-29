// @glamfire/adapters — per-model harnesses behind one contract (SPEC §5.4).
// First-class reference adapter: fireworks-glm (GLM-5.2 via Fireworks AI).

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
