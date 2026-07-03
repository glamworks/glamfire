// together — the second inference provider: Together AI's OpenAI-compatible
// Chat Completions API (SPEC §5.4, research/23 + 25). One adapter, three
// open-weight models on a respected US host, all behind the shared
// `openai-compatible` core:
//
//   - GLM-5.2 (`zai-org/GLM-5.2`)        — a thinking model, served at **FP4**
//     (a real quantization downgrade vs Fireworks FP8 — research/23 §2). Emits
//     `reasoning_content`; we send `reasoning_effort`.
//   - Qwen3-Coder-Next (`Qwen/Qwen3-Coder-Next`) — purpose-built for coding
//     agents, served at **FP8**, 256K ctx, native tool-calling, **non-thinking**
//     (no `<think>` blocks). We do NOT send `reasoning_effort` for it.
//   - DeepSeek-V4-Pro (`deepseek-ai/DeepSeek-V4-Pro`) — the DeepSeek escalation
//     tier's SECONDARY host (primary: Fireworks). Thinking, native FP4+FP8
//     mixed precision, 512K ctx as served here (research/25).
//
// Capabilities, pricing, and served quantization are recorded **per model**
// (research/23 §3: quantization is a deployment property, not an API field), so
// routing/quality expectations are explicit. Pricing is per 1M tokens.

import type { Capabilities, Usage } from '@glamfire/engine';
import { catalogPriceRow } from './catalog.js';
import { OpenAICompatibleAdapter, type ServedQuantization } from './openai-compatible.js';
import {
  TOGETHER_DEEPSEEK_MODEL,
  TOGETHER_GLM_MODEL,
  TOGETHER_QWEN_MODEL,
  type TogetherConfig,
} from './together-config.js';

/** USD per 1M tokens: input / cached-input / output. */
interface PriceRow {
  input: number;
  cached: number;
  output: number;
}

/** Everything that varies per Together `{model}` — kept honest and explicit. */
export interface TogetherModelInfo {
  /** Declared support surface (router filters candidates on it). */
  capabilities: Capabilities;
  /**
   * Served quantization (research/23/25): GLM-5.2 = FP4 downgrade; Qwen = FP8;
   * DeepSeek-V4-Pro = its native FP4+FP8 mixed precision.
   */
  quantization: ServedQuantization;
  /** Thinking model? GLM/DeepSeek yes (send reasoning_effort); Qwen3-Coder-Next no. */
  thinking: boolean;
  /** Per-token list price (research/23/25). */
  pricing: PriceRow;
}

const GLM_CAPABILITIES: Capabilities = {
  // Together's GLM-5.2 model page lists a 256K context window (research/23 §2).
  contextWindow: 256_000,
  maxOutputTokens: 131_072,
  toolCalling: true,
  parallelToolCalls: true,
  jsonMode: true,
  vision: false,
  streaming: true,
  seed: true,
};

const DEEPSEEK_CAPABILITIES: Capabilities = {
  // DeepSeek-V4-Pro is natively 1M-context; Together currently serves 512K
  // (research/25 + Together launch announcement). 384K max output (research/25).
  contextWindow: 524_288,
  maxOutputTokens: 393_216,
  toolCalling: true,
  parallelToolCalls: true,
  jsonMode: true,
  vision: false,
  streaming: true,
  seed: true,
};

const QWEN_CAPABILITIES: Capabilities = {
  // Qwen3-Coder-Next: 256K native (Together lists 262K); 80B/3B-active MoE,
  // RL-trained for coding agents with native tool-calling (research/23 §1).
  contextWindow: 262_144,
  maxOutputTokens: 131_072,
  toolCalling: true,
  parallelToolCalls: true,
  jsonMode: true,
  vision: false,
  streaming: true,
  seed: true,
};

/**
 * Verified Together `{model}` table. A model is only "supported" once it has an
 * entry here AND passes the conformance battery (SPEC §5.4). Unknown models
 * fail loud rather than fake capabilities/pricing (research/23 §3).
 */
