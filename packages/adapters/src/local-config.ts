// Provider configuration for the `local` adapter — ANY OpenAI-compatible
// endpoint the user runs themselves: Ollama, vLLM, SGLang, LM Studio, or
// antirez's DwarfStar/DS4 serving DeepSeek V4 Flash (research/26, research/27,
// issue #25). Resolved *through* the layered @glamfire/config subsystem
// (SPEC §6) and validated with zod — exactly like fireworks-glm / together /
// anthropic, so precedence and "fail loudly" behavior are identical.
//
// HONESTY CONTRACT (the difference vs hosted providers): glamfire cannot know
// what a self-hosted server serves. The USER declares the model id, context
// cap, capabilities, and (optionally) an internal cost-attribution price.
// Defaults are conservative floors, never optimistic guesses:
//   - capabilities: tool_calling + streaming only (the minimum a glam run needs)
//   - contextWindow: 32,768 tokens (the validated envelope of small local
//     models and DS4-Q2 per pi-ds4 — raise it when YOUR server really has more)
//   - price: $0/1M — the true marginal token price on owned hardware
//     (electricity/hardware are not billed per token; override only for
//     internal accounting, never invented by glamfire).
//
// A credential is OPTIONAL: most local servers (Ollama, LM Studio, DS4) need
// none; vLLM's --api-key mode is supported via providers.local.credential or
// GLAM_LOCAL_API_KEY.

import {
  type Capability,
  type GlamConfig,
  builtinDefaults,
  capabilitySchema,
  resolveCredential,
} from '@glamfire/config';
import { z } from 'zod';

/**
 * Default base URL for a local OpenAI-compatible server. Matches the built-in
 * `providers.local` default (vLLM/SGLang/DS4 convention). Ollama serves at
 * `http://localhost:11434/v1`, LM Studio at `http://localhost:1234/v1` — set
 * `providers.local.baseUrl` (or GLAM_LOCAL_BASE_URL) accordingly.
 */
export const LOCAL_DEFAULT_BASE_URL = 'http://localhost:8000/v1';
/** Ollama's OpenAI-compatible endpoint (https://docs.ollama.com/api/openai-compatibility). */
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1';
/** LM Studio's OpenAI-compatible endpoint (https://lmstudio.ai/docs/app/api/endpoints/openai). */
export const LMSTUDIO_DEFAULT_BASE_URL = 'http://localhost:1234/v1';
/** DwarfStar/DS4's dual-protocol server, OpenAI side (https://github.com/antirez/ds4). */
export const DWARFSTAR_DEFAULT_BASE_URL = 'http://127.0.0.1:8000/v1';

/** Conservative default context cap for an undeclared local model (tokens). */
export const LOCAL_DEFAULT_CONTEXT_WINDOW = 32_768;
/** Conservative default max output tokens for an undeclared local model. */
export const LOCAL_DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
/** The capability floor: what a local model gets unless the user declares more. */
export const LOCAL_DEFAULT_CAPABILITIES: Capability[] = ['tool_calling', 'streaming'];

const priceSchema = z.number().nonnegative();

export const localConfigSchema = z.object({
  /**
   * Optional bearer token (vLLM --api-key etc.). Empty/absent = send NO
   * Authorization header — most local servers neither need nor want one.
   */
  apiKey: z.string().optional(),
  baseUrl: z.string().url().default(LOCAL_DEFAULT_BASE_URL),
  /** The served model id — REQUIRED; glamfire never guesses what you serve. */
  model: z
    .string()
    .min(1, 'a local model id is required (providers.local.models / GLAM_LOCAL_MODEL / --model)'),
  /** User-declared context cap in tokens. */
  contextWindow: z.number().int().positive().default(LOCAL_DEFAULT_CONTEXT_WINDOW),
  /** User-declared max output tokens per turn. */
  maxOutputTokens: z.number().int().positive().default(LOCAL_DEFAULT_MAX_OUTPUT_TOKENS),
  /** User-declared capability tokens (the router's capability floor). */
  capabilities: z.array(capabilitySchema).default([...LOCAL_DEFAULT_CAPABILITIES]),
  /** USD per 1M input tokens — $0 default (self-host marginal price). */
  usdPerMInput: priceSchema.default(0),
  /** USD per 1M cached-input tokens — $0 default. */
  usdPerMCachedInput: priceSchema.default(0),
  /** USD per 1M output tokens — $0 default. */
  usdPerMOutput: priceSchema.default(0),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().positive().optional(),
  seed: z.number().int().optional(),
});

export type LocalConfig = z.infer<typeof localConfigSchema>;

