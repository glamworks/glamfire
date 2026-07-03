// Provider configuration for the Fireworks GLM adapter, resolved *through* the
// layered @glamfire/config subsystem (SPEC §6) and validated with zod.
//
// The adapter needs a flat provider slice (apiKey, baseUrl, model, GLM knobs).
// That slice is derived from a fully-resolved `GlamConfig` (built-in defaults <
// ~/.glam/config.toml < ./glam.toml < env, assembled by `loadConfig`), then
// overlaid with adapter-specific env vars (FIREWORKS_*) and explicit overrides
// (CLI flags). The API key is resolved from the provider's credential reference
// (env var or OS keychain) — never inline, never logged.

import {
  type GlamConfig,
  builtinDefaults,
  describeCredentialRef,
  resolveCredential,
} from '@glamfire/config';
import { z } from 'zod';

export const FIREWORKS_DEFAULT_BASE_URL = 'https://api.fireworks.ai/inference/v1';
/** Fireworks model id for GLM-5.2 serverless (research/02). */
export const FIREWORKS_DEFAULT_MODEL = 'accounts/fireworks/models/glm-5p2';
/**
 * DeepSeek-V4-Pro on Fireworks serverless (research/25): 1.6T/49B-active MoE,
 * MIT weights, 1M context, FP8, tool calling. Verified live against the
 * Fireworks model API 2026-07-03 (state READY, supportsServerless,
 * supportsTools, contextLength 1048576).
 */
export const FIREWORKS_DEEPSEEK_PRO_MODEL = 'accounts/fireworks/models/deepseek-v4-pro';
/**
 * DeepSeek-V4-Flash on Fireworks serverless (research/25): 284B/13B-active MoE,
 * the cheapest capable 1M-context model anywhere ($0.14/$0.28). Verified live
 * 2026-07-03 (state READY, supportsServerless, supportsTools, 1048576 ctx).
 * NOTE: not listed by `GET /inference/v1/models` (that list is a curated
 * subset) — the model resolves and serves on chat/completions regardless.
 */
export const FIREWORKS_DEEPSEEK_FLASH_MODEL = 'accounts/fireworks/models/deepseek-v4-flash';

export const fireworksConfigSchema = z.object({
  apiKey: z.string().min(1, 'FIREWORKS_API_KEY is required to call Fireworks'),
  baseUrl: z.string().url().default(FIREWORKS_DEFAULT_BASE_URL),
  model: z.string().min(1).default(FIREWORKS_DEFAULT_MODEL),
  reasoningEffort: z.enum(['high', 'max']).default('high'),
  serviceTier: z.enum(['standard', 'priority', 'fast', 'background']).default('standard'),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().positive().optional(),
  seed: z.number().int().optional(),
});

export type FireworksConfig = z.infer<typeof fireworksConfigSchema>;

/** Raw overrides (e.g. from CLI flags). Undefined fields fall through to env/config. */
export interface FireworksOverrides {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  reasoningEffort?: 'high' | 'max';
  serviceTier?: 'standard' | 'priority' | 'fast' | 'background';
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

/** Options for {@link resolveFireworksConfig}. */
export interface ResolveFireworksOptions {
  /**
   * A fully-resolved layered config (from `@glamfire/config`'s `loadConfig`).
   * When omitted, the built-in defaults layer is used, so this function works
   * with zero config files (and existing call sites keep behaving identically).
   */
  config?: GlamConfig;
}

type EnvLike = Record<string, string | undefined>;

function pick(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (v !== undefined && v !== '') return v;
  return undefined;
}

/**
 * Resolve a validated FireworksConfig from a layered `GlamConfig` (providers,
 * run defaults, credential reference) overlaid with adapter-specific env vars
 * and explicit overrides. Precedence, lowest -> highest:
 *   config (defaults < user toml < project toml) < FIREWORKS_* env < overrides.
 *
 * Throws a clear, actionable error if required values are missing or invalid —
 * never silently falls back (SPEC §6).
 */
export function resolveFireworksConfig(
  env: EnvLike,
  overrides: FireworksOverrides = {},
  options: ResolveFireworksOptions = {},
): FireworksConfig {
  const config = options.config ?? builtinDefaults();
  const provider = config.providers.fireworks;
  const run = config.run;

  // API key: explicit override, else resolve the provider's credential reference
  // (env var or OS keychain). The reveal() here is the single, legitimate
  // provider-boundary read; the value never enters logs or the config object.
  const credential = resolveCredential(provider.credential, env);
  const apiKey = pick(overrides.apiKey, credential?.reveal());
  if (apiKey === undefined) {
    const source = describeCredentialRef(provider.credential);
    throw new Error(
      `no Fireworks API key: ${source} is not set (required to call GLM 5.2 on Fireworks)`,
    );
  }

  const candidate: Record<string, unknown> = {
    apiKey,
    baseUrl: pick(overrides.baseUrl, env.FIREWORKS_BASE_URL, provider.baseUrl),
    model: pick(overrides.model, env.FIREWORKS_MODEL, config.model),
    reasoningEffort: overrides.reasoningEffort ?? env.FIREWORKS_REASONING_EFFORT ?? run.effort,
    serviceTier: overrides.serviceTier ?? env.FIREWORKS_SERVICE_TIER ?? run.tier,
  };

  if (overrides.temperature !== undefined) candidate.temperature = overrides.temperature;
  else if (env.FIREWORKS_TEMPERATURE !== undefined && env.FIREWORKS_TEMPERATURE !== '') {
    candidate.temperature = Number(env.FIREWORKS_TEMPERATURE);
  } else candidate.temperature = run.temperature;

  if (overrides.maxTokens !== undefined) candidate.maxTokens = overrides.maxTokens;
  else if (run.budget.maxTokens !== undefined) candidate.maxTokens = run.budget.maxTokens;

  if (overrides.seed !== undefined) candidate.seed = overrides.seed;

  // Drop undefined so zod defaults apply.
  for (const k of Object.keys(candidate)) {
    if (candidate[k] === undefined) delete candidate[k];
  }

  const parsed = fireworksConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  - ${i.path.map(String).join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`invalid Fireworks configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
