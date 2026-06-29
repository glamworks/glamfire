// Provider configuration for the `together` adapter (Together AI), resolved
// *through* the layered @glamfire/config subsystem (SPEC §6) and validated with
// zod — exactly like fireworks-glm and anthropic, so credential handling,
// precedence, and "fail loudly" behavior are identical across adapters.
//
// Together AI is an OpenAI-compatible, US-hosted (SOC 2 Type 2 + HIPAA) peer to
// Fireworks with an explicit Zero Data Retention opt-in (research/23 §2). It
// serves BOTH GLM-5.2 (`zai-org/GLM-5.2`, at FP4 — a quantization downgrade vs
// Fireworks FP8) and Qwen3-Coder-Next (`Qwen/Qwen3-Coder-Next`, FP8, via a
// dedicated endpoint). Base URL `https://api.together.xyz/v1`, Bearer auth.
//
// The API key is resolved from the provider's credential reference (env var or
// OS keychain) — never inline, never logged.

import {
  type GlamConfig,
  builtinDefaults,
  describeCredentialRef,
  resolveCredential,
} from '@glamfire/config';
import { z } from 'zod';

export const TOGETHER_DEFAULT_BASE_URL = 'https://api.together.xyz/v1';
/** GLM-5.2 on Together (HF-style id), served at FP4 (research/23 §2). */
export const TOGETHER_GLM_MODEL = 'zai-org/GLM-5.2';
/** Qwen3-Coder-Next on Together (HF-style id), FP8, dedicated endpoint (research/23 §1). */
export const TOGETHER_QWEN_MODEL = 'Qwen/Qwen3-Coder-Next';

export const togetherConfigSchema = z.object({
  apiKey: z.string().min(1, 'TOGETHER_API_KEY is required to call Together AI'),
  baseUrl: z.string().url().default(TOGETHER_DEFAULT_BASE_URL),
  model: z.string().min(1).default(TOGETHER_GLM_MODEL),
  /**
   * Reasoning effort for thinking models (GLM-5.2). Ignored for the non-thinking
   * Qwen3-Coder-Next, which the adapter never sends `reasoning_effort` for.
   */
  reasoningEffort: z.enum(['high', 'max']).default('high'),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().positive().optional(),
  seed: z.number().int().optional(),
});

export type TogetherConfig = z.infer<typeof togetherConfigSchema>;

/** Raw overrides (e.g. from CLI flags). Undefined fields fall through to env/config. */
export interface TogetherOverrides {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  reasoningEffort?: 'high' | 'max';
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

/** Options for {@link resolveTogetherConfig}. */
export interface ResolveTogetherOptions {
  /**
   * A fully-resolved layered config (from `@glamfire/config`'s `loadConfig`).
   * When omitted, the built-in defaults layer is used, so this function works
   * with zero config files.
   */
  config?: GlamConfig;
}

type EnvLike = Record<string, string | undefined>;

function pick(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (v !== undefined && v !== '') return v;
  return undefined;
}

/**
 * Resolve a validated TogetherConfig from a layered `GlamConfig` (provider base
 * URL + credential reference) overlaid with adapter-specific env vars and
 * explicit overrides. Precedence, lowest -> highest:
 *   config (defaults < user toml < project toml) < TOGETHER_* env < overrides.
 *
 * The default model is NOT taken from `config.model` (that headlines the GLM
 * workhorse on Fireworks); it falls back to the first declared together model,
 * then to {@link TOGETHER_GLM_MODEL}.
 *
 * Throws a clear, actionable error if required values are missing or invalid —
 * never silently falls back (SPEC §6).
 */
export function resolveTogetherConfig(
  env: EnvLike,
  overrides: TogetherOverrides = {},
  options: ResolveTogetherOptions = {},
): TogetherConfig {
  const config = options.config ?? builtinDefaults();
  const provider = config.providers.together;
  const run = config.run;

  // API key: explicit override, else resolve the provider's credential reference
  // (env var or OS keychain). The reveal() here is the single, legitimate
  // provider-boundary read; the value never enters logs or the config object.
  const credential = resolveCredential(provider.credential, env);
  const apiKey = pick(overrides.apiKey, credential?.reveal());
  if (apiKey === undefined) {
    const source = describeCredentialRef(provider.credential);
    throw new Error(
      `no Together API key: ${source} is not set (required to call GLM-5.2 / Qwen3-Coder-Next on Together AI)`,
    );
  }

  const candidate: Record<string, unknown> = {
    apiKey,
    baseUrl: pick(overrides.baseUrl, env.TOGETHER_BASE_URL, provider.baseUrl),
    model: pick(overrides.model, env.TOGETHER_MODEL, provider.models[0]),
    reasoningEffort: overrides.reasoningEffort ?? env.TOGETHER_REASONING_EFFORT ?? run.effort,
  };

  if (overrides.temperature !== undefined) candidate.temperature = overrides.temperature;
  else if (env.TOGETHER_TEMPERATURE !== undefined && env.TOGETHER_TEMPERATURE !== '') {
    candidate.temperature = Number(env.TOGETHER_TEMPERATURE);
  } else candidate.temperature = run.temperature;

  if (overrides.maxTokens !== undefined) candidate.maxTokens = overrides.maxTokens;
  else if (run.budget.maxTokens !== undefined) candidate.maxTokens = run.budget.maxTokens;

  if (overrides.seed !== undefined) candidate.seed = overrides.seed;

  // Drop undefined so zod defaults apply.
  for (const k of Object.keys(candidate)) {
    if (candidate[k] === undefined) delete candidate[k];
  }

  const parsed = togetherConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  - ${i.path.map(String).join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`invalid Together configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