/** Raw overrides (e.g. from CLI flags). Undefined fields fall through to env/config. */
export interface LocalOverrides {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities?: Capability[];
  usdPerMInput?: number;
  usdPerMCachedInput?: number;
  usdPerMOutput?: number;
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

/** Options for {@link resolveLocalConfig}. */
export interface ResolveLocalOptions {
  /** A fully-resolved layered config (from `@glamfire/config`'s `loadConfig`). */
  config?: GlamConfig;
}

type EnvLike = Record<string, string | undefined>;

function pick(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (v !== undefined && v !== '') return v;
  return undefined;
}

/**
 * Resolve a validated LocalConfig from the layered `GlamConfig`'s
 * `providers.local` slice overlaid with GLAM_LOCAL_* env vars and explicit
 * overrides. Precedence, lowest -> highest:
 *   config (defaults < user toml < project toml) < GLAM_LOCAL_* env < overrides.
 *
 * The model falls back to the FIRST entry of `providers.local.models`; when
 * neither that list, GLAM_LOCAL_MODEL, nor an override names a model, this
 * throws with exact instructions — glamfire never guesses what a self-hosted
 * server serves. No API key is required (local servers usually have none).
 */
export function resolveLocalConfig(
  env: EnvLike,
  overrides: LocalOverrides = {},
  options: ResolveLocalOptions = {},
): LocalConfig {
  const config = options.config ?? builtinDefaults();
  const provider = config.providers.local;
  const run = config.run;

  // Credential is OPTIONAL for local servers. When a reference is configured
  // but unresolvable we proceed keyless (the server may simply not need one);
  // an actually-required key then fails loudly at the provider boundary (401
  // with GLAM_LOCAL_API_KEY guidance).
  const credential = provider.credential ? resolveCredential(provider.credential, env) : undefined;
  const apiKey = pick(overrides.apiKey, env.GLAM_LOCAL_API_KEY, credential?.reveal());

  const model = pick(overrides.model, env.GLAM_LOCAL_MODEL, provider.models[0]);
  if (model === undefined) {
    throw new Error(
      'a local model id is required — glamfire never guesses what a self-hosted server serves. ' +
        'List the served model under providers.local.models in glam.toml, or set GLAM_LOCAL_MODEL, ' +
        'or pass --model <id>. (Ollama: the pulled model tag, e.g. "qwen3:0.6b"; vLLM: the served ' +
        'HF id; DwarfStar/DS4: the loaded GGUF variant.)',
    );
  }

  const candidate: Record<string, unknown> = {
    baseUrl: pick(overrides.baseUrl, env.GLAM_LOCAL_BASE_URL, provider.baseUrl),
    model,
  };
  if (apiKey !== undefined) candidate.apiKey = apiKey;

  const numeric = (raw: string | undefined): number | undefined => {
    if (raw === undefined || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  const contextWindow =
    overrides.contextWindow ?? numeric(env.GLAM_LOCAL_CONTEXT_WINDOW) ?? provider.contextWindow;
  if (contextWindow !== undefined) candidate.contextWindow = contextWindow;

  const maxOutputTokens = overrides.maxOutputTokens ?? provider.maxOutputTokens;
  if (maxOutputTokens !== undefined) candidate.maxOutputTokens = maxOutputTokens;

  const capabilities = overrides.capabilities ?? provider.capabilities;
  if (capabilities !== undefined) candidate.capabilities = capabilities;

  for (const key of ['usdPerMInput', 'usdPerMCachedInput', 'usdPerMOutput'] as const) {
    const value = overrides[key] ?? provider[key];
    if (value !== undefined) candidate[key] = value;
  }

  if (overrides.temperature !== undefined) candidate.temperature = overrides.temperature;
  else {
    const envTemp = numeric(env.GLAM_LOCAL_TEMPERATURE);
    candidate.temperature = envTemp ?? run.temperature;
  }

  if (overrides.maxTokens !== undefined) candidate.maxTokens = overrides.maxTokens;
  else if (run.budget.maxTokens !== undefined) candidate.maxTokens = run.budget.maxTokens;

  if (overrides.seed !== undefined) candidate.seed = overrides.seed;

  // Drop undefined so zod defaults apply.
  for (const k of Object.keys(candidate)) {
    if (candidate[k] === undefined) delete candidate[k];
  }

  const parsed = localConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  - ${i.path.map(String).join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(
      `invalid local (self-host) provider configuration:\n${issues.join('\n')}\nPoint providers.local at your OpenAI-compatible server (Ollama: http://localhost:11434/v1, vLLM/DS4: http://localhost:8000/v1, LM Studio: http://localhost:1234/v1) and list the served model id under providers.local.models.`,
    );
  }
  // maxOutputTokens can never exceed the declared context window (fail loud,
  // never silently emit an impossible capability surface).
  if (parsed.data.maxOutputTokens > parsed.data.contextWindow) {
    throw new Error(
      `invalid local provider configuration: maxOutputTokens (${parsed.data.maxOutputTokens}) ` +
        `exceeds contextWindow (${parsed.data.contextWindow})`,
    );
  }
  return parsed.data;
}