export const TOGETHER_MODELS: Record<string, TogetherModelInfo> = {
  [TOGETHER_GLM_MODEL]: {
    capabilities: GLM_CAPABILITIES,
    // research/23 §2: Together's GLM-5.2 page lists FP4 — a downgrade vs the
    // Fireworks/Baseten FP8 baseline. Surfaced as an honesty caveat for routing.
    quantization: 'FP4',
    thinking: true,
    // Derived from the shared model/provider catalog (./catalog.ts) — the
    // single source of truth `glam models` renders, re-verified 2026-07-03
    // against the Together GLM-5.2 model page ($1.40 / $0.26 cached / $4.40).
    pricing: catalogPriceRow('together', TOGETHER_GLM_MODEL),
  },
  [TOGETHER_QWEN_MODEL]: {
    capabilities: QWEN_CAPABILITIES,
    quantization: 'FP8',
    thinking: false,
    // Derived from the shared catalog. CAVEAT recorded there too: Together
    // serves Qwen3-Coder-Next via a DEDICATED endpoint (not turnkey
    // serverless); this is Qwen's reference serverless list price — verify a
    // dedicated deployment against the live invoice (research/23 §1).
    pricing: catalogPriceRow('together', TOGETHER_QWEN_MODEL),
  },
  [TOGETHER_DEEPSEEK_MODEL]: {
    capabilities: DEEPSEEK_CAPABILITIES,
    // DeepSeek-V4's native mixed-precision release: MoE expert params FP4,
    // everything else FP8 (Together model page). Not a downgrade — it is how
    // the weights ship. Fireworks is still the primary DeepSeek host (1M ctx
    // vs Together's 512K).
    quantization: 'FP4+FP8',
    thinking: true,
    // Priced through the catalog (Together model page, live 2026-07-03:
    // $1.74/$0.20/$3.48). The 2026 launch blog said $2.10/$4.40 — sources
    // conflict; the live model page wins pending reconciliation against a
    // real invoice once a TOGETHER_API_KEY exists (see MANUAL-VERIFY.md).
    pricing: catalogPriceRow('together', TOGETHER_DEEPSEEK_MODEL),
  },
};

/** Look up verified per-model metadata, failing loud for an unknown model. */
export function togetherModelInfo(model: string): TogetherModelInfo {
  const info = TOGETHER_MODELS[model];
  if (!info) {
    const supported = Object.keys(TOGETHER_MODELS).join(', ');
    throw new Error(
      `unsupported Together model "${model}": glamfire ships verified capabilities, ` +
        `pricing, and conformance for: ${supported}`,
    );
  }
  return info;
}

function togetherPricing(row: PriceRow): (usage: Usage) => number {
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
 * The Together AI adapter — a specialization of the shared OpenAI-compatible
 * core. Capabilities, pricing, served quantization, and whether to send
 * `reasoning_effort` are all selected from {@link TOGETHER_MODELS} by the
 * resolved model id.
 */
export class TogetherAdapter extends OpenAICompatibleAdapter {
  /** Served quantization for the configured model — research/23/25. */
  readonly quantization: ServedQuantization;
  /** Full verified metadata for the configured model. */
  readonly modelInfo: TogetherModelInfo;

  constructor(config: TogetherConfig) {
    const info = togetherModelInfo(config.model);
    super({
      id: 'together',
      provider: 'together',
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      capabilities: info.capabilities,
      pricing: togetherPricing(info.pricing),
      providerLabel: 'Together AI',
      keyEnvVar: 'TOGETHER_API_KEY',
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      seed: config.seed,
      reasoningEffort: config.reasoningEffort,
      // GLM-5.2 is a thinking model; Qwen3-Coder-Next is non-thinking. Together
      // has no Fireworks-style service tier.
      sendReasoningEffort: info.thinking,
      sendServiceTier: false,
    });
    this.quantization = info.quantization;
    this.modelInfo = info;
  }
}

/** Construct the adapter from a resolved Together config. */
export function createTogetherAdapter(config: TogetherConfig): TogetherAdapter {
  return new TogetherAdapter(config);
}
