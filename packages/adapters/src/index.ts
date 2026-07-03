// @glamfire/adapters — per-model harnesses behind one contract (SPEC §5.4).
// First-class adapters: fireworks-glm (GLM-5.2, the reference), together (GLM-5.2
// + Qwen3-Coder-Next on Together AI), anthropic (Claude family, for edge
// escalation / migration parity), and local (ANY OpenAI-compatible self-host
// server: Ollama, vLLM, SGLang, LM Studio, DwarfStar/DS4 — the $0/token
// self-host tier). The OpenAI-compatible ones share one core
// (./openai-compatible). All are gated by the shared conformance suite
// (./conformance).

export {
  BUILTIN_CATALOG,
  CATALOG_PROVIDERS,
  SELF_HOST_PROVIDERS,
  isSelfHostProvider,
  catalogEntry,
  catalogEntrySchema,
  catalogKey,
  catalogPriceRow,
  diffCatalogs,
  mergeCatalogs,
  validateCatalogEntry,
  type CatalogEntry,
  type CatalogPriceRow,
  type CatalogProvider,
  type PriceChange,
} from './catalog.js';
export {
  OpenAICompatibleAdapter,
  StreamAccumulator,
  parseSSE,
  reduceStream,
  type OpenAICompatibleSpec,
  type ServedQuantization,
  type WireStreamChunk,
} from './openai-compatible.js';
export {
  FIREWORKS_DEFAULT_BASE_URL,
  FIREWORKS_DEFAULT_MODEL,
  FIREWORKS_DEEPSEEK_FLASH_MODEL,
  FIREWORKS_DEEPSEEK_PRO_MODEL,
  fireworksConfigSchema,
  type FireworksConfig,
  type FireworksOverrides,
  type ResolveFireworksOptions,
  resolveFireworksConfig,
} from './config.js';
export {
  FIREWORKS_MODELS,
  FireworksGlmAdapter,
  createFireworksGlmAdapter,
  fireworksModelInfo,
  fireworksWireServiceTier,
  type FireworksModelInfo,
} from './fireworks-glm.js';
export {
  TOGETHER_DEFAULT_BASE_URL,
  TOGETHER_DEEPSEEK_MODEL,
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
  DWARFSTAR_DEFAULT_BASE_URL,
  LMSTUDIO_DEFAULT_BASE_URL,
  LOCAL_DEFAULT_BASE_URL,
  LOCAL_DEFAULT_CAPABILITIES,
  LOCAL_DEFAULT_CONTEXT_WINDOW,
  LOCAL_DEFAULT_MAX_OUTPUT_TOKENS,
  OLLAMA_DEFAULT_BASE_URL,
  localConfigSchema,
  resolveLocalConfig,
  type LocalConfig,
  type LocalOverrides,
  type ResolveLocalOptions,
} from './local-config.js';
export { LocalAdapter, createLocalAdapter, localCapabilities } from './local.js';
export {
  AnthropicAdapter,
  createAnthropicAdapter,
  AnthropicStreamAccumulator,
  parseAnthropicSSE,
  reduceAnthropicStream,
  mapStopReason,
  type WireStreamEvent,
} from './anthropic.js';
