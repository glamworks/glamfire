// fireworks-glm — the reference adapter: Fireworks AI's OpenAI-compatible Chat
// Completions API (SPEC §5.4, research/01 + 02 + 25).
//
// It is a thin specialization of the shared `openai-compatible` core
// (research/23 §3): the core owns the transport, encode/decode, pricing hook,
// and the two streaming quirks (fragmented tool-call args + interleaved
// reasoning); this module supplies only Fireworks-specific values — the
// per-model capability surface, the service-tier pricing tables, and the
// Fireworks knobs (`reasoning_effort`, `service_tier`).
//
// One adapter, three verified serverless models (research/25):
//   - GLM-5.2          (glm-5p2)           — default workhorse, FP8, 1M ctx, thinking.
//   - DeepSeek-V4-Pro  (deepseek-v4-pro)   — open escalation tier, FP8, 1M ctx,
//                                            thinking, MIT weights.
//   - DeepSeek-V4-Flash(deepseek-v4-flash) — budget tier, FP8, 1M ctx, thinking;
//                                            cheapest capable 1M-context model.
// The public API is unchanged; per-model metadata is selected by the resolved
// model id, and unknown models fail loud (no faked capabilities or pricing).

import { GLM_DEFAULT_MODEL } from '@glamfire/config';
import type { Capabilities, Usage } from '@glamfire/engine';
import { catalogPriceRow } from './catalog.js';
import type { FireworksConfig } from './config.js';
import {
  FIREWORKS_DEEPSEEK_FLASH_MODEL,
  FIREWORKS_DEEPSEEK_PRO_MODEL,
  FIREWORKS_DEFAULT_MODEL,
} from './config.js';
import { OpenAICompatibleAdapter, type ServedQuantization } from './openai-compatible.js';

// The shared streaming/parsing helpers live in the core now; re-export them so
// existing import paths (`@glamfire/adapters` -> ./fireworks-glm) keep working.
export {
  StreamAccumulator,
  parseSSE,
  reduceStream,
  type WireStreamChunk,
} from './openai-compatible.js';

// --- pricing, USD per 1M tokens: input / cached-input / output ---------------
// Every STANDARD (default-tier) row derives from the shared model/provider
// catalog (./catalog.ts — the single source of truth `glam models` renders),
// so the router's cost model and the landscape view can never drift apart.
// The other tiers are the live Fireworks serverless tier prices, verified
// 2026-07-03 against https://docs.fireworks.ai/serverless/pricing.
interface PriceRow {
  input: number;
  cached: number;
  output: number;
}

type ServiceTier = FireworksConfig['serviceTier'];

/** GLM-5.2 tier table (standard row from the catalog; tiers re-confirmed docs.fireworks.ai 2026-07-03). */
const GLM_PRICING: Partial<Record<ServiceTier, PriceRow>> = {
  standard: catalogPriceRow('fireworks', GLM_DEFAULT_MODEL),
  priority: { input: 1.75, cached: 0.18, output: 5.5 },
  // Live-verified 2026-07-03: fast is 1.5x standard (the older "≈2x" estimate
  // from research/02 was stale — evergreen catalog discipline caught it).
  fast: { input: 2.1, cached: 0.21, output: 6.6 },
  // Background maps to the wire "flex" tier; Fireworks publishes no distinct
  // flex per-token row (the docs list batch at 50% of standard). ≈¼-standard
  // is the research/02 estimate, kept pending a published number.
  background: { input: 0.35, cached: 0.035, output: 1.1 },
};

/** DeepSeek-V4-Pro tier table (standard row from the catalog; tiers from docs.fireworks.ai/serverless/pricing, 2026-07-03). */
const DEEPSEEK_PRO_PRICING: Partial<Record<ServiceTier, PriceRow>> = {
  standard: catalogPriceRow('fireworks', FIREWORKS_DEEPSEEK_PRO_MODEL),
  priority: { input: 2.61, cached: 0.218, output: 5.22 },
  // Same conventions as GLM: fast ≈ 2× standard (wire alias of priority speed);
  // background ≈ ¼ standard (the flex/batch tier).
  fast: { input: 3.48, cached: 0.29, output: 6.96 },
  background: { input: 0.435, cached: 0.03625, output: 0.87 },
};

