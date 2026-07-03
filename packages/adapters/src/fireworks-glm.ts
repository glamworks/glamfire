// fireworks-glm — the reference adapter: GLM-5.2 via Fireworks AI's
// OpenAI-compatible Chat Completions API (SPEC §5.4, research/01 + 02).
//
// It is now a thin specialization of the shared `openai-compatible` core
// (research/23 §3): the core owns the transport, encode/decode, pricing hook,
// and GLM's two streaming quirks (fragmented tool-call args + interleaved
// reasoning); this module supplies only Fireworks-specific values — the GLM
// capability surface, the service-tier pricing table, and the Fireworks knobs
// (`reasoning_effort`, `service_tier`). The public API is unchanged.

import { GLM_DEFAULT_MODEL } from '@glamfire/config';
import type { Capabilities, Usage } from '@glamfire/engine';
import { catalogPriceRow } from './catalog.js';
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

// --- pricing, USD per 1M tokens: input / cached-input / output ---------------
// The STANDARD (default) row derives from the shared model/provider catalog
// (./catalog.ts — the single source of truth `glam models` renders), so the
// router's cost model and the landscape view can never drift apart. The other
// tiers are the live Fireworks serverless tier prices, verified 2026-07-03
// against https://docs.fireworks.ai/serverless/pricing.
interface PriceRow {
  input: number;
  cached: number;
  output: number;
}
const STANDARD_ROW = catalogPriceRow('fireworks', GLM_DEFAULT_MODEL);
const PRICING: Record<FireworksConfig['serviceTier'], PriceRow> = {
  standard: STANDARD_ROW,
  priority: { input: 1.75, cached: 0.18, output: 5.5 },
  // Live-verified 2026-07-03: fast is 1.5x standard (the older "≈2x" estimate
  // from research/02 was stale — evergreen catalog discipline caught it).
  fast: { input: 2.1, cached: 0.21, output: 6.6 },
  // Background maps to the wire "flex" tier; Fireworks publishes no distinct
  // flex per-token row (the docs list batch at 50% of standard). ≈¼-standard
  // is the research/02 estimate, kept pending a published number.
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
      // Translate our internal tier vocabulary to Fireworks' wire values (or
      // omit) at the shared wire chokepoint, so neither the spec default nor a
      // runtime --tier override can send an invalid raw name (research/02).
      wireServiceTier: fireworksWireServiceTier,
    });
  }
}

/** Construct the adapter from a resolved Fireworks config. */
export function createFireworksGlmAdapter(config: FireworksConfig): FireworksGlmAdapter {
  return new FireworksGlmAdapter(config);
}
