// together — the second inference provider: Together AI's OpenAI-compatible
// Chat Completions API (SPEC §5.4, research/23). One adapter, two open-weight
// models on a respected US host, both behind the shared `openai-compatible`
// core:
//
//   - GLM-5.2 (`zai-org/GLM-5.2`)        — a thinking model, served at **FP4**
//     (a real quantization downgrade vs Fireworks FP8 — research/23 §2). Emits
//     `reasoning_content`; we send `reasoning_effort`.
//   - Qwen3-Coder-Next (`Qwen/Qwen3-Coder-Next`) — purpose-built for coding
//     agents, served at **FP8**, 256K ctx, native tool-calling, **non-thinking**
//     (no `<think>` blocks). We do NOT send `reasoning_effort` for it.
//
// Capabilities, pricing, and served quantization are recorded **per model**
// (research/23 §3: quantization is a deployment property, not an API field), so
// routing/quality expectations are explicit. Pricing is per 1M tokens.

import type { Capabilities, Usage } from '@glamfire/engine';
import { OpenAICompatibleAdapter } from './openai-compatible.js';
import { TOGETHER_GLM_MODEL, TOGETHER_QWEN_MODEL, type TogetherConfig } from './together-config.js';

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
  /** Served quantization (research/23): GLM-5.2 = FP4 downgrade; Qwen = FP8. */
  quantization: 'FP8' | 'FP4';
  /** Thinking model? GLM yes (sends reasoning_effort); Qwen3-Coder-Next no. */
  thinking: boolean;
  /** Per-token list price (research/23). */
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
    // research/23 §2 (Together GLM-5.2 model page): $1.40 in / $0.26 cached / $4.40 out.
    pricing: { input: 1.4, cached: 0.26, output: 4.4 },
  },
  [TOGETHER_QWEN_MODEL]: {
    capabilities: QWEN_CAPABILITIES,
    quantization: 'FP8',
    thinking: false,
    // research/23 §1: Qwen reference serverless list is $0.11 in / $0.80 out.
    // Together serves Qwen3-Coder-Next via a DEDICATED endpoint (not turnkey
    // serverless), so the per-token rate can vary by deployment; cache reads are
    // modeled at ~0.1x input (the common prefix-cache convention) — verify
    // against the live dedicated-endpoint invoice (see MANUAL-VERIFY.md).
    pricing: { input: 0.11, cached: 0.011, output: 0.8 },
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
  /** Served quantization for the configured model (FP8 or FP4) — research/23. */
  readonly quantization: 'FP8' | 'FP4';
  /** Full verified metadata for the configured model. */
  readonly modelInfo: TogetherModelInfo;

  constructor(config: TogetherConfig) {
    const info = togetherModelInfo(config.model);
    super({
      id: 'together',
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