/**
 * DeepSeek-V4-Flash tier table (docs.fireworks.ai/serverless/pricing,
 * 2026-07-03). Fireworks lists NO Priority tier for Flash, so the `priority`
 * and `fast` internal tiers are intentionally absent — requesting them fails
 * loud instead of billing a made-up rate.
 */
const DEEPSEEK_FLASH_PRICING: Partial<Record<ServiceTier, PriceRow>> = {
  standard: catalogPriceRow('fireworks', FIREWORKS_DEEPSEEK_FLASH_MODEL),
  // Background ≈ ¼ standard (flex/batch convention, same as the other rows).
  background: { input: 0.035, cached: 0.007, output: 0.07 },
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

/**
 * DeepSeek-V4 family on Fireworks: FP8, 1,048,576-token context (live model
 * API, 2026-07-03), 384K max output (research/25). Parallel tool calls and
 * seed verified live 2026-07-03 (two parallel `get_weather` calls returned in
 * one turn with `seed: 42` accepted).
 */
const FIREWORKS_DEEPSEEK_CAPABILITIES: Capabilities = {
  contextWindow: 1_048_576,
  maxOutputTokens: 393_216,
  toolCalling: true,
  parallelToolCalls: true,
  jsonMode: true,
  vision: false,
  streaming: true,
  seed: true,
};

/** Everything that varies per Fireworks `{model}` — kept honest and explicit. */
export interface FireworksModelInfo {
  /** Declared support surface (router filters candidates on it). */
  capabilities: Capabilities;
  /** Served quantization (research/23/25): Fireworks serves flagships at FP8. */
  quantization: ServedQuantization;
  /** Thinking model? All three current entries emit `reasoning_content`. */
  thinking: boolean;
  /**
   * Per-tier list price. A missing tier means Fireworks does not offer it for
   * this model — the adapter fails loud rather than inventing a rate.
   */
  pricing: Partial<Record<ServiceTier, PriceRow>>;
}

/**
 * Verified Fireworks `{model}` table. A model is only "supported" once it has
 * an entry here AND passes the conformance battery (SPEC §5.4). Unknown models
 * fail loud rather than fake capabilities/pricing (research/23 §3).
 */
export const FIREWORKS_MODELS: Record<string, FireworksModelInfo> = {
  [FIREWORKS_DEFAULT_MODEL]: {
    capabilities: FIREWORKS_GLM_CAPABILITIES,
    quantization: 'FP8',
    thinking: true,
    pricing: GLM_PRICING,
  },
  [FIREWORKS_DEEPSEEK_PRO_MODEL]: {
    capabilities: FIREWORKS_DEEPSEEK_CAPABILITIES,
    quantization: 'FP8',
    thinking: true,
    pricing: DEEPSEEK_PRO_PRICING,
  },
  [FIREWORKS_DEEPSEEK_FLASH_MODEL]: {
    capabilities: FIREWORKS_DEEPSEEK_CAPABILITIES,
    quantization: 'FP8',
    thinking: true,
    pricing: DEEPSEEK_FLASH_PRICING,
  },
};

/** Look up verified per-model metadata, failing loud for an unknown model. */
export function fireworksModelInfo(model: string): FireworksModelInfo {
  const info = FIREWORKS_MODELS[model];
  if (!info) {
    const supported = Object.keys(FIREWORKS_MODELS).join(', ');
    throw new Error(
      `unsupported Fireworks model "${model}": glamfire ships verified capabilities, ` +
        `pricing, and conformance for: ${supported}`,
    );
  }
  return info;
}

/**
 * Map glamfire's INTERNAL service-tier vocabulary (`standard | priority | fast |
 * background` — the names used by the pricing table above and by the CLI/router)
 * to Fireworks' OpenAI-compatible wire `service_tier` value. Fireworks only
 * accepts `auto | default | flex | priority`; sending our internal names
 * verbatim (e.g. the default `standard`) is rejected with HTTP 400. Returning
 * `undefined` OMITS the field, which selects Fireworks' default cheapest
 * on-demand tier.
 *
 *   standard   -> undefined (omit)  Fireworks' default cheapest on-demand tier
 *   background  -> "flex"           cheaper / slower
 *   priority    -> "priority"       premium / faster
 *   fast        -> "priority"       Fireworks has NO distinct "fast" wire tier;
 *                                   `priority` is its fastest real tier. Honesty
 *                                   caveat: our PRICING table still distinguishes
 *                                   `fast` from `priority` (fast ≈ 2× standard),
 *                                   but on the wire both request the same
 *                                   priority-speed tier — `fast` is an alias.
 *
 * Any value outside the internal enum returns `undefined` (omit) rather than
 * forwarding a raw string, so an invalid tier can never reach the wire.
 */
export function fireworksWireServiceTier(tier: string | undefined): string | undefined {
  switch (tier) {
    case 'standard':
      return undefined;
    case 'background':
      return 'flex';
    case 'priority':
      return 'priority';
    // Fireworks has no distinct "fast" wire tier; priority is its fastest real
    // tier. Pricing still separates them; on the wire `fast` is a priority alias.
    case 'fast':
      return 'priority';
    default:
      return undefined;
  }
}

function fireworksPricing(model: string, tier: ServiceTier): (usage: Usage) => number {
  const info = fireworksModelInfo(model);
  const row = info.pricing[tier];
  if (!row) {
    const offered = Object.keys(info.pricing).join(', ');
    throw new Error(
      `Fireworks does not offer the "${tier}" service tier for "${model}" ` +
        `(offered: ${offered}) — pick an offered tier instead of an invented rate`,
    );
  }
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
 * The reference Fireworks adapter — a specialization of the shared
 * OpenAI-compatible core. Capabilities, pricing, quantization, and whether to
 * send `reasoning_effort` are all selected from {@link FIREWORKS_MODELS} by the
 * resolved model id. Fireworks serves these flagships at FP8 (the quality
 * baseline research/23 measures other providers against).
 */
export class FireworksGlmAdapter extends OpenAICompatibleAdapter {
  /** Served quantization for the configured model (research/23/25). */
  readonly quantization: ServedQuantization;
  /** Full verified metadata for the configured model. */
  readonly modelInfo: FireworksModelInfo;

  constructor(config: FireworksConfig) {
    const info = fireworksModelInfo(config.model);
    super({
      id: 'fireworks-glm',
      provider: 'fireworks',
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      capabilities: info.capabilities,
      pricing: fireworksPricing(config.model, config.serviceTier),
      providerLabel: 'Fireworks',
      keyEnvVar: 'FIREWORKS_API_KEY',
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      seed: config.seed,
      reasoningEffort: config.reasoningEffort,
      serviceTier: config.serviceTier,
      // GLM-5.2 and both DeepSeek-V4 models are thinking models on Fireworks
      // (all emit reasoning_content and accept reasoning_effort — verified live).
      sendReasoningEffort: info.thinking,
      sendServiceTier: true,
      // Translate our internal tier vocabulary to Fireworks' wire values (or
      // omit) at the shared wire chokepoint, so neither the spec default nor a
      // runtime --tier override can send an invalid raw name (research/02).
      wireServiceTier: fireworksWireServiceTier,
    });
    this.quantization = info.quantization;
    this.modelInfo = info;
  }
}

/** Construct the adapter from a resolved Fireworks config. */
export function createFireworksGlmAdapter(config: FireworksConfig): FireworksGlmAdapter {
  return new FireworksGlmAdapter(config);
}
