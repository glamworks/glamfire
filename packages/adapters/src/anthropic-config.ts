// Provider configuration for the `anthropic` adapter (Claude family), resolved
// *through* the layered @glamfire/config subsystem (SPEC §6) and validated with
// zod — exactly like fireworks-glm, so credential handling, precedence, and
// "fail loudly" behavior are identical across adapters.
//
// The adapter needs a flat provider slice (apiKey, baseUrl, model, the Messages
// API version, and the per-call knobs the Messages API actually accepts). That
// slice is derived from a fully-resolved `GlamConfig`, overlaid with
// adapter-specific env vars (ANTHROPIC_*) and explicit overrides (CLI flags).
// The API key is resolved from the provider's credential reference (env var or
// OS keychain) — never inline, never logged.

import {
  type GlamConfig,
  builtinDefaults,
  describeCredentialRef,
  resolveCredential,
} from '@glamfire/config';
import { z } from 'zod';

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
/** Default Claude model for edge escalation / migration parity (SPEC §5.4). */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-8';
/** The Messages API version header value (`anthropic-version`). */
export const ANTHROPIC_DEFAULT_VERSION = '2023-06-01';

export const anthropicConfigSchema = z.object({
  apiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required to call Claude'),
  baseUrl: z.string().url().default(ANTHROPIC_DEFAULT_BASE_URL),
  model: z.string().min(1).default(ANTHROPIC_DEFAULT_MODEL),
  /** Sent as the `anthropic-version` header on every request. */
  apiVersion: z.string().min(1).default(ANTHROPIC_DEFAULT_VERSION),
  /**
   * `max_tokens` is REQUIRED by the Messages API (unlike OpenAI's optional
   * cap), so it always carries a value. The run budget overrides this default.
   */
  maxTokens: z.number().int().positive().default(4096),
  /**
   * Optional sampling temperature [0,1]. Omitted by default: Claude Opus 4.8 /
   * 4.7 reject `temperature` with a 400, so we only send it when a caller (or
   * an older-model deployment) explicitly opts in.
   */
  temperature: z.number().min(0).max(1).optional(),
  /**
   * Optional reasoning effort -> `output_config.effort`. Omitted by default
   * (which the API treats as `high`). Only sent when explicitly configured.
   */
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
});

export type AnthropicConfig = z.infer<typeof anthropicConfigSchema>;

/** Raw overrides (e.g. from CLI flags). Undefined fields fall through to env/config. */
export interface AnthropicOverrides {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  apiVersion?: string;
  maxTokens?: number;
  temperature?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/** Options for {@link resolveAnthropicConfig}. */
export interface ResolveAnthropicOptions {
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
 * Resolve a validated AnthropicConfig from a layered `GlamConfig` (provider
 * base URL + credential reference) overlaid with adapter-specific env vars and
 * explicit overrides. Precedence, lowest -> highest:
 *   config (defaults < user toml < project toml) < ANTHROPIC_* env < overrides.
 *
 * The default model is NOT taken from `config.model` (that headlines the GLM
 * workhorse); it falls back to the first declared anthropic model, then to
 * {@link ANTHROPIC_DEFAULT_MODEL}.
 *
 * Throws a clear, actionable error if required values are missing or invalid —
 * never silently falls back (SPEC §6).
 */
export function resolveAnthropicConfig(
  env: EnvLike,
  overrides: AnthropicOverrides = {},
  options: ResolveAnthropicOptions = {},
): AnthropicConfig {
  const config = options.config ?? builtinDefaults();
  const provider = config.providers.anthropic;

  // API key: explicit override, else resolve the provider's credential
  // reference (env var or OS keychain). The reveal() here is the single,
  // legitimate provider-boundary read; it never enters logs or the config.
  const credential = resolveCredential(provider.credential, env);
  const apiKey = pick(overrides.apiKey, credential?.reveal());
  if (apiKey === undefined) {
    const source = describeCredentialRef(provider.credential);
    throw new Error(
      `no Anthropic API key: ${source} is not set (required to call Claude on Anthropic)`,
    );
  }

  const candidate: Record<string, unknown> = {
    apiKey,
    baseUrl: pick(overrides.baseUrl, env.ANTHROPIC_BASE_URL, provider.baseUrl),
    model: pick(overrides.model, env.ANTHROPIC_MODEL, provider.models[0]),
    apiVersion: pick(overrides.apiVersion, env.ANTHROPIC_VERSION),
  };

  if (overrides.maxTokens !== undefined) candidate.maxTokens = overrides.maxTokens;
  else if (config.run.budget.maxTokens !== undefined) {
    candidate.maxTokens = config.run.budget.maxTokens;
  }

  if (overrides.temperature !== undefined) candidate.temperature = overrides.temperature;
  else if (env.ANTHROPIC_TEMPERATURE !== undefined && env.ANTHROPIC_TEMPERATURE !== '') {
    candidate.temperature = Number(env.ANTHROPIC_TEMPERATURE);
  }

  if (overrides.effort !== undefined) candidate.effort = overrides.effort;
  else if (env.ANTHROPIC_EFFORT !== undefined && env.ANTHROPIC_EFFORT !== '') {
    candidate.effort = env.ANTHROPIC_EFFORT;
  }

  // Drop undefined so zod defaults apply.
  for (const k of Object.keys(candidate)) {
    if (candidate[k] === undefined) delete candidate[k];
  }

  const parsed = anthropicConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  - ${i.path.map(String).join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`invalid Anthropic configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
