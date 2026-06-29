// Provider configuration for the Fireworks GLM adapter, validated with zod.
//
// Resolution order (lowest -> highest precedence): built-in defaults -> env vars
// -> explicit overrides (e.g. CLI flags). Full layered TOML config
// (~/.glam/config.toml, ./glam.toml) is the @glamfire/config subsystem's job;
// this resolves the provider slice the adapter needs, honestly and for real.

import { z } from 'zod';

export const FIREWORKS_DEFAULT_BASE_URL = 'https://api.fireworks.ai/inference/v1';
/** Fireworks model id for GLM-5.2 serverless (research/02). */
export const FIREWORKS_DEFAULT_MODEL = 'accounts/fireworks/models/glm-5p2';

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

/** Raw overrides (e.g. from CLI flags). Undefined fields fall through to env/defaults. */
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

type EnvLike = Record<string, string | undefined>;

function pick(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (v !== undefined && v !== '') return v;
  return undefined;
}

/**
 * Resolve a validated FireworksConfig from environment + overrides. Throws a
 * clear, actionable error if required values are missing or invalid — never
 * silently falls back (SPEC §6).
 */
export function resolveFireworksConfig(
  env: EnvLike,
  overrides: FireworksOverrides = {},
): FireworksConfig {
  const candidate: Record<string, unknown> = {
    apiKey: pick(overrides.apiKey, env.FIREWORKS_API_KEY),
    baseUrl: pick(overrides.baseUrl, env.FIREWORKS_BASE_URL),
    model: pick(overrides.model, env.FIREWORKS_MODEL),
    reasoningEffort: overrides.reasoningEffort ?? env.FIREWORKS_REASONING_EFFORT,
    serviceTier: overrides.serviceTier ?? env.FIREWORKS_SERVICE_TIER,
  };
  if (overrides.temperature !== undefined) candidate.temperature = overrides.temperature;
  else if (env.FIREWORKS_TEMPERATURE !== undefined) {
    candidate.temperature = Number(env.FIREWORKS_TEMPERATURE);
  }
  if (overrides.maxTokens !== undefined) candidate.maxTokens = overrides.maxTokens;
  if (overrides.seed !== undefined) candidate.seed = overrides.seed;

  if (candidate.apiKey === undefined) {
    throw new Error('FIREWORKS_API_KEY is not set (required to call GLM 5.2 on Fireworks)');
  }

  // Drop undefined so zod defaults apply.
  for (const k of Object.keys(candidate)) {
    if (candidate[k] === undefined) delete candidate[k];
  }

  const parsed = fireworksConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`invalid Fireworks configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
