// fireworks-glm — the reference adapter: GLM-5.2 via Fireworks AI's
// OpenAI-compatible Chat Completions API (SPEC §5.4, research/01 + 02).
//
// It is now a thin specialization of the shared `openai-compatible` core
// (research/23 §3): the core owns the transport, encode/decode, pricing hook,
// and GLM's two streaming quirks (fragmented tool-call args + interleaved
// reasoning); this module supplies only Fireworks-specific values — the GLM
// capability surface, the service-tier pricing table, and the Fireworks knobs
// (`reasoning_effort`, `service_tier`). The public API is unchanged.

import type { Capabilities, Usage } from '@glamfire/engine';
import type { FireworksConfig } from './config.js';
import { OpenAICompatibleAdapter } from './openai-compatible.js';

// The shared streaming/parsing helpers live in the core now; re-export them so
// existing import paths (`@glamfire/adapters` -> ./fireworks-glm) keep working.
export {
  StreamAccumulator,
  parseSSE,
  reduceStream,
  type WireStreamChunk,
} from './openai-compatible.js';

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

/** GLM-5.2 on Fireworks: FP8, 1M context (research/02). */
const FIREWORKS_GLM_CAPABILITIES: Capabilities = {
  contextWindow: 1_000_000,
  maxOutputTokens: 131_072,
  toolCalling: true,
  parallelToolCalls: true,
  jsonMode: true,
  vision: false,
  streaming: true,
  seed: true,
};

function fireworksPricing(tier: FireworksConfig['serviceTier']): (usage: Usage) => number {
  const row = PRICING[tier];
  return (usage: Usage) => {
    const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
    return (
      (uncachedInput * row.input +
        usage.cachedInputTokens * row.cached +
        usage.outputTokens * row.output) /
      1_000_000
    );
  };
}

/**
 * The reference GLM-5.2/Fireworks adapter — a specialization of the shared
 * OpenAI-compatible core. Served at FP8 (the quality baseline research/23
 * measures other providers against).
 */
export class FireworksGlmAdapter extends OpenAICompatibleAdapter {
  /** Served quantization (research/23): Fireworks GLM-5.2 is FP8 — the bar. */
  readonly quantization = 'FP8' as const;

  constructor(config: FireworksConfig) {
    super({
      id: 'fireworks-glm',
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      capabilities: FIREWORKS_GLM_CAPABILITIES,
      pricing: fireworksPricing(config.serviceTier),
      providerLabel: 'Fireworks',
      keyEnvVar: 'FIREWORKS_API_KEY',
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      seed: config.seed,
      reasoningEffort: config.reasoningEffort,
      serviceTier: config.serviceTier,
      // GLM-5.2 is a thinking model on Fireworks, which also offers service tiers.
      sendReasoningEffort: true,
      sendServiceTier: true,
    });
  }
}

/** Construct the adapter from a resolved Fireworks config. */
export function createFireworksGlmAdapter(config: FireworksConfig): FireworksGlmAdapter {
  return new FireworksGlmAdapter(config);
}
